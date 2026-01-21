/*
  Warnings:

  - Made the column `organizationId` on table `InterviewTemplate` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "InterviewTemplate" DROP CONSTRAINT "InterviewTemplate_organizationId_fkey";

-- AlterTable
ALTER TABLE "InterviewTemplate" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "InterviewTemplate" ADD CONSTRAINT "InterviewTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
