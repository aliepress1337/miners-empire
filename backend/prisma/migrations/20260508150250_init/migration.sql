-- CreateTable
CREATE TABLE "GameState" (
    "id" TEXT NOT NULL,
    "gameStartedAt" TIMESTAMP(3) NOT NULL,
    "gameEndsAt" TIMESTAMP(3) NOT NULL,
    "rewardPool" INTEGER NOT NULL DEFAULT 20,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "clickProfit" INTEGER NOT NULL DEFAULT 1,
    "hourlyProfit" INTEGER NOT NULL DEFAULT 0,
    "smallBoneLevel" INTEGER NOT NULL DEFAULT 0,
    "bigBoneLevel" INTEGER NOT NULL DEFAULT 0,
    "autoFarm1Level" INTEGER NOT NULL DEFAULT 0,
    "autoFarm2Level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalReward" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "telegramId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "finalBalance" INTEGER NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL,
    "rewardAmount" DOUBLE PRECISION NOT NULL,
    "promoCode" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_telegramId_key" ON "Player"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalReward_playerId_key" ON "FinalReward"("playerId");

-- AddForeignKey
ALTER TABLE "FinalReward" ADD CONSTRAINT "FinalReward_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
