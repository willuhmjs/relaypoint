import { PrismaClient } from './prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/postgres'
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
