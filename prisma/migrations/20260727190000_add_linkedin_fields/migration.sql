-- LinkedIn cross-posting: remember the created share so publishing stays idempotent
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkedinPostId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
