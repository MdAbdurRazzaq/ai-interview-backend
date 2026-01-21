ALTER TABLE "User"
ADD CONSTRAINT "User_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE SET NULL;

ALTER TABLE "InterviewSession"
ADD CONSTRAINT "InterviewSession_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE SET NULL;

ALTER TABLE "InterviewTemplate"
ADD CONSTRAINT "InterviewTemplate_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE SET NULL;
