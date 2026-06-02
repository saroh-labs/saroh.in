import { prisma } from "@saroh/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { getTrustedOrigins } from "./origins";

// Re-export so existing consumers (api) keep importing it from @saroh/auth.
export { getTrustedOrigins, isTrustedOrigin } from "./origins";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Email delivery is injected by the consuming app (accounts sends real
 *  mail; api never triggers sends). Keeping the signature here means the
 *  session-relevant config below stays identical across both apps. */
type EmailSender = (args: {
    to: string;
    url: string;
    token: string;
}) => Promise<void> | void;

export interface CreateAuthOptions {
    sendVerificationEmail?: EmailSender;
    sendResetPassword?: EmailSender;
}

/**
 * The single source of truth for the Better Auth server config. Both
 * accounts.saroh.in (issuer) and api.saroh.in (validator) build their
 * instance from this factory so secret, adapter, and plugins are identical
 * — the precondition for shared-DB cross-subdomain session validation.
 *
 * Milestone 1: core only (email/password + verification + reset, GitHub +
 * Google OAuth). Advanced plugins are layered on per M2 slice.
 */
export function createAuth(opts: CreateAuthOptions = {}) {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error(
            "BETTER_AUTH_SECRET is not set — both accounts and api must load the same secret or session validation fails.",
        );
    }

    return betterAuth({
        secret,
        baseURL: process.env.BETTER_AUTH_URL,
        trustedOrigins: getTrustedOrigins(),
        database: prismaAdapter(prisma, {
            provider: "postgresql",
        }),
        account: {
            accountLinking: {
                enabled: true,
                // Only link social accounts whose provider verifies the email,
                // so a spoofed unverified email can't take over an account.
                trustedProviders: ["github", "google"],
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            sendResetPassword: async ({ user, url, token }) => {
                await opts.sendResetPassword?.({ to: user.email, url, token });
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            sendVerificationEmail: async ({ user, url, token }) => {
                await opts.sendVerificationEmail?.({
                    to: user.email,
                    url,
                    token,
                });
            },
        },
        socialProviders: {
            github: {
                clientId: process.env.AUTH_GITHUB_ID as string,
                clientSecret: process.env.AUTH_GITHUB_SECRET as string,
            },
            google: {
                clientId: process.env.AUTH_GOOGLE_ID as string,
                clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
            },
        },
        advanced: {
            crossSubDomainCookies: IS_PRODUCTION
                ? { enabled: true, domain: ".saroh.in" }
                : { enabled: false },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;
