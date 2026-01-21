import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  // Ensure default organization exists
  const org = await prisma.organization.upsert({
    where: { slug: "default-org" },
    update: {},
    create: {
      name: "Default Organization",
      slug: "default-org",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@aiinterview.com" },
    update: { organizationId: org.id },
    create: {
      name: "Admin",
      email: "admin@aiinterview.com",
      password: passwordHash,
      role: UserRole.ORG_ADMIN,
      organizationId: org.id,
    },
  });

  console.log("✅ Admin user seeded");
}

main()
  .catch(err => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
