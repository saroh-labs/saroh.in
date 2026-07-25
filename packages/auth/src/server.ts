import { prisma } from "@saroh/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";

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
    /**
     * Approve an email change. Sent to the account's CURRENT address (not the
     * new one) — that is what makes the flow takeover-resistant: whoever holds
     * the existing mailbox authorizes the move. `newEmail` is included so the
     * message can name the destination.
     */
    sendChangeEmailConfirmation?: (args: {
        to: string;
        newEmail: string;
        url: string;
        token: string;
    }) => Promise<void> | void;
    /** Confirm account deletion via a one-time link, never a bare API call. */
    sendDeleteAccountVerification?: EmailSender;
}

/**
 * Refuse to delete a user who is the ONLY OWNER of an Organization.
 *
 * `Membership` cascades on user delete but `Organization` does not — nothing in
 * the schema ties an org's lifetime to a person. So deleting the last OWNER
 * would strand the tenant: the org, its stores, sites, orders and audit history
 * would all survive with no one able to reach them, and no UI to recover it.
 * Ownership must be transferred (or the org deleted) first.
 *
 * Runs inside Better Auth's `beforeDelete` hook, so throwing here aborts the
 * deletion before any row is touched.
 */
async function assertNotSoleOwner(userId: string): Promise<void> {
    const ownerships = await prisma.membership.findMany({
        where: { userId, role: "OWNER" },
        select: {
            organizationId: true,
            organization: { select: { name: true } },
        },
    });
    if (ownerships.length === 0) return;

    const stranded: string[] = [];
    for (const ownership of ownerships) {
        const otherOwners = await prisma.membership.count({
            where: {
                organizationId: ownership.organizationId,
                role: "OWNER",
                userId: { not: userId },
            },
        });
        if (otherOwners === 0) {
            stranded.push(ownership.organization.name);
        }
    }

    if (stranded.length > 0) {
        throw new APIError("BAD_REQUEST", {
            message:
                `You are the only owner of ${stranded.join(", ")}. Make someone else an owner, ` +
                `or delete the organization first, then delete your account.`,
        });
    }
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
        user: {
            changeEmail: {
                enabled: true,
                // Approval goes to the CURRENT address. `updateEmailWithoutVerification`
                // is deliberately left off: an unverified account must not be
                // able to move its own login identity without proving mailbox
                // control, or an unverified signup on someone else's address
                // becomes a way to squat a second one.
                sendChangeEmailConfirmation: async ({
                    user,
                    newEmail,
                    url,
                    token,
                }) => {
                    await opts.sendChangeEmailConfirmation?.({
                        to: user.email,
                        newEmail,
                        url,
                        token,
                    });
                },
            },
            deleteUser: {
                enabled: true,
                // With a verification sender configured, Better Auth requires a
                // one-time emailed link — deletion is never a single API call.
                sendDeleteAccountVerification: async ({ user, url, token }) => {
                    await opts.sendDeleteAccountVerification?.({
                        to: user.email,
                        url,
                        token,
                    });
                },
                // Last line of defence: refuse to strand a tenant (see
                // assertNotSoleOwner). Runs before any row is deleted.
                beforeDelete: async (user) => {
                    await assertNotSoleOwner(user.id);
                },
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
