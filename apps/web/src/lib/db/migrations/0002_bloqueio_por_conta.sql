-- Bloqueio por conta.
--
-- Fecha o REQ-C1 da auditoria de 2026-09-10, que foi reproduzido ao vivo: 12
-- tentativas contra a mesma conta, rodando o `X-Forwarded-For` a cada uma, e a
-- senha certa entrou na 13a. O limitador por IP nao protege uma conta -- o
-- cabecalho e forjavel. O contador que importa e este, por conta e persistido.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_failed_at" timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp(3) with time zone;
--> statement-breakpoint

-- A consulta operacional e "quem esta travado agora", nunca a tabela inteira.
CREATE INDEX IF NOT EXISTS "users_locked_until_idx" ON "users" ("locked_until");
--> statement-breakpoint

-- Contador nunca negativo. A conta e incrementada por uma unica operacao
-- condicional; este CHECK e a rede embaixo dela.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_failed_attempts_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_failed_attempts_check"
      CHECK ("failed_attempts" >= 0);
  END IF;
END $do$;
