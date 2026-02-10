-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "isChannel" BOOLEAN NOT NULL DEFAULT false,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "participantsCount" INTEGER,
    "avatarPath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_telegramId_key" ON "Subscription"("telegramId");
