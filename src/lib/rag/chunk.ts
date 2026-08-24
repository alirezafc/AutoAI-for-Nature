export function chunkText(
  text: string,
  chunkSize = 900,
  overlap = 120
): string[] {
  if (!text || !text.trim()) return [];
  const sentences = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > chunkSize) {
      chunks.push(current.trim());
      const words = current.split(/\s+/);
      const keepWords = Math.max(2, Math.round(overlap / 8));
      current = words.slice(Math.max(0, words.length - keepWords)).join(" ");
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.trim().length > 20);
}

export function countChunks(text: string): number {
  return chunkText(text, 900, 120).length;
}
