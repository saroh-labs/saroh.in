import { prisma } from "@saroh/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { getTrustedOrigins } from "./origins";

// Re-export so existing consumers (api) keep importing it from @saroh/auth.
export { getTrustedOrigins, isTrustedOrigin } from "./origins";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * A FIXED, well-known development-only Better Auth secret. Used ONLY when
 * `BETTER_AUTH_SECRET` is unset AND we are not in production, so a fresh clone
 * boots with just `DATABASE_URL`. It is deliberately constant (not random) so
 * the api and every session-validating app derive the SAME key and
 * cross-subdomain session validation still works locally. NEVER used in
 * production — `resolveAuthSecret` throws there instead.
 */
const DEV_FALLBACK_AUTH_SECRET =
    "saroh-dev-insecure-better-auth-secret-do-not-use-in-production";

let warnedAuthSecretFallback = false;

/**
 * Resolve the Better Auth secret. Returns `BETTER_AUTH_SECRET` when set. When it
 * is absent: in production this THROWS (a real secret is mandatory); outside
 * production it falls back to {@link DEV_FALLBACK_AUTH_SECRET} with a one-time
 * warning, so local dev needs no secret configured.
 */
export function resolveAuthSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (secret) return secret;

    if (IS_PRODUCTION) {
        throw new Error(
            "BETTER_AUTH_SECRET is not set — api hosts Better Auth and every app that validates sessions must load the same secret or session validation fails.",
        );
    }

    if (!warnedAuthSecretFallback) {
        warnedAuthSecretFallback = true;
        console.warn(
            "⚠️  BETTER_AUTH_SECRET is not set — using a fixed, INSECURE dev fallback. " +
                "Set BETTER_AUTH_SECRET for any shared/staging/prod environment.",
        );
    }
    return DEV_FALLBACK_AUTH_SECRET;
}

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
 * The single source of truth for the Better Auth server config. api.saroh.in
 * is the auth host — it owns this instance, the DB, and the secret, and both
 * issues and validates sessions. accounts.saroh.in is the SSO login UI only
 * and talks to api over HTTP; it does not build an instance from this factory.
 * Keeping one factory means secret, adapter, and plugins stay identical
 * wherever it is constructed — the precondition for shared-DB cross-subdomain
 * session validation.
 *
 * Milestone 1: core only (email/password + verification + reset, GitHub +
 * Google OAuth). Advanced plugins are layered on per M2 slice.
 */
export function createAuth(opts: CreateAuthOptions = {}) {
    const secret = resolveAuthSecret();

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
                clientId: process.env.AUTH_GITHUB_ID ?? "",
                clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
            },
            google: {
                clientId: process.env.AUTH_GOOGLE_ID ?? "",
                clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
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
