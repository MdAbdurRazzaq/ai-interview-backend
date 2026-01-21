INSERT INTO "Organization" (id, name, slug)
VALUES (
  gen_random_uuid(),
  'Default Organization',
  'default-org'
)
ON CONFLICT (slug) DO NOTHING;
