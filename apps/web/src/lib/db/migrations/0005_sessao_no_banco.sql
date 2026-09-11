-- Sessao no banco (REQ-F1 e REQ-F6).
--
-- O cookie continua sendo um JWT assinado, mas deixa de ser a AUTORIDADE: ele
-- passa a carregar so o id de uma linha, e quem decide se a sessao vale e a
-- consulta a esta tabela em toda requisicao.
--
-- O que isso destrava, e que um JWT de 24 h nao permitia:
--   - encerrar sessao (o dono, ou o sistema ao trocar o fator);
--   - expiracao por INATIVIDADE, alem do teto absoluto de vida;
--   - o dono ver onde a conta dele esta aberta.
--
-- ATENCAO: esta migracao APAGA a coluna `session_epoch`, criada na 0003.
-- Ela era o substituto pobre da revogacao enquanto a sessao vivia so no token,
-- e manter as duas coisas garantiria que a proxima correcao chegasse so numa
-- delas. Nenhum dado util se perde: a coluna era um contador interno.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

CREATE TABLE IF NOT EXISTS "users_sessions" (
  "id"             text PRIMARY KEY NOT NULL,
  "user_id"        text NOT NULL,
  "ip_address"     text,
  "user_agent"     text,
  "last_seen_at"   timestamp(3) with time zone DEFAULT now() NOT NULL,
  "expires_at"     timestamp(3) with time zone NOT NULL,
  "revoked_at"     timestamp(3) with time zone,
  "revoked_reason" text,
  "created_at"     timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at"     timestamp(3) with time zone DEFAULT now() NOT NULL,
  "deleted_at"     timestamp(3) with time zone,
  "is_deleted"     boolean DEFAULT false NOT NULL,
  "modified_by"    text
);
--> statement-breakpoint

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_sessions_user_id_fk') THEN
    ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_sessions_modified_by_fk') THEN
    ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_modified_by_fk"
      FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
END $do$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "users_sessions_user_id_idx" ON "users_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_sessions_expires_at_idx" ON "users_sessions" ("expires_at");
--> statement-breakpoint

-- A revogacao agora e uma linha desta tabela; o contador nao tem mais funcao.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_session_epoch_check";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "session_epoch";
