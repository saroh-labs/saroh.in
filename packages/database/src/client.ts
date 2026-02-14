import { PrismaClient } from "@prisma/client";
import config from "../prisma/prisma.config";

declare global {
    namespace globalThis {
        var prisma: PrismaClient | undefined;
    }
}

export const prisma = globalThis.prisma || new PrismaClient(config);

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export * from "@prisma/client";
