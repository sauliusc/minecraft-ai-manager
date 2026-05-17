#!/bin/sh
set -e

echo "▶ Running database migrations..."
npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss

echo "▶ Seeding admin account..."
node scripts/seed-admin.js

echo "▶ Starting API..."
exec node dist/index.js
