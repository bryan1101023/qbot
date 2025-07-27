-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "robloxId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "suspendedUntil" DATETIME,
    "unsuspendRank" INTEGER,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "weeklyActivityMinutes" INTEGER NOT NULL DEFAULT 0,
    "monthlyActivityMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastActivityReset" DATETIME
);
INSERT INTO "new_User" ("id", "isBanned", "lastActivityReset", "monthlyActivityMinutes", "robloxId", "suspendedUntil", "unsuspendRank", "weeklyActivityMinutes", "xp") SELECT "id", "isBanned", "lastActivityReset", coalesce("monthlyActivityMinutes", 0) AS "monthlyActivityMinutes", "robloxId", "suspendedUntil", "unsuspendRank", coalesce("weeklyActivityMinutes", 0) AS "weeklyActivityMinutes", "xp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_robloxId_key" ON "User"("robloxId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
