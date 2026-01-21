-- Add interviewTitle to InterviewSession
ALTER TABLE "InterviewSession"
ADD COLUMN IF NOT EXISTS "interviewTitle" TEXT;