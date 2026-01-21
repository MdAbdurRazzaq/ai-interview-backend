ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "InterviewSession"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "InterviewTemplate"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
