ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_provider" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_dimensions" integer;