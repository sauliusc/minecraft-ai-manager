#!/bin/sh
set -e

echo "▶ Running database migrations..."
npx prisma db push --accept-data-loss

echo "▶ Seeding admin account..."
node scripts/seed-admin.js

echo "▶ Starting API..."
exec node dist/index.js
