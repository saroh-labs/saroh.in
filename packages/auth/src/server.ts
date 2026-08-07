import { prisma } from "@saroh/database";
import type {
    Auth as BetterAuthInstance,
    BetterAuthOptions,
} from "better-auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";

import {
    VERIFICATION_OTP_EXPIRY_SECONDS,
    VERIFICATION_OTP_LENGTH,
} from "./constants";
import { getTrustedOrigins } from "./origins";

// Re-export so existing consumers (api) keep importing it from @saroh/auth.
export { getTrustedOrigins, isTrustedOrigin } from "./origins";
// Server-side callers (the api's email sender) read the expiry from here; the
// browser must import these from `@saroh/auth/constants` instead — see the note
// in that file.
export {
    VERIFICATION_OTP_EXPIRY_SECONDS,
    VERIFICATION_OTP_LENGTH,
} from "./constants";

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
    /**
     * Deliver a one-time verification CODE. This — not the link sender below —
     * is what a signing-up user actually receives, because `emailOTP` is
     * configured with `overrideDefaultEmailVerification`, which swaps the
     * built-in link mail for a code.
     *
     * `type` distinguishes the flows that share the OTP machinery, so the mail
     * copy can say what the code is for.
     */
    sendVerificationOTP?: (args: {
        to: string;
        otp: string;
        type:
            | "sign-in"
            | "email-verification"
            | "forget-password"
            | "change-email";
    }) => Promise<void> | void;
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
 * Google OAuth) plus `emailOTP` for code-based verification. Advanced plugins
 * are layered on per M2 slice.
 *
 * The explicit `BetterAuthOptions` / `BetterAuthInstance` annotations below are
 * required, not stylistic: plugin endpoints are typed with zod schemas, so an
 * INFERRED instance type names `zod/v4/core` through a pnpm-internal
 * `.pnpm/zod@x.y.z/...` path that cannot be written down in a .d.ts (TS2742),
 * and the dts build fails. Pinning the options to the general type keeps the
 * emitted signature nameable. Nothing is lost in practice: server-side callers
 * only touch `auth.api.getSession` / `auth.handler`, and the browser gets its
 * plugin-aware types from `createAuthClient` in ./client instead.
 */
export function createAuth(opts: CreateAuthOptions = {}): BetterAuthInstance {
    const secret = resolveAuthSecret();

    const options: BetterAuthOptions = {
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
            // Someone who signed up, missed the code and came back to log in
            // gets a fresh one automatically — so the 403 below is always
            // actionable. The login form reads EMAIL_NOT_VERIFIED and forwards
            // them to the verify screen, where that code is already waiting.
            sendOnSignIn: true,
            // Verifying the code IS the sign-in. Without this, a user who just
            // proved mailbox control would be bounced to /login to retype the
            // password they entered ninety seconds ago — the dead end this
            // flow exists to remove.
            autoSignInAfterVerification: true,
            // `sendVerificationEmail` is deliberately NOT set here. The
            // `emailOTP` plugin installs its own through its `init` hook, and
            // Better Auth merges the two with `defu(userOptions, pluginOptions)`
            // — first argument wins — so anything defined here would silently
            // beat the plugin and mail a LINK instead of a code. Leaving it out
            // is what makes every core path that "sends a verification email"
            // (sign-up, sign-in, the send-verification-email endpoint) emit the
            // code the verify screen is built to accept.
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
        plugins: [
            emailOTP({
                // Replace the built-in verification LINK with a code. The link
                // flow could not work here: it is sent by the api, so its
                // callbackURL resolves against the api's own origin and drops
                // the user on a bare JSON host instead of back in the product.
                // A code keeps the user in the tab they started in.
                overrideDefaultEmailVerification: true,
                otpLength: VERIFICATION_OTP_LENGTH,
                expiresIn: VERIFICATION_OTP_EXPIRY_SECONDS,
                // Codes are short and guessable by construction, so the lockout
                // — not the entropy — is the control. 5 tries, then the code is
                // burned and the user must request a new one.
                allowedAttempts: 5,
                // Never store a usable code at rest: a DB leak must not hand an
                // attacker a working second factor for every pending signup.
                storeOTP: "hashed",
                sendVerificationOTP: async ({ email, otp, type }) => {
                    await opts.sendVerificationOTP?.({ to: email, otp, type });
                },
            }),
        ],
    };

    return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
