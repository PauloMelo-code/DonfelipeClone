-- ===========================================================================
-- PARTE 1 — Adaptar o banco herdado do Prisma.
--
-- Tudo aqui e no-op num banco vazio (as funcoes checam a existencia antes) e
-- idempotente num banco que ja passou por esta migracao. A PARTE 2, mais
-- abaixo, cria o que ainda nao existe.
--
-- O que esta parte faz num banco de producao com dados:
--   1. renomeia as colunas camelCase do Prisma para snake_case;
--   2. adiciona as 5 colunas de auditoria em TODA tabela;
--   3. converte timestamp -> timestamptz interpretando o valor como UTC
--      (que e como o Prisma gravava);
--   4. converte dinheiro de double precision -> numeric(12,2);
--   5. troca o default de `role` de ADMIN para OPERATOR;
--   6. troca as FKs do Prisma pelas novas, com ON DELETE RESTRICT.
--
-- Nenhuma linha e apagada e nenhum valor de negocio e reescrito.
-- ===========================================================================

CREATE OR REPLACE FUNCTION pg_temp.tem_tabela(t text) RETURNS boolean AS $fn$
  SELECT to_regclass(format('public.%I', t)) IS NOT NULL;
$fn$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.tem_coluna(t text, c text) RETURNS boolean AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = c
  );
$fn$ LANGUAGE sql;

-- Renomeia so quando a coluna antiga existe e a nova ainda nao.
CREATE OR REPLACE FUNCTION pg_temp.ren(t text, de text, para text) RETURNS void AS $fn$
BEGIN
  IF pg_temp.tem_tabela(t) AND pg_temp.tem_coluna(t, de) AND NOT pg_temp.tem_coluna(t, para) THEN
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', t, de, para);
  END IF;
END;
$fn$ LANGUAGE plpgsql;

-- Acrescenta as colunas de auditoria da regra da casa.
CREATE OR REPLACE FUNCTION pg_temp.auditoria(t text) RETURNS void AS $fn$
BEGIN
  IF NOT pg_temp.tem_tabela(t) THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz(3) NOT NULL DEFAULT now()', t);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz(3) NOT NULL DEFAULT now()', t);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz(3)', t);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false', t);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS modified_by text', t);
END;
$fn$ LANGUAGE plpgsql;

-- Instantes com fuso e precisao de MILISSEGUNDOS.
--
-- O Prisma gravava timestamp(3); manter a mesma precisao e o que faz o
-- carimbo de updatedAt sobreviver ao ida-e-volta por JSON. Sem isso, a
-- comparacao da trava de colisao nunca casa e toda gravacao devolve 409.
CREATE OR REPLACE FUNCTION pg_temp.para_timestamptz(t text, c text) RETURNS void AS $fn$
DECLARE tipo text;
BEGIN
  IF NOT pg_temp.tem_coluna(t, c) THEN RETURN; END IF;
  SELECT data_type INTO tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name=t AND column_name=c;
  IF tipo = 'timestamp without time zone' THEN
    -- Valor gravado pelo Prisma ja estava em UTC.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz(3) USING %I AT TIME ZONE ''UTC''',
      t, c, c);
  ELSE
    -- Ja tem fuso: so ajusta a precisao.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz(3)', t, c);
  END IF;
END;
$fn$ LANGUAGE plpgsql;

-- double precision -> numeric(12,2), arredondando ao centavo.
CREATE OR REPLACE FUNCTION pg_temp.para_dinheiro(t text, c text) RETURNS void AS $fn$
DECLARE tipo text;
BEGIN
  IF NOT pg_temp.tem_coluna(t, c) THEN RETURN; END IF;
  SELECT data_type INTO tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name=t AND column_name=c;
  IF tipo <> 'numeric' THEN
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(12,2) USING round(%I::numeric, 2)', t, c, c);
  END IF;
END;
$fn$ LANGUAGE plpgsql;

-- Remove as FKs herdadas do Prisma; a PARTE 3 recria com RESTRICT/SET NULL.
CREATE OR REPLACE FUNCTION pg_temp.solta_fks(t text) RETURNS void AS $fn$
DECLARE r record;
BEGIN
  IF NOT pg_temp.tem_tabela(t) THEN RETURN; END IF;
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = format('public.%I', t)::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);
  END LOOP;
END;
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ── 1. Renomear colunas camelCase -> snake_case ──────────────────────────
SELECT
  pg_temp.ren('users','createdAt','created_at'),
  pg_temp.ren('users','updatedAt','updated_at'),

  pg_temp.ren('vehicles','yearModel','year_model'),
  pg_temp.ren('vehicles','sellingPrice','selling_price'),
  pg_temp.ren('vehicles','fipePrice','fipe_price'),
  pg_temp.ren('vehicles','soldPrice','sold_price'),
  pg_temp.ren('vehicles','photoCategories','photo_categories'),
  pg_temp.ren('vehicles','rawDescription','raw_description'),
  pg_temp.ren('vehicles','formattedAd','formatted_ad'),
  pg_temp.ren('vehicles','internalNotes','internal_notes'),
  pg_temp.ren('vehicles','sourceGroupId','source_group_id'),
  pg_temp.ren('vehicles','sourceMessageId','source_message_id'),
  pg_temp.ren('vehicles','sourceSenderJid','source_sender_jid'),
  pg_temp.ren('vehicles','sellerPhone','seller_phone'),
  pg_temp.ren('vehicles','vehicleHash','vehicle_hash'),
  pg_temp.ren('vehicles','identityHash','identity_hash'),
  pg_temp.ren('vehicles','photoHash','photo_hash'),
  pg_temp.ren('vehicles','rejectionReason','rejection_reason'),
  pg_temp.ren('vehicles','rejectionTags','rejection_tags'),
  pg_temp.ren('vehicles','autoRejectedReason','auto_rejected_reason'),
  pg_temp.ren('vehicles','qualityScore','quality_score'),
  pg_temp.ren('vehicles','isVip','is_vip'),
  pg_temp.ren('vehicles','soldNotes','sold_notes'),
  pg_temp.ren('vehicles','preparedTargetGroupIds','prepared_target_group_ids'),
  pg_temp.ren('vehicles','publishingLockedAt','publishing_locked_at'),
  pg_temp.ren('vehicles','capturedAt','captured_at'),
  pg_temp.ren('vehicles','approvedAt','approved_at'),
  pg_temp.ren('vehicles','publishedAt','published_at'),
  pg_temp.ren('vehicles','rejectedAt','rejected_at'),
  pg_temp.ren('vehicles','preparedAt','prepared_at'),
  pg_temp.ren('vehicles','soldAt','sold_at'),
  pg_temp.ren('vehicles','createdAt','created_at'),
  pg_temp.ren('vehicles','updatedAt','updated_at'),

  pg_temp.ren('whatsapp_groups','groupId','group_id'),
  pg_temp.ren('whatsapp_groups','nameLocked','name_locked'),
  pg_temp.ren('whatsapp_groups','photoUrl','photo_url'),
  pg_temp.ren('whatsapp_groups','isCommunity','is_community'),
  pg_temp.ren('whatsapp_groups','isAnnounce','is_announce'),
  pg_temp.ren('whatsapp_groups','isContact','is_contact'),
  pg_temp.ren('whatsapp_groups','kindOverride','kind_override'),
  pg_temp.ren('whatsapp_groups','ownerPhone','owner_phone'),
  pg_temp.ren('whatsapp_groups','createdAt','created_at'),
  pg_temp.ren('whatsapp_groups','updatedAt','updated_at'),

  pg_temp.ren('post_history','vehicleId','vehicle_id'),
  pg_temp.ren('post_history','vehicleHash','vehicle_hash'),
  pg_temp.ren('post_history','targetGroupId','target_group_id'),
  pg_temp.ren('post_history','postedAt','posted_at'),
  pg_temp.ren('post_history','messageId','message_id'),
  pg_temp.ren('post_history','errorMessage','error_message'),
  pg_temp.ren('post_history','userId','user_id'),

  pg_temp.ren('audit_logs','entityType','entity_type'),
  pg_temp.ren('audit_logs','entityId','entity_id'),
  pg_temp.ren('audit_logs','userId','user_id'),
  pg_temp.ren('audit_logs','vehicleId','vehicle_id'),
  pg_temp.ren('audit_logs','ipAddress','ip_address'),
  pg_temp.ren('audit_logs','userAgent','user_agent'),
  pg_temp.ren('audit_logs','createdAt','created_at'),

  pg_temp.ren('message_templates','createdAt','created_at'),
  pg_temp.ren('message_templates','updatedAt','updated_at'),

  pg_temp.ren('media_files','mimeType','mime_type'),
  pg_temp.ren('media_files','originalUrl','original_url'),
  pg_temp.ren('media_files','createdAt','created_at');
--> statement-breakpoint

-- ── 2. Colunas de auditoria em toda tabela ───────────────────────────────
SELECT
  pg_temp.auditoria('users'),
  pg_temp.auditoria('vehicles'),
  pg_temp.auditoria('whatsapp_groups'),
  pg_temp.auditoria('post_history'),
  pg_temp.auditoria('audit_logs'),
  pg_temp.auditoria('settings'),
  pg_temp.auditoria('message_templates'),
  pg_temp.auditoria('media_files');
--> statement-breakpoint

-- ── 3. Instantes com fuso ────────────────────────────────────────────────
SELECT
  pg_temp.para_timestamptz('users','created_at'),
  pg_temp.para_timestamptz('users','updated_at'),
  pg_temp.para_timestamptz('vehicles','created_at'),
  pg_temp.para_timestamptz('vehicles','updated_at'),
  pg_temp.para_timestamptz('vehicles','captured_at'),
  pg_temp.para_timestamptz('vehicles','approved_at'),
  pg_temp.para_timestamptz('vehicles','published_at'),
  pg_temp.para_timestamptz('vehicles','rejected_at'),
  pg_temp.para_timestamptz('vehicles','prepared_at'),
  pg_temp.para_timestamptz('vehicles','sold_at'),
  pg_temp.para_timestamptz('vehicles','publishing_locked_at'),
  pg_temp.para_timestamptz('whatsapp_groups','created_at'),
  pg_temp.para_timestamptz('whatsapp_groups','updated_at'),
  pg_temp.para_timestamptz('post_history','posted_at'),
  pg_temp.para_timestamptz('audit_logs','created_at'),
  pg_temp.para_timestamptz('message_templates','created_at'),
  pg_temp.para_timestamptz('message_templates','updated_at'),
  pg_temp.para_timestamptz('media_files','created_at');
--> statement-breakpoint

-- ── 4. Dinheiro em numeric ───────────────────────────────────────────────
SELECT
  pg_temp.para_dinheiro('vehicles','price'),
  pg_temp.para_dinheiro('vehicles','selling_price'),
  pg_temp.para_dinheiro('vehicles','fipe_price'),
  pg_temp.para_dinheiro('vehicles','sold_price');
--> statement-breakpoint

-- ── 5. Menor privilegio como default de papel ────────────────────────────
DO $do$
BEGIN
  IF pg_temp.tem_coluna('users','role') THEN
    ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'OPERATOR';
  END IF;
END;
$do$;
--> statement-breakpoint

-- ── 6. Soltar as FKs do Prisma (a PARTE 3 recria com RESTRICT) ───────────
SELECT
  pg_temp.solta_fks('vehicles'),
  pg_temp.solta_fks('post_history'),
  pg_temp.solta_fks('audit_logs'),
  pg_temp.solta_fks('users'),
  pg_temp.solta_fks('whatsapp_groups'),
  pg_temp.solta_fks('settings'),
  pg_temp.solta_fks('message_templates'),
  pg_temp.solta_fks('media_files');
--> statement-breakpoint

-- ===========================================================================
-- PARTE 2 — Criar o que nao existe (banco novo). No-op em banco existente.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'OPERATOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"name_locked" boolean DEFAULT false NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"filters" text,
	"photo_url" text,
	"region" text,
	"is_community" boolean DEFAULT false NOT NULL,
	"is_announce" boolean DEFAULT false NOT NULL,
	"is_contact" boolean DEFAULT false NOT NULL,
	"kind_override" text,
	"owner_phone" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text,
	CONSTRAINT "whatsapp_groups_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"brand" text,
	"year" integer NOT NULL,
	"year_model" integer,
	"km" integer NOT NULL,
	"transmission" text,
	"fuel" text,
	"color" text,
	"plate" text,
	"location" text,
	"state" text,
	"price" numeric(12, 2) NOT NULL,
	"selling_price" numeric(12, 2),
	"fipe_price" numeric(12, 2),
	"sold_price" numeric(12, 2),
	"features" text DEFAULT '[]' NOT NULL,
	"photos" text DEFAULT '[]' NOT NULL,
	"photo_categories" text,
	"raw_description" text,
	"formatted_ad" text,
	"internal_notes" text,
	"source_group_id" text,
	"source_message_id" text,
	"source_sender_jid" text,
	"seller_phone" text,
	"vehicle_hash" text NOT NULL,
	"identity_hash" text,
	"photo_hash" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"rejection_tags" text,
	"auto_rejected_reason" text,
	"quality_score" integer,
	"is_vip" boolean DEFAULT false NOT NULL,
	"sold_notes" text,
	"prepared_target_group_ids" text,
	"publishing_locked_at" timestamp (3) with time zone,
	"captured_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp (3) with time zone,
	"published_at" timestamp (3) with time zone,
	"rejected_at" timestamp (3) with time zone,
	"prepared_at" timestamp (3) with time zone,
	"sold_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text,
	CONSTRAINT "vehicles_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_history" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"vehicle_hash" text NOT NULL,
	"target_group_id" text NOT NULL,
	"posted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"message_id" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"user_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" text,
	"user_id" text,
	"vehicle_id" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"shortcut" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"data" text NOT NULL,
	"original_url" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" text
);
--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_modified_by_users_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_groups_modified_by_users_id_fk') THEN
    ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_source_group_id_whatsapp_groups_group_id_fk') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_source_group_id_whatsapp_groups_group_id_fk" FOREIGN KEY ("source_group_id") REFERENCES "public"."whatsapp_groups"("group_id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_modified_by_users_id_fk') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_history_vehicle_id_vehicles_id_fk') THEN
    ALTER TABLE "post_history" ADD CONSTRAINT "post_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_history_target_group_id_whatsapp_groups_group_id_fk') THEN
    ALTER TABLE "post_history" ADD CONSTRAINT "post_history_target_group_id_whatsapp_groups_group_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "public"."whatsapp_groups"("group_id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_history_user_id_users_id_fk') THEN
    ALTER TABLE "post_history" ADD CONSTRAINT "post_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_history_modified_by_users_id_fk') THEN
    ALTER TABLE "post_history" ADD CONSTRAINT "post_history_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_users_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_vehicle_id_vehicles_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_modified_by_users_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_modified_by_users_id_fk') THEN
    ALTER TABLE "settings" ADD CONSTRAINT "settings_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_modified_by_users_id_fk') THEN
    ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_files_modified_by_users_id_fk') THEN
    ALTER TABLE "media_files" ADD CONSTRAINT "media_files_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $do$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_is_deleted_idx" ON "users" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_groups_role_active_idx" ON "whatsapp_groups" USING btree ("role","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_groups_is_deleted_idx" ON "whatsapp_groups" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_status_idx" ON "vehicles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_vehicle_hash_idx" ON "vehicles" USING btree ("vehicle_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_captured_at_idx" ON "vehicles" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_source_message_id_idx" ON "vehicles" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_source_group_id_idx" ON "vehicles" USING btree ("source_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_state_idx" ON "vehicles" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_photo_hash_idx" ON "vehicles" USING btree ("photo_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_prepared_at_idx" ON "vehicles" USING btree ("prepared_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_source_sender_jid_idx" ON "vehicles" USING btree ("source_sender_jid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_identity_hash_idx" ON "vehicles" USING btree ("identity_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_is_deleted_idx" ON "vehicles" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_history_hash_target_posted_idx" ON "post_history" USING btree ("vehicle_hash","target_group_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_history_posted_at_idx" ON "post_history" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_history_vehicle_id_idx" ON "post_history" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_history_is_deleted_idx" ON "post_history" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_vehicle_id_idx" ON "audit_logs" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settings_is_deleted_idx" ON "settings" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_is_deleted_idx" ON "message_templates" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_created_at_idx" ON "media_files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_is_deleted_idx" ON "media_files" USING btree ("is_deleted");
--> statement-breakpoint
-- ── Alinhar nomes de constraint UNIQUE herdados do Prisma ───────────────
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE "users" RENAME CONSTRAINT "users_email_key" TO "users_email_unique";
  END IF;
END $do$;
--> statement-breakpoint
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_groups_groupId_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_groups_group_id_unique') THEN
    ALTER TABLE "whatsapp_groups" RENAME CONSTRAINT "whatsapp_groups_groupId_key" TO "whatsapp_groups_group_id_unique";
  END IF;
END $do$;
--> statement-breakpoint
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_sourceMessageId_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_source_message_id_unique') THEN
    ALTER TABLE "vehicles" RENAME CONSTRAINT "vehicles_sourceMessageId_key" TO "vehicles_source_message_id_unique";
  END IF;
END $do$;
--> statement-breakpoint
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_key_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_key_unique') THEN
    ALTER TABLE "settings" RENAME CONSTRAINT "settings_key_key" TO "settings_key_unique";
  END IF;
END $do$;
--> statement-breakpoint
