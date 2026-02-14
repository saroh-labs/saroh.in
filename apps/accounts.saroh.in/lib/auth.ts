import { prisma } from "@saroh/database";
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
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

export const auth = betterAuth({
    account: {
        accountLinking: {
            enabled: true,
        },
    },
    advanced: {
        crossSubDomainCookies:
            process.env.NODE_ENV === "production"
                ? {
                      enabled: true,
                      domain: ".saroh.in",
                  }
                : { enabled: false },
    },
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            void sendPasswordResetEmail(user.email, url);
        },
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            void sendVerificationEmail(user.email, url);
        },
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
