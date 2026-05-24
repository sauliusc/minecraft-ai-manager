-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('SUCCESS', 'PENDING', 'CONFIRMED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('BLOCK_BREAK', 'KILL_MOB', 'CRAFT_ITEM', 'TRAVEL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "QuestCategory" AS ENUM ('DAILY', 'WEEKLY', 'SIDE');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('ITEM', 'XP', 'COMMAND', 'CURRENCY', 'MYSTERY_BOX');

-- CreateEnum
CREATE TYPE "RewardRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('BOSS_RAID', 'TREASURE_HUNT', 'BUILD_BATTLE', 'CLAN_WAR');

-- CreateEnum
CREATE TYPE "GameEventState" AS ENUM ('UPCOMING', 'ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('MUTE', 'UNMUTE', 'KICK', 'BAN', 'UNBAN');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NpcType" AS ENUM ('GUIDE', 'QUEST_GIVER', 'MERCHANT');

-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "BroadcastTriggerType" AS ENUM ('DAILY_LOGIN', 'MILESTONE', 'LOW_ACTIVITY');

-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Player" (
    "username" TEXT NOT NULL,
    "firstJoinAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastLoginDate" TIMESTAMP(3),
    "coins" INTEGER NOT NULL DEFAULT 0,
    "crystals" INTEGER NOT NULL DEFAULT 0,
    "safechat" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "rewardId" TEXT,
    "activeFrom" TIMESTAMP(3) NOT NULL,
    "activeUntil" TIMESTAMP(3) NOT NULL,
    "assignedTo" TEXT[],
    "questCategory" "QuestCategory",

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeProgress" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChallengeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RewardType" NOT NULL,
    "rarity" "RewardRarity" NOT NULL DEFAULT 'COMMON',
    "config" JSONB NOT NULL,
    "lootTable" JSONB,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerReward" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "PlayerReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MODERATOR',
    "autoConfirm" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestBody" JSONB,
    "ipAddress" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'SUCCESS',
    "pendingActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "PendingStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "type" "GameEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "state" "GameEventState" NOT NULL DEFAULT 'UPCOMING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLeaderboardEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "EventLeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "chatSnapshot" TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channels" TEXT[],
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skinUrl" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "locWorld" TEXT NOT NULL DEFAULT 'world',
    "locX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locY" DOUBLE PRECISION NOT NULL DEFAULT 64,
    "locZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locYaw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "NpcType" NOT NULL DEFAULT 'GUIDE',
    "dialogueLines" TEXT[],
    "questIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerNpcRelationship" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "relationshipScore" INTEGER NOT NULL DEFAULT 0,
    "completedQuestIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNpcRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "material" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "sold" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "homeWorld" TEXT,
    "homeX" DOUBLE PRECISION,
    "homeY" DOUBLE PRECISION,
    "homeZ" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanMember" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanInvite" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanWar" (
    "id" TEXT NOT NULL,
    "clan1Id" TEXT NOT NULL,
    "clan2Id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "winnerId" TEXT,
    "clan1Score" INTEGER NOT NULL DEFAULT 0,
    "clan2Score" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ClanWar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCosmetics" (
    "playerId" TEXT NOT NULL,
    "titleId" TEXT,
    "chatColor" TEXT,
    "particleType" TEXT,
    "petType" TEXT,
    "trailType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCosmetics_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "CosmeticTitle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingVote" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "playerIgN" TEXT NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastTrigger" (
    "id" TEXT NOT NULL,
    "type" "BroadcastTriggerType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "BroadcastTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_challenge_drafts" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_challenge_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_engagement_scans" (
    "id" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_engagement_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_scans" (
    "id" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Challenge_questCategory_idx" ON "Challenge"("questCategory");

-- CreateIndex
CREATE INDEX "ChallengeProgress_playerId_idx" ON "ChallengeProgress"("playerId");

-- CreateIndex
CREATE INDEX "ChallengeProgress_challengeId_idx" ON "ChallengeProgress"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeProgress_playerId_challengeId_key" ON "ChallengeProgress"("playerId", "challengeId");

-- CreateIndex
CREATE INDEX "PlayerReward_playerId_idx" ON "PlayerReward"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_resource_idx" ON "ActivityLog"("resource");

-- CreateIndex
CREATE INDEX "ActivityLog_status_idx" ON "ActivityLog"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "PendingAction_userId_idx" ON "PendingAction"("userId");

-- CreateIndex
CREATE INDEX "PendingAction_status_idx" ON "PendingAction"("status");

-- CreateIndex
CREATE INDEX "PendingAction_createdAt_idx" ON "PendingAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventLeaderboardEntry_eventId_playerId_key" ON "EventLeaderboardEntry"("eventId", "playerId");

-- CreateIndex
CREATE INDEX "ModerationReport_status_idx" ON "ModerationReport"("status");

-- CreateIndex
CREATE INDEX "ModerationReport_reportedId_idx" ON "ModerationReport"("reportedId");

-- CreateIndex
CREATE INDEX "ModerationReport_createdAt_idx" ON "ModerationReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerBlock_blockerId_blockedId_key" ON "PlayerBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "ChatLog_playerId_idx" ON "ChatLog"("playerId");

-- CreateIndex
CREATE INDEX "ChatLog_createdAt_idx" ON "ChatLog"("createdAt");

-- CreateIndex
CREATE INDEX "ChatLog_flagged_idx" ON "ChatLog"("flagged");

-- CreateIndex
CREATE INDEX "BroadcastMessage_status_idx" ON "BroadcastMessage"("status");

-- CreateIndex
CREATE INDEX "BroadcastMessage_scheduledAt_idx" ON "BroadcastMessage"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerNpcRelationship_playerId_npcId_key" ON "PlayerNpcRelationship"("playerId", "npcId");

-- CreateIndex
CREATE INDEX "MarketListing_sellerId_idx" ON "MarketListing"("sellerId");

-- CreateIndex
CREATE INDEX "MarketListing_sold_idx" ON "MarketListing"("sold");

-- CreateIndex
CREATE INDEX "MarketListing_expiresAt_idx" ON "MarketListing"("expiresAt");

-- CreateIndex
CREATE INDEX "EconomyAuditLog_targetId_idx" ON "EconomyAuditLog"("targetId");

-- CreateIndex
CREATE INDEX "EconomyAuditLog_createdAt_idx" ON "EconomyAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_name_key" ON "Clan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_tag_key" ON "Clan"("tag");

-- CreateIndex
CREATE INDEX "Clan_leaderId_idx" ON "Clan"("leaderId");

-- CreateIndex
CREATE INDEX "ClanMember_clanId_idx" ON "ClanMember"("clanId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanMember_playerId_key" ON "ClanMember"("playerId");

-- CreateIndex
CREATE INDEX "ClanInvite_inviteeId_idx" ON "ClanInvite"("inviteeId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanInvite_clanId_inviteeId_key" ON "ClanInvite"("clanId", "inviteeId");

-- CreateIndex
CREATE INDEX "ClanWar_clan1Id_idx" ON "ClanWar"("clan1Id");

-- CreateIndex
CREATE INDEX "ClanWar_clan2Id_idx" ON "ClanWar"("clan2Id");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticTitle_name_key" ON "CosmeticTitle"("name");

-- CreateIndex
CREATE INDEX "PendingVote_playerId_idx" ON "PendingVote"("playerId");

-- CreateIndex
CREATE INDEX "PendingVote_claimed_idx" ON "PendingVote"("claimed");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastTrigger_type_key" ON "BroadcastTrigger"("type");

-- CreateIndex
CREATE INDEX "ai_challenge_drafts_status_idx" ON "ai_challenge_drafts"("status");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReward" ADD CONSTRAINT "PlayerReward_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReward" ADD CONSTRAINT "PlayerReward_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLeaderboardEntry" ADD CONSTRAINT "EventLeaderboardEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GameEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerNpcRelationship" ADD CONSTRAINT "PlayerNpcRelationship_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "NpcDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Player"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanMember" ADD CONSTRAINT "ClanMember_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanInvite" ADD CONSTRAINT "ClanInvite_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing SUPER_ADMIN users get autoConfirm=true to preserve current behavior
UPDATE "User" SET "autoConfirm" = true WHERE role = 'SUPER_ADMIN';
