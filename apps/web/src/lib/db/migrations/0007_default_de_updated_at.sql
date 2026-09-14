-- Default de created_at e updated_at nas tabelas que vieram do Prisma.
--
-- O Prisma declarava `updatedAt @updatedAt`, que NAO cria default no banco: era
-- o proprio ORM que preenchia a data a cada escrita. A 0000 renomeia
-- `updatedAt` para `updated_at` e em seguida tenta
--   ADD COLUMN IF NOT EXISTS updated_at timestamptz(3) NOT NULL DEFAULT now()
-- Como a coluna ja existe depois do rename, o IF NOT EXISTS pula a instrucao
-- inteira -- inclusive o DEFAULT. A coluna fica NOT NULL e sem default.
--
-- O Drizzle nao manda `updated_at` no INSERT: conta com o default do banco.
-- Num banco que veio do Prisma, que e o de producao, todo INSERT em users,
-- vehicles, whatsapp_groups e message_templates falha por NOT NULL. Criar
-- usuario devolvia 500, e a captura de veiculo pelo webhook e o auto-cadastro
-- de grupo quebravam do mesmo jeito. Banco criado do zero pelas migracoes
-- nunca teve o problema -- por isso nada disso aparecia em desenvolvimento.
--
-- SET DEFAULT so altera metadado: nao reescreve a tabela nem toca em linha.
-- Vai nas oito tabelas e nas duas colunas para nao depender de adivinhar o que
-- cada banco herdou do Prisma. Idempotente: pode rodar em banco novo ou antigo.

ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "post_history" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "post_history" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "updated_at" SET DEFAULT now();
