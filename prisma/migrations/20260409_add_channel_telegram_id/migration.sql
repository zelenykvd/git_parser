-- AlterTable
ALTER TABLE "Channel" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "Channel" ADD COLUMN "telegramId" TEXT;
CREATE UNIQUE INDEX "Channel_telegramId_key" ON "Channel"("telegramId");
