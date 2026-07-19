import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { createRlsProxy } from "./rls-proxy";

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

// The cached singleton is the RAW client (unproxied) so hot-reload reuses one
// connection pool.
const baseClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = baseClient;

// Everything imports this: the RLS-aware proxy. It is a transparent pass-through
// to `baseClient` unless RLS_ENFORCEMENT is on AND a request org context is
// active (see rls-proxy.ts), so behavior is unchanged by default.
export const prisma = createRlsProxy(baseClient);

export * from "@prisma/client";
