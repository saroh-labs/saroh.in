import { PrismaClient } from "@prisma/client";

declare global {
    namespace globalThis {
        var prisma: PrismaClient | undefined;
    }
}

// PrismaClient reads the datasource URL from DATABASE_URL by default.
// The Prisma 7 config (prisma.config.js) is CLI-only and must NOT be
// passed to the constructor — doing so previously broke the build.
export const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export * from "@prisma/client";
