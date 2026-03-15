#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss

echo "Checking if seed is needed..."
VEHICLE_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.vehicle.count().then(c=>{console.log(c);p.\$disconnect()}).catch(()=>{console.log('0');p.\$disconnect()})")

if [ "$VEHICLE_COUNT" = "0" ]; then
  echo "No vehicles found, running seed..."
  node prisma/seed.js
else
  echo "Database already seeded ($VEHICLE_COUNT vehicles), skipping."
fi

echo "Starting server..."
exec node apps/web/server.js
