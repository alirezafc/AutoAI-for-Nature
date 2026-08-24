import type {
  AIProvider,
  EmbeddingParams,
  EmbeddingResponse,
  GenerateTextParams,
  GenerateTextResponse,
  ModelInfo,
} from "../types";
import { EMBEDDING_DIMENSIONS } from "@/db/schema/common";

/**
 * MockProvider — a fully deterministic, offline "demo" provider.
 *
 * It is explicitly labeled as a mock in the UI and the model catalog.
 * It lets the entire platform (agent orchestration, RAG, voice, fallback
 * logic) be demonstrated without any API key, and produces valid,
 * deterministic output for both free text and structured JSON.
 *
 * It is NOT a substitute for a real provider in production.
 */

const SCHEMA_RE = /\[SCHEMA\]\n?([\s\S]*?)\n?\[\/SCHEMA\]/;

const GREETINGS_EN = [
  "Hello! I'm AutoAI, your nature and wildlife knowledge assistant. I can help you learn about ecosystems, conservation, climate, and the natural world. What would you like to know?",
  "Hi there! I'm here to help you explore topics about nature, wildlife, and environmental science. Feel free to ask me anything about the natural world!",
  "Welcome! I'm AutoAI — an AI-powered knowledge assistant focused on nature and conservation. What interests you about the natural world?",
];

const GREETINGS_FA = [
  "سلام! من AutoAI هستم، دستیار دانش طبیعت و حیات وحش. می‌توانم به شما درباره اکوسیستم‌ها، حفاظت، آب‌وهوا و دنیای طبیعی کمک کنم. چه چیزی می‌خواهید بدانید؟",
  "سلام! من اینجا هستم تا به شما در کشف موضوعات مربوط به طبیعت، حیات وحش و علوم محیطی کمک کنم. هر سوالی درباره دنیای طبیعی دارید بپرسید!",
  "خوش آمدید! من AutoAI هستم — یک دستیار دانش هوش مصنوعی که بر طبیعت و حفاظت تمرکز دارد. چه چیزی در دنیای طبیعت شما را جذب می‌کند؟",
];

const NATURE_KNOWLEDGE: Record<string, { en: string; fa: string }> = {
  "coral reef": {
    en: "Coral reefs are among the most biodiverse ecosystems on Earth, supporting about 25% of all marine species. They face threats from ocean warming, acidification, pollution, and overfishing. Bleaching events occur when corals expel their symbiotic algae due to stress, turning white and potentially dying. Conservation efforts include marine protected areas, coral gardening, and reducing carbon emissions.",
    fa: "صخره‌های مرجانی از متنوع‌ترین اکوسیستم‌های زمین هستند و از حدود ۲۵٪ از تمام گونه‌های دریایی پشتیبانی می‌کنند. آن‌ها با تهدیداتی مانند گرم شدن اقیانوس‌ها، اسیدی شدن، آلودگی و ماهیگیری بیش از حد مواجه هستند."
  },
  "forest": {
    en: "Forests cover about 31% of Earth's land area and are home to 80% of terrestrial biodiversity. They play a crucial role in carbon sequestration, water cycling, and climate regulation. Old-growth forests are particularly important for biodiversity and carbon storage. Deforestation remains a major threat, particularly in tropical regions.",
    fa: "جنگل‌ها حدود ۳۱٪ از خشکی‌های زمین را پوشش می‌دهند و خانه ۸۰٪ از تنوع زیستی خشکی هستند. آن‌ها نقش حیاتی در جذب کربن، چرخه آب و تنظیم آب‌وهوا دارند."
  },
  "wildlife": {
    en: "Wildlife conservation focuses on protecting species and their habitats. Key strategies include habitat preservation, anti-poaching measures, captive breeding programs, and community-based conservation. Climate change poses new challenges by altering habitats faster than many species can adapt.",
    fa: "حفاظت از حیات وحش بر محافظت از گونه‌ها و زیستگاه‌های آن‌ها تمرکز دارد. استراتژی‌های کلیدی شامل حفظ زیستگاه، اقدامات ضد شکار، برنامه‌های پرورش اسیر و حفاظت مبتنی بر جامعه است."
  },
  "climate": {
    en: "Climate change affects ecosystems worldwide through rising temperatures, extreme weather events, sea level rise, and shifting seasons. Nature-based solutions like reforestation, wetland restoration, and sustainable agriculture can help mitigate climate impacts while supporting biodiversity.",
    fa: "تغییرات آب‌وهوا از طریق افزایش دما، رویدادهای آب‌وهوایی شدید، افزایش سطح دریا و تغییر فصل‌ها بر اکوسیستم‌های سراسر جهان تأثیر می‌گذارد."
  },
  "ocean": {
    en: "Oceans cover 71% of Earth's surface and produce about 50% of the world's oxygen. They regulate climate, provide food for billions, and support incredible biodiversity. Threats include pollution, overfishing, acidification, and plastic waste.",
    fa: "اقیانوس‌ها ۷۱٪ از سطح زمین را پوشش می‌دهند و حدود ۵۰٪ از اکسیژن جهان تولید می‌کنند. آن‌ها آب‌وهوا را تنظیم می‌کنند، غذا برای میلیاردها نفر فراهم می‌کنند و از تنوع زیستی باورنکردنی پشتیبانی می‌کنند."
  },
  "bee": {
    en: "Bees are essential pollinators responsible for about one-third of the food we eat. They pollinate crops, wildflowers, and orchards. Colony Collapse Disorder, pesticides, habitat loss, and disease threaten bee populations worldwide. Planting pollinator-friendly gardens helps support local bee populations.",
    fa: "زنبورها گرده‌افشان‌های ضروری هستند که حدود یک سوم غذایی که می‌خوریم را گرده‌افشانی می‌کنند. آن‌ها محصولات، گل‌های وحشی و باغ‌های میوه را گرده‌افشانی می‌کنند."
  },
  "mangrove": {
    en: "Mangrove forests are coastal ecosystems that protect shorelines from erosion, storms, and flooding. They serve as nurseries for fish and shellfish, store large amounts of carbon, and support biodiversity. Despite their importance, mangroves are being lost at alarming rates due to coastal development and aquaculture.",
    fa: "جنگل‌های حرا اکوسیستم‌های ساحلی هستند که از خطوط ساحلی در برابر فرسایش، طوفان‌ها و سیلاب محافظت می‌کنند."
  },
  "bird": {
    en: "Birds are important indicators of ecosystem health. They control insect populations, disperse seeds, and pollinate plants. Many bird species are declining due to habitat loss, climate change, and window strikes. Bird conservation includes protecting migration routes and nesting habitats.",
    fa: "پرندگان شاخص‌های مهم سلامت اکوسیستم هستند. آن‌ها جمعیت حشرات را کنترل می‌کنند، بذرها را پراکنده می‌کنند و گیاهان را گرده‌افشانی می‌کنند."
  },
  "water": {
    en: "Freshwater ecosystems cover less than 1% of Earth's surface but support about 10% of all known species. Wetlands, rivers, and lakes are vital for water purification, flood control, and biodiversity. Water pollution and overuse threaten these critical ecosystems.",
    fa: "اکوسیستم‌های آب شیرین کمتر از ۱٪ از سطح زمین را پوشش می‌دهند اما از حدود ۱۰٪ از تمام گونه‌های شناخته شده پشتیبانی می‌کنند."
  },
  "extinction": {
    en: "Species extinction is occurring at 100-1,000 times the natural background rate. The current biodiversity crisis is driven by habitat loss, climate change, pollution, invasive species, and overexploitation. Conservation efforts focus on protecting habitats, breeding programs, and reducing human impact.",
    fa: "انقراض گونه‌ها با سرعت ۱۰۰ تا ۱۰۰۰ برابر نرخ پس‌زمینه طبیعی رخ می‌دهد."
  }
};

const EN_PARAS = [
  "Across the landscape, the rhythm of the natural world repeats itself in quiet cycles — growth, migration, reproduction and renewal. Scientists are only beginning to map the intricate relationships that hold ecosystems together.",
  "Every organism plays a role in this larger story. From the smallest pollinator to the largest predator, species depend on one another in ways that are often invisible until they break.",
  "Conservation efforts around the world are learning to work with these relationships rather than against them, restoring habitats and letting natural processes lead the way.",
  "The evidence is clear: when we protect a single species, we often protect hundreds of others that share its habitat. Protecting nature is protecting ourselves.",
];

const FA_PARAS = [
  "در سراسر طبیعت، ریتم دنیای طبیعی در چرخه‌های آرام تکرار می‌شود — رشد، مهاجرت، تولید مثل و نوسازی. دانشمندان تازه آغاز به ترسیم روابط پیچیده‌ای کرده‌اند که اکوسیستم‌ها را حفظ می‌کنند.",
  "هر موجود زنده در این داستان بزرگ نقشی دارد. از کوچک‌ترین گرده‌افشان تا بزرگ‌ترین شکارچی، گونه‌ها به یکدیگر وابسته‌اند به شیوه‌هایی که اغلب تا زمان شکستن، نادیده می‌مانند.",
  "تلاش‌های حفاظتی در سراسر جهان یاد گرفته‌اند که با این روابط کار کنند نه علیه آن‌ها؛ زیستگاه‌ها را بازسازی کنند و اجازه دهند فرآیندهای طبیعی پیشتاز باشند.",
  "شواهد روشن است: وقتی از یک گونه محافظت می‌کنیم، اغلب از صدها گونه دیگر که در همان زیستگاه زندگی می‌کنند نیز محافظت کرده‌ایم. حفاظت از طبیعت، حفاظت از خود ماست.",
];

const EN_HEADINGS = ["A fragile balance", "What the research shows", "Why it matters now", "What can be done", "The road ahead"];
const FA_HEADINGS = ["تعادلی شکننده", "نتیجه پژوهش‌ها", "چرا اکنون اهمیت دارد", "چه می‌توان کرد", "راه پیش رو"];

const KEYWORD_POOL = [
  "wildlife", "conservation", "biodiversity", "ecosystem", "habitat",
  "climate", "nature", "species", "ocean", "forest",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(str: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function tokenizeForEmbedding(text: string): string[] {
  const tokens: string[] = [];
  const lowered = text.toLowerCase();
  const words = lowered.match(/[\p{L}\p{N}]+/gu) ?? [];
  const stop = new Set([
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
    "is", "are", "was", "were", "be", "been", "how", "why", "what", "when",
    "where", "who", "about", "does", "do", "why do", "what is", "what's",
  ]);
  const wfreq = new Map<string, number>();
  for (const w of words) {
    if (w.length < 3 || stop.has(w)) continue;
    wfreq.set(w, (wfreq.get(w) ?? 0) + 1);
  }
  for (const w of words) {
    if (w.length < 3 || stop.has(w)) continue;
    const f = wfreq.get(w) ?? 1;
    tokens.push(`w:${w}`);
    if (f === 1) tokens.push(`w1:${w}`);
  }
  return tokens;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isGreeting(text: string): boolean {
  const firstWords = text.toLowerCase().trim().replace(/[?!.,;:]+$/g, "").slice(0, 60);
  const greetings = [
    "سلام", "درود", "علیکم", "سلام علیکم",
    "hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening",
    "how are you", "what's up", "howdy", "hiya",
    "salam", "hi there", "hello there",
  ];
  return greetings.some((g) => firstWords === g || firstWords.startsWith(g + " ") || firstWords.startsWith(g + ",") || firstWords.startsWith(g + "!") || firstWords.startsWith(g + "?"));
}

function extractTopic(prompt: string): string {
  const withoutSchema = prompt.replace(SCHEMA_RE, "");
  const messages = withoutSchema.split(/\n(?=(?:system|user|assistant|tool):)/i);
  const lastMessage = messages[messages.length - 1]?.replace(/^(?:system|user|assistant|tool):\s*/i, "") ?? "";
  
  if (isGreeting(lastMessage)) {
    return "__GREETING__";
  }
  
  const re = /(?:^|\n|\s)(?:Topic|Title|Subject|Ideas?)\s*[:：-]\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lastMessage))) {
    const topic = match[1].trim();
    if (topic) return topic;
  }
  const lines = lastMessage.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1]?.slice(0, 80) ?? "The natural world";
}

function matchKnowledge(query: string): { key: string; text: string } | null {
  const q = query.toLowerCase();
  for (const [key, value] of Object.entries(NATURE_KNOWLEDGE)) {
    if (q.includes(key)) {
      return { key, text: value.en };
    }
  }
  return null;
}

function matchKnowledgeFa(query: string): { key: string; text: string } | null {
  for (const [key, value] of Object.entries(NATURE_KNOWLEDGE)) {
    if (query.includes(key) || query.includes(value.fa.slice(0, 10))) {
      return { key, text: value.fa };
    }
  }
  return null;
}

function isFarsi(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

interface RagSourceBlock {
  title: string;
  content: string;
}

/**
 * Extract grounded sources embedded in the prompt by the RAG pipeline
 * ("Relevant knowledge sources (use these to ground your answer)").
 * Returns the real retrieved knowledge so the mock can actually answer
 * from it instead of a hardcoded keyword table.
 */
function extractRagSources(prompt: string): RagSourceBlock[] {
  const markers = ["Relevant knowledge sources", "منابع دانش مرتبط"];
  const idx = markers
    .map((m) => prompt.indexOf(m))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (idx < 0) return [];

  const block = prompt.slice(idx);
  const blocks: RagSourceBlock[] = [];
  const re = /\[Source \d+\]\s*([^\n]+)\n([\s\S]*?)(?=\n\n?---\n\n|\[Source \d+\]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    blocks.push({ title: m[1].trim(), content: m[2].trim() });
  }
  if (blocks.length === 0) {
    const first = block.split(/\n\n?---\n\n/)[0] ?? "";
    const lines = first.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      blocks.push({ title: lines[0], content: lines.slice(1).join(" ") });
    }
  }
  return blocks;
}

function summarizeSource(content: string, maxSentences = 3): string {
  const sentences = content
    .replace(/\s+/g, " ")
    .match(/[^.!?\n]+[.!?]+/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 15);
  if (!sentences || sentences.length === 0) {
    return content.trim().slice(0, 320);
  }
  return sentences.slice(0, maxSentences).join(" ");
}

function generateGroundedResponse(
  question: string,
  sources: RagSourceBlock[],
  isFa: boolean,
  json?: boolean
): string {
  if (sources.length === 0) return "";
  const top = sources[0];
  const summary = summarizeSource(top.content);

  const lead = isFa
    ? `بر اساس دانش‌نامه‌ی ما درباره «${top.title}»:`
    : `Based on our knowledge base entry "${top.title}":`;

  const body = isFa ? summary : summary;

  const followUp = isFa
    ? `\n\nاین پاسخ از سند «${top.title}» در پایگاه دانش استخراج شده است. اگر سوال دیگری درباره طبیعت دارید بپرسید.`
    : `\n\nThis answer is grounded in the knowledge base document "${top.title}". Feel free to ask about other nature topics.`;

  const answer = `${lead}\n\n${body}${followUp}`;

  if (json) {
    return JSON.stringify({
      answer,
      sources: sources.slice(0, 3).map((s, i) => ({
        title: s.title,
        confidence: Math.max(0.6, 0.9 - i * 0.1),
      })),
      confidence: Math.max(0.6, 0.9),
    });
  }
  return answer;
}

function generateIntelligentResponse(query: string, messages: Array<{ role: string; content: string }>, json?: boolean): string {
  const isFa = isFarsi(query);
  const q = query.toLowerCase();

  const promptText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const ragSources = extractRagSources(promptText);
  if (ragSources.length > 0) {
    const grounded = generateGroundedResponse(query, ragSources, isFa, json);
    if (grounded) return grounded;
  }

  const faKeywords: Record<string, string[]> = {
    "coral reef": ["مرجان", "مرجانی", "صخره مرجانی", "reef", "coral"],
    "forest": ["جنگل", "جنگل‌ها", "جنگل‌زدایی", "forest"],
    "wildlife": ["حیات وحش", "حیوانات", "wildlife", "species"],
    "climate": ["آب و هوا", "تغییرات آب و هوا", "climate", "climate change"],
    "ocean": ["اقیانوس", "اقیانوس‌ها", "دریا", "ocean"],
    "bee": ["زنبور", "زنبورها", "گرده‌افشانی", "bee"],
    "mangrove": ["حرا", "جنگل حرا", "mangrove"],
    "bird": ["پرنده", "پرندگان", "bird"],
    "water": ["آب", "آب شیرین", "رودخانه", "talaab"],
    "extinction": ["انقراض", "extinction"],
  };

  let knowledgeMatch: { key: string; text: string } | null = null;

  if (isFa) {
    for (const [key, keywords] of Object.entries(faKeywords)) {
      if (keywords.some((kw) => q.includes(kw))) {
        knowledgeMatch = { key, text: NATURE_KNOWLEDGE[key]?.fa || "" };
        break;
      }
    }
    if (!knowledgeMatch) {
      knowledgeMatch = matchKnowledgeFa(query);
    }
  } else {
    knowledgeMatch = matchKnowledge(query);
  }

  if (knowledgeMatch) {
    let response = knowledgeMatch.text;
    
    const followUpPatterns = ["why", "how", "what", "when", "where", "who", "چرا", "چگونه", "چیست", "کجا", "چه"];
    const isFollowUp = messages.length > 2 || followUpPatterns.some((p) => q.includes(p));
    
    if (isFollowUp) {
      const contextNote = isFa
        ? `\n\nبر اساس دانش من درباره ${knowledgeMatch.key}، این پاسخ را ارائه می‌دهم. سوالات بیشتری دارید؟`
        : `\n\nBased on my knowledge of ${knowledgeMatch.key}, here's what I can tell you. Do you have more questions?`;
      response += contextNote;
    }
    
    if (json) {
      return JSON.stringify({
        answer: response,
        sources: [{ title: `AutoAI Knowledge Base: ${knowledgeMatch.key}`, confidence: 0.85 }],
        confidence: 0.85,
      });
    }
    return response;
  }

  const genericResponses = isFa ? [
    `سوال جالبی پرسیدید. اگرچه من تخصصم در حوزه طبیعت و حیات وحش است، می‌توانم کمکتان کنم. لطفاً سوال خود را درباره اکوسیستم‌ها، گونه‌ها، حفاظت، یا موضوعات زیست‌محیطی مطرح کنید.`,
    `ممنون از سوالتان. من یک دستیار تخصصی در زمینه طبیعت هستم. آیا می‌توانید سوال خود را درباره جنگل‌ها، اقیانوس‌ها، حیات وحش، یا تغییرات آب و هوا مطرح کنید؟`,
    `من ترجیح می‌دهم در حوزه‌های تخصصی‌ام پاسخ دهم: طبیعت، حیات وحش، اکوسیستم‌ها، حفاظت از محیط زیست، و تغییرات آب و هوا. لطفاً در این زمینه‌ها سوال بفرمایید.`,
  ] : [
    `That's an interesting question. While my expertise is in nature and wildlife, I'd be happy to help. Could you ask about ecosystems, species, conservation, or environmental topics?`,
    `Thanks for your question. I'm a specialized nature assistant. Could you ask about forests, oceans, wildlife, or climate-related topics?`,
    `I'm best equipped to answer questions about nature, wildlife, ecosystems, conservation, and climate change. Please ask about these topics!`,
  ];
  
  const idx = hash(query) % genericResponses.length;
  return genericResponses[idx];
}

function extractLang(prompt: string): "en" | "fa" {
  const match = prompt.match(/Language\s*[:：]\s*(en|fa|en-US|fa-IR|persian|english)/i);
  if (match) {
    if (match[1].toLowerCase().startsWith("fa") || match[1].toLowerCase() === "persian") return "fa";
    return "en";
  }
  return prompt.includes("پارسی") || prompt.includes("فارسی") ? "fa" : "en";
}

function extractRound(prompt: string): number {
  const match = prompt.match(/\[ROUND:\s*(\d+)\]/);
  return match ? parseInt(match[1], 10) : 1;
}

function buildArticle(topic: string, lang: "en" | "fa"): string {
  const paras = lang === "fa" ? FA_PARAS : EN_PARAS;
  const headings = lang === "fa" ? FA_HEADINGS : EN_HEADINGS;
  const rnd = mulberry32(hash(topic + lang));
  const pick = <T,>(arr: T[], offset: number): T => arr[(Math.floor(rnd() * arr.length) + offset) % arr.length];
  const title = lang === "fa" ? `گزارش: ${topic}` : `The story of ${topic}`;
  const out: string[] = [`# ${title}`, ""];
  for (let i = 0; i < 5; i++) {
    out.push(`## ${headings[i % headings.length]}`, "");
    out.push(pick(paras, i), "");
    out.push(pick(paras, i + 2), "");
  }
  out.push(
    lang === "fa"
      ? "> یادداشت: این متن توسط ارائه‌دهنده نمایشی AutoAI تولید شده و برای دمو است. در استقرار واقعی، عامل‌ها از مدل هوش مصنوعی پیکربندی‌شده استفاده می‌کنند."
      : "> Note: this text was produced by the AutoAI mock provider for demonstration. In production, agents use your configured AI model."
  );
  return out.join("\n");
}

function cleanTopic(topic: string): string {
  return topic.replace(/^The story of\s+/i, "").replace(/^گزارش:\s*/, "");
}

function fillSchemaValue(name: string, topic: string, lang: "en" | "fa", round: number, score: number): unknown {
  const slug = (topic.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-")) || "autoai-nature-story";
  switch (name) {
    case "score":
      return score;
    case "verdict":
      return score >= 80 ? "approved" : "revision";
    case "issues":
      return score >= 80 ? [] : ["Opening could be more specific", "Some sections lack concrete examples"];
    case "suggestions":
      return score >= 80 ? [] : ["Add an observation-led opening", "Include at least one concrete study or number"];
    case "accuracy":
      return clampScore(score + 2);
    case "structure":
      return clampScore(score - 1);
    case "readability":
      return clampScore(score + 1);
    case "seoScore":
    case "seo":
      return clampScore(score - 2);
    case "title":
      return lang === "fa" ? `گزارش: ${topic}` : `The story of ${topic}`;
    case "slug":
      return slug;
    case "excerpt":
      return lang === "fa"
        ? `خلاصه‌ای از گزارش درباره ${topic} بر اساس پژوهش و بازبینی توسط تیم عامل‌های AutoAI.`
        : `A report about ${topic}, researched and reviewed by the AutoAI agent team.`;
    case "metaTitle":
      return lang === "fa" ? `${cleanTopic(topic)} | مجله AutoAI` : `${cleanTopic(topic)} | AutoAI Journal`;
    case "metaDescription":
      return lang === "fa"
        ? `گزارش درباره ${cleanTopic(topic)}: حقایق، بررسی و چشم‌انداز.`
        : `A researched report about ${cleanTopic(topic)}: the facts, the picture, and what it means.`;
    case "keywords":
      return [topic.split(" ")[0]?.toLowerCase(), ...KEYWORD_POOL].slice(0, 5);
    case "faq":
      return [
        { question: lang === "fa" ? `چرا ${topic} مهم است؟` : `Why is ${topic} important?`, answer: lang === "fa" ? `پاسخ مستند مبتنی بر پایگاه دانش.` : `A grounded answer based on the knowledge base.` },
        { question: lang === "fa" ? `چه کاری می‌توان انجام داد؟` : "What can be done?", answer: lang === "fa" ? "اقدام‌های عملی با تکیه بر پژوهش‌های اخیر." : "Practical steps grounded in recent research." },
      ];
    case "structuredData":
      return { "@type": "Article", headline: topic, articleSection: "Nature" };
    case "content":
      return buildArticle(topic, lang);
    case "body":
      return buildArticle(topic, lang);
    case "sections":
      return [
        { heading: lang === "fa" ? "مقدمه" : "Introduction", points: ["Overview of the topic", "Why it matters"] },
        { heading: lang === "fa" ? "شواهد" : "Evidence", points: ["Recent research", "Field observations"] },
        { heading: lang === "fa" ? "نتیجه‌گیری" : "Conclusion", points: ["Implications", "What happens next"] },
      ];
    case "angle":
      return lang === "fa" ? "روایت مبتنی بر مشاهدات و شواهد علمی" : "An evidence-led narrative built on observations";
    case "outline":
      return ["Introduction", "Evidence", "Perspectives", "Conclusion"];
    case "tone":
      return "authoritative and accessible";
    case "ideas":
      return Array.from({ length: 3 }, (_, i) => ({
        title: lang === "fa" ? `${topic} — ایده ${i + 1}` : `${topic} — idea ${i + 1}`,
        rationale: lang === "fa" ? "چرا این زاویه جذاب و متمایز است" : "Why this angle is compelling and distinct",
      }));
    case "facts":
    case "sources":
    case "findings":
      return Array.from({ length: 3 }, (_, i) => ({
        fact: lang === "fa" ? `یافته ${i + 1} درباره ${topic}` : `Finding ${i + 1} about ${topic}`,
        source: lang === "fa" ? "پایگاه دانش AutoAI (نمایشی)" : "AutoAI knowledge base (demo)",
        confidence: 0.8 + (i % 2) * 0.1,
      }));
    case "summary":
      return lang === "fa" ? `خلاصه گزارش ${topic}` : `Summary of the ${topic} report`;
    case "audience":
      return lang === "fa" ? "خوانندگان عمومی علاقه‌مند به طبیعت" : "General readers interested in nature";
    case "keyPoints":
      return ["Recent research findings", "Real-world examples", "Practical implications"];
    case "note":
      return lang === "fa" ? "منتشر برای بررسی انسانی" : "Queued for human review";
    case "approved":
      return score >= 80;
    case "finalScore":
      return score;
    case "lessons":
      return [
        { agent: "writer", lesson: "Prefer concrete observations instead of generic introductions.", reason: "Improves readability scores" },
        { agent: "researcher", lesson: "Anchor every claim with at least one source.", reason: "Improves factual quality" },
      ];
    case "status":
      return "needs_review";
    case "publish":
      return { status: "needs_review", visibility: "internal" };
    case "answer":
      return lang === "fa"
        ? `بر اساس پایگاه دانش، ${topic} اهمیت زیادی دارد. برای پاسخ کامل‌تر، می‌توانم به مقالات و اسناد مرتبط ارجاع دهم.`
        : `Based on the knowledge base, ${topic} matters for several reasons. I can point you to the relevant articles and documents for a fuller answer.`;
    default:
      return null;
  }
}

function clampScore(n: number): number {
  return Math.max(55, Math.min(98, n));
}

export class MockProvider implements AIProvider {
  key = "mock";
  name = "Mock (Demo)";
  kind = "both" as const;

  isConfigured(): boolean {
    return true;
  }

  getApiKeyEnv(): string | undefined {
    return undefined;
  }

  models(): ModelInfo[] {
    return [
      {
        id: "autoai-demo-1",
        name: "AutoAI Demo 1",
        provider: "mock",
        free: true,
        description: "Deterministic offline demo model. No API key required. For development and demonstrations only.",
        supportsJson: true,
        supportsStreaming: true,
        supportsEmbeddings: true,
      },
    ];
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResponse> {
    const started = Date.now();
    const prompt = params.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const topic = extractTopic(prompt);
    const lang = extractLang(prompt);
    const round = extractRound(prompt);
    const seed = hash(prompt);

    const schemaMatch = prompt.match(SCHEMA_RE);
    let text: string;

    if (topic === "__GREETING__") {
      const greetings = lang === "fa" ? GREETINGS_FA : GREETINGS_EN;
      text = greetings[seed % greetings.length];
    } else if (schemaMatch) {
      let schema: Record<string, unknown> | undefined;
      try {
        schema = JSON.parse(schemaMatch[1]);
      } catch {
        schema = undefined;
      }
      if (schema) {
        const score = clampScore(76 + (round - 1) * 13 + (seed % 7) - 3);
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(schema)) {
          result[key] = fillSchemaValue(key, topic, lang, round, score);
        }
        text = JSON.stringify(result);
      } else {
        text = JSON.stringify({ result: `Deterministic demo response about ${topic}.` });
      }
    } else {
      const isPipelineContext = /(?:Topic|Title|Subject|Language)\s*[:：]/i.test(prompt);
      if (isPipelineContext) {
        text = buildArticle(topic, lang);
      } else {
        text = generateIntelligentResponse(topic, params.messages, params.json);
      }
    }

    const latency = 80 + (seed % 160);
    // simulate a tiny delay so the pipeline feels alive
    return {
      text,
      latencyMs: latency,
      tokensIn: Math.round(prompt.length / 4),
      tokensOut: Math.round(text.length / 4),
      raw: { mock: true, seed },
    };
  }

  async streamText(
    params: GenerateTextParams,
    onChunk: (chunk: string) => void
  ): Promise<GenerateTextResponse> {
    const res = await this.generateText(params);
    const chunks = res.text.match(/.{1,48}/gs) ?? [res.text];
    for (const chunk of chunks) {
      onChunk(chunk);
      await new Promise((r) => setTimeout(r, 6));
    }
    return res;
  }

  async generateEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const started = Date.now();
    const vec = new Array(EMBEDDING_DIMENSIONS).fill(0);

    const stampFeatures = (feat: string, sign: number, scale: number) => {
      const h1 = hash(feat);
      const h2 = hash2(feat);
      vec[h1 % EMBEDDING_DIMENSIONS] += sign * scale;
      vec[h2 % EMBEDDING_DIMENSIONS] += sign * scale;
      if (EMBEDDING_DIMENSIONS > 2) {
        vec[(h1 + h2) % EMBEDDING_DIMENSIONS] += sign * scale * 0.5;
      }
    };

    // Lexical hashing-embedding: topically overlapping texts get high
    // cosine similarity, which lets the RAG demo actually retrieve relevant
    // sources in offline mode. Nobel winner + hash collisions aside, this is
    // intentionally simple and deterministic.
    for (const feat of tokenizeForEmbedding(params.text)) {
      stampFeatures(feat, 1, 1);
    }

    let sum = 0;
    for (const v of vec) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    const embedding = vec.map((v) => v / norm);
    return {
      embedding,
      latencyMs: 15,
      dimensions: embedding.length,
      provider: this.key,
      model: params.model,
      tokens: Math.round(params.text.length / 4),
    };
  }
}
