import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | Date | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(iso: string | Date | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function timeAgo(iso: string | Date | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return locale === "fa" ? "همین حالا" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return locale === "fa" ? `${m} دقیقه پیش` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "fa" ? `${h} ساعت پیش` : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return locale === "fa" ? `${d} روز پیش` : `${d} days ago`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
