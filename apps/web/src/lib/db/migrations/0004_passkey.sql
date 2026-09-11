-- Passkey: o fator resistente a phishing (REQ-D2).
--
-- O TOTP fechou a senha vazada, mas nao a tela falsa: quem digita a senha numa
-- copia do site digita o codigo nela tambem, e o atacante repassa os dois em
-- tempo real. A assinatura de uma passkey e feita sobre o DOMINIO de quem
-- pediu, entao a que sai numa tela falsa nao serve no site verdadeiro.
--
-- O que entra no banco e a chave PUBLICA. A privada nunca sai do autenticador,
-- e por isso esta tabela nao precisa de cifra -- ao contrario da semente TOTP,
-- que o servidor tem que reler para calcular o codigo.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

CREATE TABLE IF NOT EXISTS "users_passkeys" (
  "id"            text PRIMARY KEY NOT NULL,
  "user_id"       text NOT NULL,
  "credential_id" text NOT NULL,
  "public_key"    text NOT NULL,
  "counter"       integer DEFAULT 0 NOT NULL,
  "transports"    text,
  "device_type"   text,
  "backed_up"     boolean DEFAULT false NOT NULL,
  "apelido"       text NOT NULL,
  "last_used_at"  timestamp(3) with time zone,
  "created_at"    timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp(3) with time zone DEFAULT now() NOT NULL,
  "deleted_at"    timestamp(3) with time zone,
  "is_deleted"    boolean DEFAULT false NOT NULL,
  "modified_by"   text
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
  "id"             text PRIMARY KEY NOT NULL,
  "challenge"      text NOT NULL,
  "tipo"           text NOT NULL,
  "user_id"        text,
  "prova_do_fator" text,
  "expires_at"     timestamp(3) with time zone NOT NULL,
  "used_at"        timestamp(3) with time zone,
  "created_at"     timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at"     timestamp(3) with time zone DEFAULT now() NOT NULL,
  "deleted_at"     timestamp(3) with time zone,
  "is_deleted"     boolean DEFAULT false NOT NULL,
  "modified_by"    text
);
--> statement-breakpoint

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_passkeys_user_id_fk') THEN
    ALTER TABLE "users_passkeys" ADD CONSTRAINT "users_passkeys_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_passkeys_modified_by_fk') THEN
    ALTER TABLE "users_passkeys" ADD CONSTRAINT "users_passkeys_modified_by_fk"
      FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_challenges_user_id_fk') THEN
    ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_challenges_modified_by_fk') THEN
    ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_modified_by_fk"
      FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_passkeys_counter_check') THEN
    ALTER TABLE "users_passkeys" ADD CONSTRAINT "users_passkeys_counter_check"
      CHECK ("counter" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_challenges_tipo_check') THEN
    ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_tipo_check"
      CHECK ("tipo" IN ('registro','login'));
  END IF;
END $do$;
--> statement-breakpoint

-- O login descobre a CONTA pela credencial: esta busca e a quente, e o unico
-- garante que a mesma credencial nao seja cadastrada duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS "users_passkeys_credential_id_key"
  ON "users_passkeys" ("credential_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_passkeys_user_id_idx" ON "users_passkeys" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webauthn_challenges_challenge_idx" ON "webauthn_challenges" ("challenge");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webauthn_challenges_expires_at_idx" ON "webauthn_challenges" ("expires_at");
