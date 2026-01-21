import prisma from './database/prisma';

async function main() {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public';
  `);

  console.log(tables);
  process.exit(0);
}

main();
