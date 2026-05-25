-- CreateTable
CREATE TABLE IF NOT EXISTS "Deployment" (
    "id" TEXT NOT NULL,
    "imageTag" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deployment_createdAt_idx" ON "Deployment"("createdAt");
