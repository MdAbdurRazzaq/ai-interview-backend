import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ALTER COLUMN role TYPE TEXT
    USING role::text;
  `);

  console.log("✅ role column converted to TEXT");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
