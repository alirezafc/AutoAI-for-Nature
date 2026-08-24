-- Embedding contract change: canonical dimensions 1536 -> 2048
-- (production embedding model: nvidia/nemotron-3-embed-1b:free via OpenRouter).
--
-- Vectors produced under the previous dimension contract are INVALID and can
-- neither be truncated nor padded (mixing/padding corrupts similarity search).
-- Changing the embedding model always requires a FULL knowledge-base
-- re-index, so stale vectors are removed here on purpose.
DELETE FROM "knowledge_chunks";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(2048);