ALTER TABLE "Player" ALTER COLUMN "balance" TYPE DOUBLE PRECISION USING "balance"::double precision;
ALTER TABLE "Player" ALTER COLUMN "clickProfit" TYPE DOUBLE PRECISION USING "clickProfit"::double precision;
ALTER TABLE "Player" ALTER COLUMN "hourlyProfit" TYPE DOUBLE PRECISION USING "hourlyProfit"::double precision;
ALTER TABLE "FinalReward" ALTER COLUMN "finalBalance" TYPE DOUBLE PRECISION USING "finalBalance"::double precision;

ALTER TABLE "Player" ADD COLUMN "level10UnlockStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "level10AnimationCompleted" BOOLEAN NOT NULL DEFAULT false;
