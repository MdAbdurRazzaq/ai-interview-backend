INSERT INTO "Organization" (id, name, slug)
VALUES (gen_random_uuid(), 'Default Organization', 'default-org')
ON CONFLICT (slug) DO NOTHING;

UPDATE "User"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;

UPDATE "InterviewSession"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;

UPDATE "InterviewTemplate"
SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1)
WHERE "organizationId" IS NULL;
