import { Logger } from "@nestjs/common";
import type { Auth } from "@saroh/auth";
import { createAuth, VERIFICATION_OTP_EXPIRY_SECONDS } from "@saroh/auth";
import { prisma } from "@saroh/database";
import { editionProfile, type Edition } from "@saroh/edition";

import { env } from "../../env";
import { renewPhoneOnEmailSignIn } from "../../modules/account-phone/phone-freshness";
import { signedUp } from "../../modules/analytics/product-milestones";
import { noticeProfilesOfDeletedOwnerInTx } from "../../modules/billing/billing-profile-owner";
import {
    sendChangeEmailConfirmationEmail,
    sendDeleteAccountEmail,
    sendExistingAccountEmail,
    sendPasswordResetEmail,
} from "../email";
import { trustedProxyRanges } from "../trust-proxy";
import {
    authEditionOf,
    authHostOf,
    githubKeysOf,
    otherAuthAddress,
} from "./auth-address";
import { claimCodeMail } from "./code-mail-limits";
import { clearStaffVerification } from "./email-verification";
import { reportAuthServerError } from "./report-auth-error";
import { mayStartSession } from "./sign-in-holds";
import { deliverVerificationOtp } from "./verification-otp";

/**
 * The Better Auth instance — api.saroh.in is now the auth SERVER (it hosts
 * /api/auth/*) and the sole DB owner. It issues auth and sends verification /
 * reset email (relocated here from accounts, which is now just the UI).
 */
const deletionLogger = new Logger("AccountDeletion");

const authServices: Parameters<typeof createAuth>[0] = {
    // The same hold, for every way in: no session for a held person.
    mayStartSession: ({ id }) => mayStartSession(id),
    // A code proves the mailbox: a verification staff marked becomes the
    // person's own (`email-verification.ts`).
    // It also vouches for the account's phone again (DEC-198).
    onMailboxProven: async ({ id }) => {
        await clearStaffVerification(id);
        await renewPhoneOnEmailSignIn(id);
    },
    // The `signed_up` product milestone (DEC-125): the user's id and, from
    // the request's cookies, where they came from (DEC-187). A no-op unless
    // PostHog is on.
    onUserCreated: ({ id }, cookieHeader) => signedUp(id, cookieHeader),
    // An account deleted with billing profiles (DEC-167): each business
    // billed to one, or with a payment on one, is raised for an operator.
    // Never refuses the deletion (`@saroh/auth` swallows a failure).
    onUserDeleting: async ({ id }) => {
        await prisma.$transaction((tx) =>
            noticeProfilesOfDeletedOwnerInTx(tx, deletionLogger, id),
        );
    },
    // A 5xx inside Better Auth, which answers /api/auth/* itself and so
    // never reaches AllExceptionsFilter. Never a 4xx.
    onServerError: reportAuthServerError,
    // The sign-in rate limit counts the same client the API's `req.ip` does.
    trustedProxies: trustedProxyRanges(env.TRUST_PROXY),
    // Per address too, not only per caller: many callers can't flood one
    // mailbox; past the cap a code needs the bot challenge (`code-mail-limits.ts`).
    mayMailCode: (email, { turnstileToken }) =>
        claimCodeMail(email, turnstileToken),
};

const githubWarned = new Set<Edition>();

/**
 * An edition's GitHub app for its instance (KTD5). India keeps reading
 * `AUTH_GITHUB_ID`/`_SECRET` as it always has. Global has its own pair, and
 * without both GitHub is off there (its button hides, `sign-in-options`);
 * half a pair WARNs once, naming the missing one.
 */
function githubOf(edition: Edition): Parameters<typeof createAuth>[0] {
    // India keeps reading the original names inside createAuth.
    if (!editionProfile(edition).envSuffix) return {};
    const { pair, half } = githubKeysOf(edition, env);
    if (half && !githubWarned.has(edition)) {
        githubWarned.add(edition);
        new Logger("Auth").warn(
            `github_sign_in_off edition=${edition}: ${half} is not set, so GitHub sign-in is off.`,
        );
    }
    return { github: pair };
}

/**
 * The services for one edition's instance: its account mail comes from that
 * edition's sender (KTD6), and it has that edition's GitHub app.
 */
function servicesFor(edition: Edition): Parameters<typeof createAuth>[0] {
    return {
        ...authServices,
        ...githubOf(edition),
        // Email verification is code-based (see the emailOTP plugin in
        // @saroh/auth): no verification LINK is sent, so there is no link
        // sender to inject. A held address gets none (admin console U9,
        // `verification-otp.ts`).
        sendVerificationOTP: (args) =>
            deliverVerificationOtp(
                args,
                VERIFICATION_OTP_EXPIRY_SECONDS,
                edition,
            ),
        sendResetPassword: ({ to, url }) =>
            sendPasswordResetEmail(to, url, edition),
        // A sign-up for an address that already has an account: the screen
        // says "Check your email" either way, and this is what arrives.
        sendExistingAccountNotice: ({ to, origin }) =>
            sendExistingAccountEmail(to, origin, edition),
        sendChangeEmailConfirmation: ({ to, newEmail, url }) =>
            sendChangeEmailConfirmationEmail(to, url, newEmail, edition),
        sendDeleteAccountVerification: ({ to, url }) =>
            sendDeleteAccountEmail(to, url, edition),
    };
}

export const auth: Auth = createAuth(
    servicesFor(authEditionOf(null, env.BETTER_AUTH_URL)),
);

// Said at boot, not on Global's first sign-in: half a pair is a typo to fix.
githubOf("GLOBAL");

const instanceByAddress = new Map<string, Auth>();

/**
 * The instance for the address a request came in on. Built on first use, so a
 * deployment nobody reaches on another domain runs only `auth`. Reading a
 * session needs only the shared secret and database, so the guard's `auth` is
 * right for every address; what differs is the cookie a sign-in sets.
 */
export function authFor(host: string | null | undefined): Auth {
    const address = otherAuthAddress(host, env.BETTER_AUTH_URL);
    if (!address) return auth;
    let instance = instanceByAddress.get(address);
    if (!instance) {
        instance = createAuth({
            ...servicesFor(authEditionOf(host, env.BETTER_AUTH_URL)),
            baseURL: address,
        });
        instanceByAddress.set(address, instance);
    }
    return instance;
}

/** The instance that runs an edition's sign-in (a code staff send, KTD6). */
export function authOfEdition(edition: Edition | null | undefined): Auth {
    return edition ? authFor(authHostOf(edition, env.BETTER_AUTH_URL)) : auth;
}

/** What `/api/auth/*` is mounted on: `auth`, answering by address. */
export const mountedAuth: Auth = {
    ...auth,
    handler: (request) => authFor(request.headers.get("host")).handler(request),
};
