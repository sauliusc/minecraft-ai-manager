-- CreateEnum
CREATE TYPE "WeekThemeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "week_themes" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "WeekThemeStatus" NOT NULL DEFAULT 'DRAFT',
    "aiPayload" JSONB NOT NULL,
    "eventId" TEXT,
    "npcId" TEXT,
    "challengeIds" TEXT[],
    "rewardIds" TEXT[],
    "announcementText" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,

    CONSTRAINT "week_themes_pkey" PRIMARY KEY ("id")
);
