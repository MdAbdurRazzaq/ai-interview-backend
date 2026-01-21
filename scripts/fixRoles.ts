import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing role values directly in DB...");

  await prisma.$executeRawUnsafe(`
    UPDATE "User"
    SET role = 'org_admin'
    WHERE role = 'ORG_ADMIN';
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "User"
    SET role = 'admin'
    WHERE role = 'ADMIN';
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "User"
    SET role = 'reviewer'
    WHERE role = 'REVIEWER';
  `);

  console.log("✅ Role values fixed");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
