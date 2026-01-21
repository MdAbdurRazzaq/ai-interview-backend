UPDATE "User"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;

UPDATE "InterviewSession"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;

UPDATE "InterviewTemplate"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;
