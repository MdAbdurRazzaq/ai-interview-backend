/*
  Warnings:

  - You are about to drop the column `questionId` on the `InterviewResponse` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[sessionQuestionId]` on the table `InterviewResponse` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sessionQuestionId` to the `InterviewResponse` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "InterviewResponse" DROP CONSTRAINT "InterviewResponse_questionId_fkey";

-- AlterTable
ALTER TABLE "InterviewResponse" DROP COLUMN "questionId",
ADD COLUMN     "sessionQuestionId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InterviewResponse_sessionQuestionId_key" ON "InterviewResponse"("sessionQuestionId");

-- AddForeignKey
ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "SessionQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
