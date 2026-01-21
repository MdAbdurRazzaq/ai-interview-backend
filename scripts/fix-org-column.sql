ALTER TABLE "InterviewSession"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "InterviewSession"
DROP CONSTRAINT IF EXISTS "InterviewSession_organizationId_fkey";

ALTER TABLE "InterviewSession"
ADD CONSTRAINT "InterviewSession_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE SET NULL;
