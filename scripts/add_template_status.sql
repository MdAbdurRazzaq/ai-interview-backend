-- Add status enum type
DO $$ BEGIN
  CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add status column to InterviewTemplate with default ACTIVE
ALTER TABLE "InterviewTemplate"
ADD COLUMN "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE';

-- Create index for filtering by status
CREATE INDEX "InterviewTemplate_status_idx" ON "InterviewTemplate"("status");
CREATE INDEX "InterviewTemplate_orgid_status_idx" ON "InterviewTemplate"("organizationId", "status");
