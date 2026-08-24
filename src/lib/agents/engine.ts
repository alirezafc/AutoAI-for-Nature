import { z } from "zod";
import type { ChatMessage } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured-output";
import { routerChat } from "@/lib/ai/router";
import {
  IdeaSchema,
  StrategySchema,
  ResearchSchema,
  ArticleSchema,
  CriticSchema,
  SeoSchema,
  PublishSchema,
  LessonSchema,
  FinalCriticSchema,
  type Idea,
  type Strategy,
  type Research,
  type Article,
  type Critic,
  type Seo,
  type Publish,
  type LessonOutput,
  type FinalCritic,
} from "./contracts";
import {
  createRun,
  getRunWithSteps,
  updateRun,
  createStep,
  updateStep,
  markStepStarted,
  markStepCompleted,
  markStepFailed,
  failRun,
  type StepStatus,
} from "@/lib/services/agent-runs";
import { getAgentConfig, listActiveLessons } from "@/lib/services/agent-config";
import { modelConfigStore } from "@/lib/services/model-config";
import { getSetting } from "@/lib/services/system-settings";
import { updatePost, setPostStatus } from "@/lib/services/posts";
import { lessons as lessonsTable, agentSteps as agentStepsTable } from "@/db/schema";
import { getDb } from "@/db/client";
import { logger, withRun } from "@/lib/logging";
import { errorMessage } from "@/lib/ai/errors";
import { assertRealProviderReady } from "@/lib/ai/production-guard";
import type { StructuredPurpose } from "@/lib/ai/structured-output";

const PURPOSE_BY_AGENT: Record<string, StructuredPurpose> = {
  idea: "idea",
  strategist: "strategist",
  researcher: "researcher",
  writer: "writer",
  critic: "critic",
  seo: "seo",
  publisher: "publisher",
  final_critic: "final_critic",
  lessons: "lessons",
};

// Every purpose a full article run exercises, including "embedding" because
// publishing feeds the article into RAG via the real embedding provider.
export const ARTICLE_RUN_PURPOSES = [
  "idea",
  "strategist",
  "researcher",
  "writer",
  "critic",
  "seo",
  "publisher",
  "final_critic",
  "lessons",
  "embedding",
] as const;

export interface StartRunInput {
  topic: string;
  language: "en" | "fa";
  categoryId?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * In demo mode (mock provider) the pipeline would otherwise finish in under
 * two seconds, so the admin timeline animates nothing. Pace each agent step so
 * users can watch the pipeline progress live, just like a real run.
 */
async function demoPace(agent: string): Promise<void> {
  try {
    const cfg = await modelConfigStore.getPurposeConfig((PURPOSE_BY_AGENT[agent] ?? "writer") as never);
    const isMock = !cfg || cfg.primaryProvider === "mock" || cfg.fallbackProvider === "mock";
    if (!isMock) return;
    await sleep(650 + Math.floor(Math.random() * 450));
  } catch {
    await sleep(650);
  }
}

export async function startArticleRun(input: StartRunInput): Promise<{ runId: string; postId: string }> {
  // Fail fast BEFORE creating run/post rows: without a real provider the run
  // would either fail mid-pipeline or silently produce mock content.
  await assertRealProviderReady([...ARTICLE_RUN_PURPOSES], modelConfigStore);
  const { run, post } = await createRun(input);
  const runId = run.id;
  const postId = post?.id ?? run.postId;
  if (!postId) throw new Error("Failed to reserve a post for the run");
  // Fire-and-forget background execution. State is persisted so status can be
  // polled. On serverless deployments this is the extension point where a
  // durable worker would pick up queued runs.
  void executeArticleRun(runId).catch((err) => {
    void failRun(runId, errorMessage(err));
  });
  return { runId, postId };
}

export async function startRegeneration(input: StartRunInput & { postId: string }): Promise<{ runId: string; postId: string }> {
  await assertRealProviderReady([...ARTICLE_RUN_PURPOSES], modelConfigStore);
  const { run, post } = await createRun({ ...input, postId: input.postId, runType: "regeneration" });
  const runId = run.id;
  void executeArticleRun(runId).catch((err) => {
    void failRun(runId, errorMessage(err));
  });
  return { runId, postId: post?.id ?? input.postId };
}

async function agentStep<T>(
  runId: string,
  agent: string,
  opts: {
    schema: z.ZodType<T>;
    messages: ChatMessage[];
    revision?: number;
    score?: number | null;
  }
): Promise<{ output: T; provider: string; model: string; latencyMs: number; stepId: string } | null> {
  const config = await getAgentConfig(agent);
  const log = withRun(runId);

  const step = await createStep(runId, agent, opts.revision ?? 0);
  await updateStep(step.id, {
    inputSummary: opts.messages
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
      .join("\n")
      .slice(0, 2000),
  });
  if (config && !config.enabled) {
    await markStepCompleted(step.id, {
      provider: "none",
      model: "disabled",
      outputSummary: "Agent disabled in configuration",
      output: { skipped: true },
    });
    return null;
  }

  await markStepStarted(step.id);
  let provider = "unknown";
  let model = "unknown";
  let retries = 0;
  let lastLatencyMs = 0;
  try {
    const lessons = await listActiveLessons(agent);
    const systemParts = [config?.prompt ?? defaultSystemPrompt(agent)];
    if (lessons.length) {
      systemParts.push(
        "Active lessons from past runs. Follow them:\n- " +
          lessons.map((l) => l.lesson).join("\n- ")
      );
    }
    const messages: ChatMessage[] = [
      { role: "system", content: systemParts.join("\n\n") },
      ...opts.messages,
    ];

    const purpose = PURPOSE_BY_AGENT[agent] ?? "writer";
    const result = await generateStructured(opts.schema, {
      purpose,
      messages,
      runId,
      temperature: config?.temperature,
      maxTokens: config?.maxTokens,
      store: modelConfigStore,
      onResult: (info) => {
        provider = info.provider;
        model = info.model;
        lastLatencyMs = info.latencyMs;
      },
      onAttempt: (info) => {
        if (!info.ok) {
          // A failed attempt still proves which provider/model was tried.
          if (info.provider && info.provider !== "unknown") {
            provider = info.provider;
            model = info.model;
          }
        } else {
          retries = info.attempt;
        }
      },
    });
    const output = result.data;
    retries = result.retries;

    const summary = JSON.stringify(output).slice(0, 400);
    const stepScore =
      opts.score ??
      (typeof (output as { score?: unknown }).score === "number"
        ? (output as { score: number }).score
        : null);
    await markStepCompleted(step.id, {
      provider,
      model,
      outputSummary: summary,
      output,
      score: stepScore,
      retries,
    });

    log.info(`agent ${agent} completed (${provider}/${model}, retries=${retries})`);
    return { output, provider, model, latencyMs: lastLatencyMs, stepId: step.id };
  } catch (err) {
    const attemptDetail = `${provider}/${model}, retries=${retries}`;
    const failureText = `${errorMessage(err)} [provider=${attemptDetail}]`;
    await markStepFailed(step.id, failureText, { provider, model, retries });
    log.error(`agent ${agent} failed (${attemptDetail}): ${errorMessage(err)}`);
    throw err;
  }
}

function defaultSystemPrompt(agent: string): string {
  return `You are the ${agent} agent in the AutoAI editorial newsroom about nature, wildlife and the environment.`;
}

export async function executeArticleRun(runId: string): Promise<void> {
  const log = withRun(runId);
  const run = await getRunWithSteps(runId);
  if (!run) return;
  // A run already marked running is normally being executed elsewhere. But a
  // crashed worker leaves zombie "running" rows behind — after a grace period
  // they are re-executable so every run eventually reaches a terminal state.
  if (run.status === "running") {
    const startedMs = run.startedAt ? new Date(run.startedAt).getTime() : 0;
    const staleForMs = Date.now() - startedMs;
    if (staleForMs < 10 * 60_000) return;
    log.warn(`run ${runId} stale in "running" for ${Math.round(staleForMs / 1000)}s — re-executing`);
  } else if (run.status === "cancelled") {
    return;
  }

  await updateRun(runId, { status: "running", startedAt: new Date(), error: null });
  const execStartedMs = Date.now();
  const lang = (run.language as "en" | "fa") ?? "en";
  const topic = run.topic || "Nature";
  const revisionSettings = await getSetting("agent.revision");
  const threshold = revisionSettings.threshold;

  try {
    // 1. Idea Scout
    const ideaStep = await agentStep(runId, "idea", {
      schema: IdeaSchema,
      messages: [{ role: "user", content: `Topic: ${topic}\nLanguage: ${lang}` }],
    });
    await demoPace("idea");
    const idea: Idea = ideaStep?.output ?? { ideas: [{ title: topic, rationale: "Direct assignment" }] };
    const chosenTitle = idea.ideas[0]?.title ?? topic;

    // 2. Strategist
    const stratStep = await agentStep(runId, "strategist", {
      schema: StrategySchema,
      messages: [
        {
          role: "user",
          content: `Article idea: ${chosenTitle}\nTopic: ${topic}\nLanguage: ${lang}\nIdeas:\n${idea.ideas.map((i) => `- ${i.title} (${i.rationale})`).join("\n")}`,
        },
      ],
    });
    await demoPace("strategist");
    const strategy: Strategy = stratStep?.output ?? {
      angle: topic,
      audience: "General readers",
      tone: "accessible",
      keyPoints: [],
      outline: ["Introduction", "Main body", "Conclusion"],
    };

    // 3. Researcher
    const resStep = await agentStep(runId, "researcher", {
      schema: ResearchSchema,
      messages: [
        {
          role: "user",
          content: `Article idea: ${chosenTitle}\nLanguage: ${lang}\nStrategy:\nAngle: ${strategy.angle}\nOutline:\n${strategy.outline.map((o) => `- ${o}`).join("\n")}`,
        },
      ],
    });
    const research: Research = resStep?.output ?? {
      summary: "",
      findings: [{ fact: topic, source: "knowledge base", confidence: 0.9 }],
    };
    await demoPace("researcher");

    // 4. Writer + Critic revision loop
    let revision = 0;
    let article: Article = { title: chosenTitle, excerpt: "", content: "" };
    let critic: Critic | null = null;

    while (true) {
      const writerStep = await agentStep(runId, "writer", {
        schema: ArticleSchema,
        revision,
        messages: [
          {
            role: "user",
            content: [
              `Title: ${chosenTitle}`,
              `Language: ${lang}`,
              `[ROUND: ${revision + 1}]`,
              `Strategy:\nAngle: ${strategy.angle}\nTone: ${strategy.tone}\nKey points:\n${strategy.keyPoints.map((p) => `- ${p}`).join("\n")}\nOutline:\n${strategy.outline.map((o) => `- ${o}`).join("\n")}`,
              `Research:\nSummary: ${research.summary}\n${research.findings.map((f) => `- ${f.fact} (source: ${f.source}, confidence: ${f.confidence})`).join("\n")}`,
              critic && critic.issues.length
                ? `Revision feedback from the Critic (score ${critic.score}):\nIssues:\n${critic.issues.map((i) => `- ${i}`).join("\n")}\nSuggestions:\n${critic.suggestions.map((s) => `- ${s}`).join("\n")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      });
      if (writerStep) article = writerStep.output;
      await demoPace("writer");

      const criticStep = await agentStep(runId, "critic", {
        schema: CriticSchema,
        revision,
        messages: [
          {
            role: "user",
            content: `Language: ${lang}\nQuality threshold: ${threshold}\n[ROUND: ${revision + 1}]\nArticle title: ${article.title}\n\n${article.content}`,
          },
        ],
      });
      critic = criticStep ? (criticStep.output as Critic) : null;
      await demoPace("critic");

      if (!critic) break;
      if (critic.score >= threshold) break;
      if (revision < revisionSettings.maxRounds) {
        revision++;
        continue;
      }
      break;
    }

    const approved = (critic?.score ?? 0) >= threshold;
    let continuePipeline = true;
    let targetStatus: "published" | "needs_review" | "draft" = "needs_review";

    if (approved) {
      targetStatus = revisionSettings.onMaxReached === "publish" ? "published" : "needs_review";
    } else if (revisionSettings.onMaxReached === "draft") {
      continuePipeline = false;
      targetStatus = "draft";
    } else if (revisionSettings.onMaxReached === "publish") {
      targetStatus = "published";
    } else {
      targetStatus = "needs_review";
    }

    // 5. SEO
    let seo: Seo | null = null;
    if (continuePipeline) {
      const seoStep = await agentStep(runId, "seo", {
        schema: SeoSchema,
        messages: [
          {
            role: "user",
            content: `Language: ${lang}\nArticle title: ${article.title}\nExcerpt: ${article.excerpt}\n\n${article.content}`,
          },
        ],
      });
      seo = seoStep ? (seoStep.output as Seo) : null;
      await demoPace("seo");
    }

    // 6. Publisher
    let publish: Publish | null = null;
    if (continuePipeline) {
      const pubStep = await agentStep(runId, "publisher", {
        schema: PublishSchema,
        messages: [
          {
            role: "user",
            content: `Language: ${lang}\nFinal critic score: ${critic?.score ?? "n/a"}\nArticle title: ${article.title}`,
          },
        ],
      });
      publish = pubStep ? (pubStep.output as Publish) : null;
      await demoPace("publisher");
    }

    // 7. Final Critic
    let finalCritic: FinalCritic | null = null;
    if (continuePipeline) {
      const fcStep = await agentStep(runId, "final_critic", {
        schema: FinalCriticSchema,
        messages: [
          {
            role: "user",
            content: `Language: ${lang}\nReview the complete article and its SEO metadata.\nSEO:\n${seo ? JSON.stringify(seo) : "n/a"}\n\n${article.content}`,
          },
        ],
      });
      finalCritic = fcStep ? (fcStep.output as FinalCritic) : null;
      await demoPace("final_critic");
    }

    // 8. Lessons
    const lessonsStep = await agentStep(runId, "lessons", {
      schema: LessonSchema,
      messages: [
        {
          role: "user",
          content: `Language: ${lang}\nFinal article title: ${article.title}\nCritic feedback:\nIssues: ${critic?.issues.join("; ") ?? "none"}\nSuggestions: ${critic?.suggestions.join("; ") ?? "none"}`,
        },
      ],
    });
    const lessonOutput: LessonOutput = lessonsStep?.output ?? { lessons: [] };
    await persistLessons(runId, lessonOutput);

    // 9. Update the post
    if (run.postId) {
      const seoUpdate = seo
        ? {
            metaTitle: seo.metaTitle,
            metaDescription: seo.metaDescription,
            keywords: seo.keywords,
            faq: seo.faq,
            structuredData: seo.structuredData,
          }
        : undefined;
      await updatePost(
        run.postId,
        {
          title: article.title,
          content: article.content,
          excerpt: article.excerpt,
          slug: seo?.slug,
          seo: seoUpdate,
          status: "needs_review",
        },
        "system"
      );

      if (targetStatus === "published") {
        await setPostStatus(run.postId, "published", "system");
      } else {
        await setPostStatus(run.postId, targetStatus === "draft" ? "draft" : "needs_review", "system");
      }
    }

    const duration = Date.now() - execStartedMs;
    if (targetStatus === "published") {
      await updateRun(runId, { status: "completed", finishedAt: new Date(), durationMs: duration });
    } else {
      await updateRun(runId, { status: "waiting_for_human", finishedAt: new Date(), durationMs: duration });
    }
    log.info(`article run finished, targetStatus=${targetStatus}, finalScore=${finalCritic?.finalScore ?? critic?.score}`);
  } catch (err) {
    log.error(`article run failed: ${errorMessage(err)}`);
    await failRun(runId, errorMessage(err));
  }
}

async function persistLessons(runId: string, output: LessonOutput): Promise<void> {
  const c = await getDb();
  for (const l of output.lessons.slice(0, 8)) {
    try {
      await c.db.insert(lessonsTable).values({
        agent: l.agent,
        lesson: l.lesson,
        reason: l.reason,
        status: "active",
        approved: false,
        sourceRunId: runId,
      });
    } catch (err) {
      logger.warn(`failed to persist lesson`, { error: errorMessage(err) });
    }
  }
}

export async function getRunForPolling(runId: string) {
  const run = await getRunWithSteps(runId);
  return run;
}
