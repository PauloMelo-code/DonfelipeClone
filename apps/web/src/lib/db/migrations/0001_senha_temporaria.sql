-- Senha temporaria definida por administrador.
--
-- Fecha o REQ-E8 da auditoria: um administrador nunca escolhe a senha
-- DEFINITIVA de outra pessoa. O que ele define passa a ser temporaria, e
-- enquanto esta marca estiver ligada a conta so alcanca a rota de troca da
-- propria senha.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Indice parcial: a consulta e sempre "quem ainda precisa trocar", nunca a
-- tabela inteira, e a coluna e falsa na esmagadora maioria das linhas.
CREATE INDEX IF NOT EXISTS "users_must_change_password_idx"
  ON "users" ("must_change_password") WHERE "must_change_password" = true;
--> statement-breakpoint

-- Nunca zero administradores: a guarda vive na aplicacao (lib/guardas/usuarios.ts),
-- mas o banco tambem recusa o papel invalido, que era por onde uma linha
-- inserida fora da rota nascia com privilegio inesperado.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
      CHECK ("role" IN ('ADMIN', 'OPERATOR'));
  END IF;
END $do$;
