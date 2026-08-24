import { z } from "zod";

export const IdeaSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
      })
    )
    .min(1)
    .max(6),
});

export const StrategySchema = z.object({
  angle: z.string(),
  audience: z.string(),
  tone: z.string(),
  keyPoints: z.array(z.string()).min(1),
  outline: z.array(z.string()).min(1),
});

export const ResearchSchema = z.object({
  summary: z.string(),
  findings: z
    .array(
      z.object({
        fact: z.string(),
        source: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1),
});

export const ArticleSchema = z.object({
  title: z.string().min(3),
  excerpt: z.string(),
  content: z.string().min(50),
});

export const CriticSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["approved", "revision"]),
  accuracy: z.number().int().min(0).max(100),
  structure: z.number().int().min(0).max(100),
  readability: z.number().int().min(0).max(100),
  seo: z.number().int().min(0).max(100),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const SeoSchema = z.object({
  slug: z.string().regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "lowercase kebab-case (allow unicode letters)"),
  metaTitle: z.string(),
  metaDescription: z.string(),
  keywords: z.array(z.string()).max(12),
  faq: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      })
    )
    .max(6),
  structuredData: z.record(z.unknown()),
});

export const PublishSchema = z.object({
  status: z.enum(["publish", "draft", "needs_review"]),
  note: z.string(),
});

export const LessonSchema = z.object({
  lessons: z
    .array(
      z.object({
        agent: z.string(),
        lesson: z.string().min(3),
        reason: z.string(),
      })
    )
    .max(8),
});

export const FinalCriticSchema = z.object({
  approved: z.boolean(),
  finalScore: z.number().int().min(0).max(100),
  summary: z.string(),
});

export type Idea = z.infer<typeof IdeaSchema>;
export type Strategy = z.infer<typeof StrategySchema>;
export type Research = z.infer<typeof ResearchSchema>;
export type Article = z.infer<typeof ArticleSchema>;
export type Critic = z.infer<typeof CriticSchema>;
export type Seo = z.infer<typeof SeoSchema>;
export type Publish = z.infer<typeof PublishSchema>;
export type LessonOutput = z.infer<typeof LessonSchema>;
export type FinalCritic = z.infer<typeof FinalCriticSchema>;
