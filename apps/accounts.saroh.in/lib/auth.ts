import { PrismaClient } from "@prisma/client";
// import prisma from "@/lib/prisma";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
    admin,
    anonymous,
    apiKey,
    emailOTP,
    haveIBeenPwned,
    multiSession,
    organization,
    twoFactor,
    username,
} from "better-auth/plugins";

const prisma = new PrismaClient();

export const auth = betterAuth({
    account: {
        accountLinking: {
            enabled: true,
        },
    },
    advanced: {
        crossSubDomainCookies: {
            enabled: true,
            domain: ".saroh.in",
        },
    },
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
    },
    socialProviders: {
        github: {
            clientId: process.env.AUTH_GITHUB_ID as string,
            clientSecret: process.env.AUTH_GITHUB_SECRET as string,
        },
    },
    plugins: [
        admin(),
        organization(),
        apiKey(),
        username(),
        anonymous(),
        haveIBeenPwned(),
        twoFactor(),
        multiSession(),
        emailOTP({
            sendVerificationOTP: async (email, token) => {
                console.log(email, token);
            },
        }),
    ],
    baseURL: process.env.BETTER_AUTH_URL as string,
    rateLimit:{
        storage: "database",
        modelName: "rate_limit",
    }
});
