import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
    namespace globalThis {
        var prisma: PrismaClient | undefined;
    }
}

// Prisma 7 moved the datasource URL out of the schema (it lives in
// prisma.config.js for the CLI) and requires a driver adapter at runtime —
// a bare new PrismaClient() / { datasourceUrl } is rejected. We connect via
// the node-postgres adapter using DATABASE_URL (works with Neon's pooler).
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = globalThis.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export * from "@prisma/client";
