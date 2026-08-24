import path from "node:path";
import { eq } from "drizzle-orm";
import { loadEnv } from "./env";
loadEnv();

import { getDb } from "../src/db/client";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { createCategory, listCategories } from "../src/lib/services/categories";
import { createPost, setPostStatus, updatePost } from "../src/lib/services/posts";
import { createKnowledgeDocument, indexDocument, getKnowledgeDocumentByPostId } from "../src/lib/rag";
import { ensureAgentConfigs } from "../src/lib/services/agent-config";
import { ensureDefaultWorkflow } from "../src/lib/services/workflows";
import { ensureMcpTools } from "../src/lib/services/mcp-log";
import { setSetting, getDefaultSettings } from "../src/lib/services/system-settings";
import { createRun, createStep, markStepCompleted, updateRun } from "../src/lib/services/agent-runs";
import {
  categories as categoriesTable,
  posts as postsTable,
  voiceConfigs as voiceConfigsTable,
  feedback as feedbackTable,
  conversations as conversationsTable,
  messages as messagesTable,
  lessons as lessonsTable,
  agentRuns as agentRunsTable,
} from "../src/db/schema";
import { slugify } from "../src/lib/utils";

const log = (msg: string) => console.log(`[seed] ${msg}`);

// Seed scripts are DEVELOPMENT-ONLY: production must never be auto-seeded
// with 40+ demo articles, demo conversations, runs, lessons or feedback.
if (process.env.NODE_ENV === "production" && process.env.AUTOAI_ALLOW_DEMO_SEED !== "1") {
  console.error(
    "[seed] REFUSED: NODE_ENV=production. Demo seeding is disabled in production.\n" +
      "Override only with AUTOAI_ALLOW_DEMO_SEED=1 if you fully understand the consequences."
  );
  process.exit(1);
}

async function runMigrations() {
  const folder = path.join(process.cwd(), "drizzle");
  const c = await getDb();
  if (c.mode === "pglite") {
    await migratePglite(c.db, { migrationsFolder: folder });
  } else {
    await migratePostgres(c.db, { migrationsFolder: folder });
  }
}

const CATEGORY_DEFS = [
  { slug: "wildlife", nameEn: "Wildlife", nameFa: "حیات وحش", descEn: "Animals, species and ecosystems", descFa: "حیوانات، گونه‌ها و اکوسیستم‌ها", color: "#16a34a" },
  { slug: "conservation", nameEn: "Conservation", nameFa: "حفاظت", descEn: "Protecting nature and biodiversity", descFa: "حفاظت از طبیعت و تنوع زیستی", color: "#2563eb" },
  { slug: "climate", nameEn: "Climate", nameFa: "اقلیم", descEn: "Climate change and its impact", descFa: "تغییر اقلیم و اثرات آن", color: "#ea580c" },
  { slug: "oceans", nameEn: "Oceans", nameFa: "اقیانوس‌ها", descEn: "Marine life and ocean health", descFa: "زندگی دریایی و سلامت اقیانوس‌ها", color: "#0284c7" },
  { slug: "forests", nameEn: "Forests", nameFa: "جنگل‌ها", descEn: "Forests, trees and woodland ecology", descFa: "جنگل‌ها، درختان و بوم‌شناسی جنگل", color: "#15803d" },
  { slug: "sustainability", nameEn: "Sustainability", nameFa: "پایداری", descEn: "Sustainable living and clean energy", descFa: "زندگی پایدار و انرژی پاک", color: "#7c3aed" },
];

const EN_TOPICS = [
  "Why Coral Reefs Are Disappearing — and How to Save Them",
  "The Secret Life of Urban Foxes",
  "Rewilding Europe: Bringing Wolves Back to the Alps",
  "How Beavers Engineer Healthier Rivers",
  "The Great Monarch Butterfly Migration Explained",
  "Plastic in the Ocean: The Scale of the Crisis",
  "Restoring Mangrove Forests Along Tropical Coasts",
  "The Plight of the Mountain Gorilla",
  "Wildfire Management in a Warming Climate",
  "Pollinator Gardens: Helping Bees and Butterflies Thrive",
  "The Amazon: Earth's Carbon Sink Under Pressure",
  "Tracking Snow Leopards in the High Himalayas",
  "The Return of the Gray Whale in the North Atlantic",
  "Regenerative Farming and Soil Health",
  "The Role of Wetlands in Flood Protection",
  "Ocean Acidification and Shellfish Decline",
  "De-Extinction: Should We Bring Species Back?",
  "The Hidden Value of Old-Growth Forests",
  "Solar Energy and Wildlife: Finding the Balance",
  "Citizen Science: Everyday People Saving Species",
];

const FA_TOPICS = [
  "چرا صخره‌های مرجانی در حال نابودی هستند",
  "زندگی پنهان روباه‌های شهری",
  "بازگردانی گوزن‌های ایرانی به زیستگاه‌های طبیعی",
  "نقش سگ‌آبی در سلامت رودخانه‌ها",
  "کوچ بزرگ پروانه‌های شهریار",
  "بحران پلاستیک در اقیانوس‌ها",
  "بازسازی جنگل‌های مانگرو در سواحل گرمسیری",
  "وضعیت نگران‌کننده گوریل کوهستانی",
  "مدیریت آتش‌سوزی جنگل‌ها در اقلیم گرم‌شونده",
  "باغ‌های گرده‌افشان؛ کمک به زنبورها و پروانه‌ها",
  "آمازون؛ ریه زمین زیر فشار",
  "ردیابی پلنگ برفی در کوه‌های بلند",
  "بازگشت نهنگ خاکستری به اقیانوس اطلس",
  "کشاورزی احیاکننده و سلامت خاک",
  "نقش تالاب‌ها در مهار سیلاب",
  "اسیدی شدن اقیانوس‌ها و کاهش صدف‌ها",
  "انقراض‌زدایی؛ آیا باید گونه‌ها را بازگردانیم؟",
  "ارزش پنهان جنگل‌های کهنسال",
  "انرژی خورشیدی و حیات وحش؛ یافتن تعادل",
  "علم شهروندی؛ مردم عادی در نجات گونه‌ها",
];

const FA_HEADINGS: [string, string][] = [
  ["چرا اهمیت دارد؟", "اهمیت این موضوع برای آینده طبیعت"],
  ["آنچه محققان می‌گویند", "یافته‌های تازه پژوهشگران"],
  ["راهکارهای عملی", "اقدام‌هایی که هر یک از ما می‌توانیم انجام دهیم"],
  ["نگاه به آینده", "افق پیش روی این چالش زیست‌محیطی"],
];

const EN_HEADINGS: [string, string][] = [
  ["Why It Matters", "Why this topic matters for the future of nature"],
  ["What Researchers Say", "Fresh findings and perspectives from the scientific community"],
  ["What You Can Do", "Practical steps everyone can take"],
  ["Looking Ahead", "The horizon for this environmental challenge"],
];

function makeEnglishArticle(topic: string, headingIndex: number): { excerpt: string; content: string } {
  const sentences = [
    `${topic}. This is a defining environmental story of our time, and understanding it starts with looking closely at the evidence.`,
    `Scientists have been studying this topic for decades, and recent data confirms that ecosystems are responding faster than many models predicted.`,
    `The good news is that conservation efforts are already making a measurable difference in several regions, proving that coordinated action works.`,
    `Community involvement remains the single strongest predictor of long-term success in protecting natural habitats.`,
    `Policymakers, businesses and citizens each play a distinct role in shaping the outcome, and no single group can do it alone.`,
    `The coming decade will be decisive. Investments made now determine whether we protect these ecosystems or lose them.`,
  ];
  const paragraphs: string[] = [];
  EN_HEADINGS.forEach(([h, sub], i) => {
    const body = sentences
      .map((s) => ` ${s}`)
      .join("");
    paragraphs.push(`## ${h}\n\n${i === 0 ? `${topic} — ${sub}.` : sub}.${body}`);
  });
  const excerpt = sentences[0].replace(/\.$/, "").slice(0, 140) + ".";
  return { excerpt, content: paragraphs.join("\n\n") };
}

function makePersianArticle(topic: string, headingIndex: number): { excerpt: string; content: string } {
  const sentences = [
    `${topic}. این یکی از داستان‌های زیست‌محیطی تعیین‌کننده زمانه ماست و درک آن با نگاهی دقیق به شواهد آغاز می‌شود.`,
    `دانشمندان سال‌هاست این موضوع را بررسی می‌کنند و داده‌های تازه نشان می‌دهد اکوسیستم‌ها سریع‌تر از پیش‌بینی مدل‌ها در حال واکنش هستند.`,
    `خبر خوب این است که تلاش‌های حفاظتی در چند منطقه نتایج قابل سنجشی داشته است؛ اثبات این که اقدام هماهنگ مؤثر است.`,
    `مشارکت جامعه همچنان قوی‌ترین عامل پیش‌بینی موفقیت بلندمدت در حفاظت از زیستگاه‌های طبیعی است.`,
    `سیاست‌گذاران، کسب‌وکارها و شهروندان هر یک نقش مشخصی در شکل دادن به نتیجه دارند و هیچ گروهی به تنهایی نمی‌تواند کاری از پیش ببرد.`,
    `دهه پیش‌رو تعیین‌کننده خواهد بود. سرمایه‌گذاری‌های امروز مشخص می‌کند که آیا این اکوسیستم‌ها را حفظ می‌کنیم یا از دست می‌دهیم.`,
  ];
  const paragraphs: string[] = [];
  FA_HEADINGS.forEach(([h, sub], i) => {
    const body = sentences.map((s) => ` ${s}`).join("");
    paragraphs.push(`## ${h}\n\n${i === 0 ? `${topic} — ${sub}.` : sub}.${body}`);
  });
  const excerpt = sentences[0].replace(/\.$/, "").slice(0, 130) + ".";
  return { excerpt, content: paragraphs.join("\n\n") };
}

async function seed() {
  await runMigrations();
  const db = await getDb();
  log(`database mode: ${db.mode}`);

  // Categories
  const existingCategories = await listCategories();
  if (existingCategories.length === 0) {
    for (const cat of CATEGORY_DEFS) {
      await createCategory({
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameFa: cat.nameFa,
        descriptionEn: cat.descEn,
        descriptionFa: cat.descFa,
        color: cat.color,
      });
    }
    log(`created ${CATEGORY_DEFS.length} categories`);
  } else {
    log(`categories already present (${existingCategories.length}), skipping`);
  }

  const cats = await listCategories();
  const bySlug = new Map(cats.map((c) => [c.slug, c]));

  // System settings defaults
  const defaults = getDefaultSettings();
  for (const [key, value] of Object.entries(defaults)) {
    await setSetting(key as keyof typeof defaults, value);
  }
  log("system settings defaulted");

  // Agent configs, workflow, mcp catalog
  await ensureAgentConfigs("system");
  await ensureDefaultWorkflow();
  await ensureMcpTools();
  log("agent configs, workflow and MCP catalog ensured");

  // Voice config default
  const voice = await db.db.select().from(voiceConfigsTable).limit(1);
  if (voice.length === 0) {
    await db.db.insert(voiceConfigsTable).values({});
    log("default voice config created");
  }

  // Articles
  const existingPosts = await db.db.select().from(postsTable).limit(1);
  let createdCount = 0;
  if (existingPosts.length === 0) {
    for (let i = 0; i < EN_TOPICS.length; i++) {
      const topic = EN_TOPICS[i];
      const cat = bySlug.get(CATEGORY_DEFS[i % CATEGORY_DEFS.length].slug);
      const body = makeEnglishArticle(topic, i);
      const post = await createPost(
        {
          title: topic,
          excerpt: body.excerpt,
          content: body.content,
          language: "en",
          status: "draft",
          categoryId: cat?.id ?? null,
          isAiGenerated: true,
          authorName: "AutoAI",
          seo: {
            metaTitle: topic,
            metaDescription: body.excerpt,
            keywords: topic.split(/\s+/).slice(0, 5),
          },
        },
        "seed"
      );
      await setPostStatus(post.id, "published", "seed");
      const doc = await getKnowledgeDocumentByPostId(post.id);
      if (doc) await indexDocument(doc.id, `seed-en-${post.slug}`);
      createdCount++;
    }
    for (let i = 0; i < FA_TOPICS.length; i++) {
      const topic = FA_TOPICS[i];
      const cat = bySlug.get(CATEGORY_DEFS[i % CATEGORY_DEFS.length].slug);
      const body = makePersianArticle(topic, i);
      const post = await createPost(
        {
          title: topic,
          excerpt: body.excerpt,
          content: body.content,
          language: "fa",
          status: "draft",
          categoryId: cat?.id ?? null,
          isAiGenerated: true,
          authorName: "AutoAI",
          seo: {
            metaTitle: topic,
            metaDescription: body.excerpt,
            keywords: [topic.slice(0, 20)],
          },
        },
        "seed"
      );
      await setPostStatus(post.id, "published", "seed");
      const doc = await getKnowledgeDocumentByPostId(post.id);
      if (doc) await indexDocument(doc.id, `seed-fa-${post.slug}`);
      createdCount++;
    }
    log(`seeded ${createdCount} published articles and indexed their knowledge chunks`);
  } else {
    log("posts already present, skipping article seeding");
  }

  // Curated knowledge documents
  const curated = await db.db.select().from(postsTable).limit(1);
  if (curated.length === 0) {
    const curatedDocs = [
      {
        title: "Encyclopedia: Wetland Ecosystems",
        content: "Wetlands are transitional zones between terrestrial and aquatic systems. They store floodwater, filter pollutants, recharge groundwater and provide habitat for a remarkable diversity of birds, amphibians and fish. Globally, wetlands are being lost three times faster than forests.",
        language: "en" as const,
      },
      {
        title: "دایرةالمعارف: اکوسیستم‌های تالابی",
        content: "تالاب‌ها مناطق گذار میان سیستم‌های خشکی و آبی هستند. آن‌ها آب سیلاب را ذخیره می‌کنند، آلودگی‌ها را تصفیه می‌کنند، آب زیرزمینی را تغذیه می‌کنند و زیستگاه تنوع چشمگیری از پرندگان، ماهی‌ها و دوزیستان‌اند. در سطح جهانی، تالاب‌ها سه برابر سریع‌تر از جنگل‌ها در حال از بین رفتن‌اند.",
        language: "fa" as const,
      },
    ];
    for (const doc of curatedDocs) {
      const created = await createKnowledgeDocument({ ...doc, author: "AutoAI", sourceType: "curated", status: "active" });
      await indexDocument(created.id, "seed-curated");
    }
    log("curated knowledge documents created and indexed");
  }

  // Sample agent run (completed pipeline, for the visualization)
  const existingRuns = await db.db.select().from(agentRunsTable).limit(1).catch(() => []);
  if (existingRuns.length === 0) {
    const cat = bySlug.get("wildlife");
    const { run, post: seededPost } = await createRun({
      topic: "Mountain wildlife corridors",
      language: "en",
      categoryId: cat?.id ?? null,
    });
    const post = seededPost!;
    const steps: { agent: string; summary: string; score?: number }[] = [
      { agent: "idea", summary: "Ideas: Building wildlife corridors across fragmented mountain habitats." },
      { agent: "strategist", summary: "Angle: science-backed conservation; audience: general readers." },
      { agent: "researcher", summary: "3 findings with sources and confidence scores." },
      { agent: "writer", summary: "Drafted 850-word article with 4 sections." },
      { agent: "critic", summary: "Issues: 2 minor; suggestions: expand case studies.", score: 86 },
      { agent: "seo", summary: "Meta title, description, 5 keywords, 2 FAQ items." },
      { agent: "publisher", summary: "Ready to publish; tags and categories set." },
      { agent: "final_critic", summary: "Final score 88 — publish.", score: 88 },
      { agent: "lessons", summary: "2 lessons captured for future runs." },
    ];
    for (const s of steps) {
      const step = await createStep(run.id, s.agent, 0);
      await markStepCompleted(step.id, {
        provider: "mock",
        model: "autoai-demo-1",
        outputSummary: s.summary,
        output: { summary: s.summary },
        score: s.score ?? null,
      });
    }
    await updateRun(run.id, { status: "completed", startedAt: new Date(Date.now() - 60000), finishedAt: new Date() });
    await updatePost(
      post.id,
      {
        title: "Mountain Wildlife Corridors: A Lifeline for Fragmented Habitats",
        content: "## The Problem\n\nMountain habitats are increasingly fragmented by roads, settlements and agriculture. Wildlife corridors reconnect these patches, allowing animals to move, breed and adapt.\n\n## The Evidence\n\nTracking studies show that corridor-connected populations have higher genetic diversity and lower extinction risk.\n\n## What You Can Do\n\nSupport land trusts and local conservation groups that protect connective habitat.",
        excerpt: "Wildlife corridors reconnect fragmented mountain habitats, supporting genetic diversity and long-term survival.",
        seo: { metaTitle: "Mountain Wildlife Corridors Explained", metaDescription: "How wildlife corridors help fragmented mountain habitats.", keywords: ["wildlife", "corridors", "conservation", "mountains"] },
      },
      "system"
    );
    await setPostStatus(post.id, "published", "system");
    log("sample completed agent run seeded");
  }

  // Lessons (approved, active) for future runs
  const lessonsExisting = await db.db.select().from(lessonsTable).limit(1);
  if (lessonsExisting.length === 0) {
    const runRows = await db.db.select().from(agentRunsTable).limit(1);
    const runId = runRows[0]?.id ?? null;
    await db.db.insert(lessonsTable).values([
      { agent: "writer", lesson: "Always open with a concrete example before abstract claims.", reason: "Critics scored introductions higher when grounded in specifics.", status: "active", approved: true, sourceRunId: runId },
      { agent: "critic", lesson: "Flag missing citations on any factual claim.", reason: "Final critics penalize unsupported statements.", status: "active", approved: true, sourceRunId: runId },
      { agent: "seo", lesson: "Keep meta descriptions between 140 and 160 characters.", reason: "SEO checks flagged descriptions outside the range.", status: "active", approved: true, sourceRunId: runId },
    ]);
    log("3 approved lessons seeded");
  }

  // Sample conversations
  const convs = await db.db.select().from(conversationsTable).limit(1);
  if (convs.length === 0) {
    const enConvo = await db.db.insert(conversationsTable).values({ language: "en" }).returning();
    await db.db.insert(messagesTable).values([
      { conversationId: enConvo[0].id, role: "user", content: "What is a wildlife corridor?" },
      { conversationId: enConvo[0].id, role: "assistant", content: "A wildlife corridor is a strip of natural habitat that connects fragmented populations, allowing animals to move safely between areas.", sources: [], provider: "mock", model: "autoai-demo-1" },
    ]);
    const faConvo = await db.db.insert(conversationsTable).values({ language: "fa" }).returning();
    await db.db.insert(messagesTable).values([
      { conversationId: faConvo[0].id, role: "user", content: "تالاب چه نقشی دارد؟" },
      { conversationId: faConvo[0].id, role: "assistant", content: "تالاب‌ها آب سیلاب را ذخیره می‌کنند، آلودگی را تصفیه می‌کنند و زیستگاه بسیاری از جانداران هستند.", sources: [], provider: "mock", model: "autoai-demo-1" },
    ]);
    log("2 sample conversations seeded");
  }

  // Sample feedback
  const fb = await db.db.select().from(feedbackTable).limit(1);
  if (fb.length === 0) {
    const aPost = await db.db.select().from(postsTable).limit(1);
    if (aPost[0]) {
      await db.db.insert(feedbackTable).values([
        { postId: aPost[0].id, rating: "helpful", comment: "Clear and well-researched." },
        { postId: aPost[0].id, rating: "not-helpful", comment: "Would like more data sources." },
      ]);
      log("2 sample feedback entries seeded");
    }
  }

  log("seed complete ✓");
}

seed().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
