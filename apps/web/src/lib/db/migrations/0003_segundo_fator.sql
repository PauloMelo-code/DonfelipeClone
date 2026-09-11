-- Segundo fator obrigatorio (REQ-D1).
--
-- Fecha o unico vermelho que sobrou da auditoria de 2026-09-10: a senha era o
-- fator UNICO. Senha vazada, credencial reaproveitada de outro site ou phishing
-- bem feito entregavam a conta inteira, e nada depois do login pedia mais nada.
--
-- A semente e guardada CIFRADA (AES-256-GCM, chave em TOTP_ENCRYPTION_KEY), e
-- nao em claro: o que vaza na pratica e um dump, e um dump nao pode devolver
-- segundos fatores funcionando.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_last_step" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_epoch" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- A consulta operacional e "quem ainda nao cadastrou o fator".
CREATE INDEX IF NOT EXISTS "users_totp_enabled_at_idx" ON "users" ("totp_enabled_at");
--> statement-breakpoint

-- Geracao de sessao nunca anda para tras.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_session_epoch_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_session_epoch_check" CHECK ("session_epoch" >= 0);
  END IF;
END $do$;
--> statement-breakpoint

-- Codigos de resgate. Sem eles, celular perdido vira conta perdida -- e a
-- pressa de recuperar acaba virando um botao de desligar o segundo fator.
CREATE TABLE IF NOT EXISTS "users_recovery_codes" (
  "id"          text PRIMARY KEY NOT NULL,
  "user_id"     text NOT NULL,
  "code_hash"   text NOT NULL,
  "used_at"     timestamp(3) with time zone,
  "created_at"  timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at"  timestamp(3) with time zone DEFAULT now() NOT NULL,
  "deleted_at"  timestamp(3) with time zone,
  "is_deleted"  boolean DEFAULT false NOT NULL,
  "modified_by" text
);
--> statement-breakpoint

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_recovery_codes_user_id_fk') THEN
    ALTER TABLE "users_recovery_codes" ADD CONSTRAINT "users_recovery_codes_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_recovery_codes_modified_by_fk') THEN
    ALTER TABLE "users_recovery_codes" ADD CONSTRAINT "users_recovery_codes_modified_by_fk"
      FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
END $do$;
--> statement-breakpoint

-- O consumo busca por dono + hash. Unico para que o mesmo codigo nao possa
-- ser inserido duas vezes na mesma conta.
CREATE UNIQUE INDEX IF NOT EXISTS "users_recovery_codes_user_hash_key"
  ON "users_recovery_codes" ("user_id", "code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_recovery_codes_user_id_idx"
  ON "users_recovery_codes" ("user_id");
