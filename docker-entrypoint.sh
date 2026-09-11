#!/bin/sh
set -e

# Migracoes versionadas do Drizzle.
#
# Substitui o `prisma db push --accept-data-loss`, que sincronizava o banco
# com o schema sem historico e podia descartar dado para "encaixar" a forma.
# Agora cada mudanca e um arquivo SQL revisavel, aplicado uma unica vez e
# registrado na tabela de controle do proprio Drizzle.
echo "Running database migrations..."
node apps/web/scripts/migrate.mjs

# O SEED NAO RODA AQUI, de proposito.
#
# Antes, um banco vazio disparava o seed no start do container -- inclusive em
# producao. E esse seed comeca apagando users, audit_logs, vehicles,
# whatsapp_groups e settings, e criava um ADMIN com senha literal. Um restore
# mal sincronizado ou um banco novo apagava tudo e plantava uma conta com
# senha conhecida.
#
# Provisionamento e ato explicito, rodado por gente:
#   SEED_ADMIN_PASSWORD='<senha forte>' pnpm db:seed

echo "Starting server..."
exec node apps/web/server.js
