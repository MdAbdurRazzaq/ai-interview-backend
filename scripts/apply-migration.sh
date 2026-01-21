#!/bin/bash
# Apply the InterviewTemplate status migration

echo "Applying InterviewTemplate status migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable not set"
  exit 1
fi

# Apply the migration
psql "$DATABASE_URL" << EOF
-- Add status enum type
DO \$\$ BEGIN
  CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END \$\$;

-- Add status column to InterviewTemplate with default ACTIVE
ALTER TABLE "InterviewTemplate"
ADD COLUMN "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE';

-- Create indexes for better query performance
CREATE INDEX "InterviewTemplate_status_idx" ON "InterviewTemplate"("status");
CREATE INDEX "InterviewTemplate_orgid_status_idx" ON "InterviewTemplate"("organizationId", "status");
EOF

if [ $? -eq 0 ]; then
  echo "✅ Migration applied successfully!"
else
  echo "❌ Migration failed"
  exit 1
fi
