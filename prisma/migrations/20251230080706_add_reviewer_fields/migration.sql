-- AlterTable
ALTER TABLE "InterviewResponse" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerNotes" TEXT,
ADD COLUMN     "reviewerScore" INTEGER;
