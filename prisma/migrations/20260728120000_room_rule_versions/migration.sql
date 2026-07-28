-- CreateTable
CREATE TABLE "RoomRuleVersion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "exactScorePoints" INTEGER NOT NULL,
    "outcomePoints" INTEGER NOT NULL,
    "advancePickPoints" INTEGER NOT NULL,
    "enabledMarkets" JSONB NOT NULL,
    "customMarketConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomRuleVersion_roomId_effectiveFrom_idx" ON "RoomRuleVersion"("roomId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "RoomRuleVersion" ADD CONSTRAINT "RoomRuleVersion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
