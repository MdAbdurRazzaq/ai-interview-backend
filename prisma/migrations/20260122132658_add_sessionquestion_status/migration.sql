/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,questionId]` on the table `SessionQuestion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sessionId,questionBankId]` on the table `SessionQuestion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SessionQuestionStatus" AS ENUM ('PENDING', 'ANSWERED');

-- DropForeignKey
ALTER TABLE "SessionQuestion" DROP CONSTRAINT "SessionQuestion_questionId_fkey";

-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN     "status" "SessionQuestionStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "questionId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SessionQuestion_sessionId_questionId_key" ON "SessionQuestion"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionQuestion_sessionId_questionBankId_key" ON "SessionQuestion"("sessionId", "questionBankId");

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
