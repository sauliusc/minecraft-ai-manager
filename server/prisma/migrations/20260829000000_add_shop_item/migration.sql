-- CreateTable: server shop catalogue (#343).
CREATE TABLE IF NOT EXISTS "ShopItem" (
    "id"          TEXT NOT NULL,
    "material"    TEXT NOT NULL,
    "displayName" TEXT,
    "amount"      INTEGER NOT NULL DEFAULT 1,
    "price"       INTEGER NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'coins',
    "category"    TEXT NOT NULL DEFAULT 'General',
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShopItem_enabled_sortOrder_idx" ON "ShopItem"("enabled", "sortOrder");
