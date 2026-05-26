-- AlterTable: add deliveredAt (nullable) to PlayerReward for delivery deduplication
ALTER TABLE "PlayerReward" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerReward_playerId_deliveredAt_idx" ON "PlayerReward"("playerId", "deliveredAt");
