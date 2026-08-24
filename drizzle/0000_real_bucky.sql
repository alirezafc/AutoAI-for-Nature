CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT 'Admin' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_fa" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_fa" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#16a34a' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"cover_image" text DEFAULT '' NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"author_name" text DEFAULT 'AutoAI' NOT NULL,
	"agent_run_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"temperature" integer DEFAULT 70 NOT NULL,
	"max_tokens" integer DEFAULT 2048 NOT NULL,
	"model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "agent_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"author" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_type" text DEFAULT 'article_creation' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"post_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"input_summary" text DEFAULT '' NOT NULL,
	"output_summary" text DEFAULT '' NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"rating" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"processed_as_lesson" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"lesson" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"source_run_id" uuid,
	"source_feedback_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_type" text DEFAULT 'curated' NOT NULL,
	"post_id" uuid,
	"author" text DEFAULT 'AutoAI' NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"label" text NOT NULL,
	"primary_provider" text DEFAULT 'mock' NOT NULL,
	"primary_model" text DEFAULT 'autoai-demo-1' NOT NULL,
	"fallback_provider" text DEFAULT 'mock' NOT NULL,
	"fallback_model" text DEFAULT 'autoai-demo-1' NOT NULL,
	"temperature" integer DEFAULT 70 NOT NULL,
	"max_tokens" integer DEFAULT 2048 NOT NULL,
	"rag_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_configs_purpose_unique" UNIQUE("purpose")
);
--> statement-breakpoint
CREATE TABLE "model_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'openai-compatible' NOT NULL,
	"base_url" text,
	"api_key_env" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "voice_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stt_provider" text DEFAULT 'browser' NOT NULL,
	"stt_model" text DEFAULT 'browser-default' NOT NULL,
	"llm_provider" text DEFAULT 'mock' NOT NULL,
	"llm_model" text DEFAULT 'autoai-demo-1' NOT NULL,
	"tts_provider" text DEFAULT 'browser' NOT NULL,
	"tts_model" text DEFAULT 'browser-default' NOT NULL,
	"voice" text DEFAULT 'default' NOT NULL,
	"temperature" integer DEFAULT 70 NOT NULL,
	"speed" integer DEFAULT 100 NOT NULL,
	"greeting" text DEFAULT 'Hello! I am AutoAI. Ask me about nature, wildlife and the environment.' NOT NULL,
	"system_prompt" text DEFAULT 'You are the AutoAI voice assistant, an expert on nature, wildlife and the environment. Answer clearly and concisely for a spoken reply.' NOT NULL,
	"rag_enabled" boolean DEFAULT true NOT NULL,
	"save_conversations" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"free" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer,
	"measured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cursor' NOT NULL,
	"endpoint" text,
	"auth_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"host" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"params_summary" text DEFAULT '' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "mcp_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"invocations_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_tools_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"schedule" text DEFAULT '0 0 * * *' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflows_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid,
	"filename" text NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"provider" text,
	"model" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt_versions" ADD CONSTRAINT "agent_prompt_versions_config_id_agent_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_language_idx" ON "posts" USING btree ("language");--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "agent_configs_key_idx" ON "agent_configs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "agent_prompt_versions_config_idx" ON "agent_prompt_versions" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_created_idx" ON "agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_steps_run_idx" ON "agent_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "feedback_post_idx" ON "feedback" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "lessons_agent_idx" ON "lessons" USING btree ("agent");--> statement-breakpoint
CREATE INDEX "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_doc_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_language_idx" ON "knowledge_chunks" USING btree ("language");--> statement-breakpoint
CREATE INDEX "knowledge_docs_status_idx" ON "knowledge_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_docs_language_idx" ON "knowledge_documents" USING btree ("language");--> statement-breakpoint
CREATE INDEX "knowledge_docs_source_idx" ON "knowledge_documents" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "model_configs_purpose_idx" ON "model_configs" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "model_providers_key_idx" ON "model_providers" USING btree ("key");--> statement-breakpoint
CREATE INDEX "voice_models_kind_idx" ON "voice_models" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "mcp_hosts_type_idx" ON "mcp_hosts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "mcp_invocations_tool_idx" ON "mcp_invocations" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "mcp_tools_name_idx" ON "mcp_tools" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workflows_key_idx" ON "workflows" USING btree ("key");--> statement-breakpoint
CREATE INDEX "backups_created_idx" ON "backups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "conversations_created_idx" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");