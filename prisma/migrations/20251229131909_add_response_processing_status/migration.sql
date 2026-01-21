-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "InterviewResponse" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';
