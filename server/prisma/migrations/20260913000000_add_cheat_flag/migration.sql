-- CreateTable: GrimAC violations surfaced in CraftControl (#395).
--
-- Grim keeps its own history in a SQLite file inside the container, which the
-- dashboard cannot read. Flags are pushed here at the thresholds Grim itself
-- treats as alert-worthy, so a player who needs looking at is visible without
-- an SSH session.
CREATE TABLE IF NOT EXISTS "cheat_flags" (
    "id"          TEXT NOT NULL,
    "username"    TEXT NOT NULL,
    "check"       TEXT NOT NULL,
    "violations"  INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "verbose"     TEXT NOT NULL DEFAULT '',
    "reviewed"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheat_flags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cheat_flags_username_idx"  ON "cheat_flags"("username");
CREATE INDEX IF NOT EXISTS "cheat_flags_createdAt_idx" ON "cheat_flags"("createdAt");
CREATE INDEX IF NOT EXISTS "cheat_flags_reviewed_idx"  ON "cheat_flags"("reviewed");
