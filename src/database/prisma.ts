import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

console.log('✅ Prisma client loaded');

export default prisma;
