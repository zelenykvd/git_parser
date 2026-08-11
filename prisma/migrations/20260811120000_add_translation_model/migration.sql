-- Which provider/model produced the translation, e.g. "voidai/gpt-5.1"
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "translationModel" TEXT;
