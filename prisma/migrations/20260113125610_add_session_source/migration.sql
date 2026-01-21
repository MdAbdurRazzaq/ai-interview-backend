-- CreateEnum
CREATE TYPE "SessionSource" AS ENUM ('INTERNAL', 'PUBLIC');

-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "source" "SessionSource" NOT NULL DEFAULT 'INTERNAL';
