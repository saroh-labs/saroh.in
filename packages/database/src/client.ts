import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Prisma 7 moved the datasource URL out of the schema (it lives in
// prisma.config.js for the CLI) and requires a driver adapter at runtime —
// a bare new PrismaClient() / { datasourceUrl } is rejected. We connect via
// the node-postgres adapter using DATABASE_URL (works with Neon's pooler).
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
