/*
  Warnings:

  - You are about to drop the column `maxDuration` on the `InterviewQuestion` table. All the data in the column will be lost.
  - You are about to drop the column `questionText` on the `InterviewQuestion` table. All the data in the column will be lost.
  - You are about to drop the column `orderIndex` on the `SessionQuestion` table. All the data in the column will be lost.
  - Added the required column `text` to the `InterviewQuestion` table without a default value. This is not possible if the table is not empty.
  - Made the column `organizationId` on table `QuestionBank` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "QuestionBank" DROP CONSTRAINT "QuestionBank_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "SessionQuestion" DROP CONSTRAINT "SessionQuestion_questionId_fkey";

-- AlterTable
ALTER TABLE "InterviewQuestion" DROP COLUMN "maxDuration",
DROP COLUMN "questionText",
ADD COLUMN     "text" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "InterviewTemplate" ADD COLUMN     "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "QuestionBank" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SessionQuestion" DROP COLUMN "orderIndex",
ADD COLUMN     "questionBankId" TEXT;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
