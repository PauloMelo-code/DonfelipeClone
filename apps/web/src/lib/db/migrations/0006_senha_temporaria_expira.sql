-- Expiracao PROPRIA da senha temporaria (REQ-E13).
--
-- A marca `must_change_password` so age se o login CHEGAR A ACONTECER. Uma
-- conta provisionada e nunca usada mantinha a temporaria valida para sempre --
-- e essa senha viajou por WhatsApp ou e-mail no dia do provisionamento.
--
-- Medido na auditoria de 2026-09-10: nao havia coluna de expiracao nenhuma.
--
-- Nulo = sem prazo. E o estado de toda conta cuja senha e do proprio dono; so
-- a senha definida por administrador ganha data.
--
-- Idempotente: pode rodar em banco novo ou ja existente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_password_expires_at"
  timestamp(3) with time zone;
--> statement-breakpoint

-- A consulta operacional e "quais temporarias ainda valem".
CREATE INDEX IF NOT EXISTS "users_temp_password_expires_at_idx"
  ON "users" ("temp_password_expires_at");
