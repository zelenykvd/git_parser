-- Public link to the message published in the target Telegram channel
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "telegramUrl" TEXT;
