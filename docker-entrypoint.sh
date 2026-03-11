#!/bin/sh
set -e

echo "Running database migrations..."
node node_modules/prisma/build/index.js db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || echo "Migration warning (may be first run)"

echo "Running database seed..."
node prisma/seed.js 2>&1 || echo "Seed skipped (may already exist)"

echo "Starting server..."
exec node apps/web/server.js
