-- AlterTable: give BroadcastTrigger somewhere to record what it has already done.
-- Triggers are evaluated on a timer, so each one needs to know when it last fired
-- (cooldowns) and which thresholds it has already announced (so a milestone is
-- not re-broadcast on every tick).
ALTER TABLE "BroadcastTrigger" ADD COLUMN IF NOT EXISTS "lastFiredAt" TIMESTAMP(3);
ALTER TABLE "BroadcastTrigger" ADD COLUMN IF NOT EXISTS "state" JSONB NOT NULL DEFAULT '{}';
