-- Quando o operador editou o texto do anuncio a mao.
--
-- Aprovar e publicar regeravam o anuncio do zero e jogavam fora o que o
-- operador escreveu no card. Com a marca, o texto dele e mantido e so a linha
-- de preco e atualizada. Nulo = texto gerado pelo sistema.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "ad_edited_at" timestamp(3) with time zone;
