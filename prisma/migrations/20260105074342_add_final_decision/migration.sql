/*
  Warnings:

  - The `finalDecision` column on the `InterviewSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "InterviewSession" DROP COLUMN "finalDecision",
ADD COLUMN     "finalDecision" "FinalDecision";
