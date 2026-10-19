import { Logger } from "@nestjs/common";
import type { Auth } from "@saroh/auth";
import { createAuth, VERIFICATION_OTP_EXPIRY_SECONDS } from "@saroh/auth";
import { prisma } from "@saroh/database";

import { signedUp } from "../../modules/analytics/product-milestones";
import { noticeProfilesOfDeletedOwnerInTx } from "../../modules/billing/billing-profile-owner";
import {
    sendChangeEmailConfirmationEmail,
    sendDeleteAccountEmail,
    sendExistingAccountEmail,
    sendPasswordResetEmail,
} from "../email";
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

export const auth: Auth = createAuth({
    // Email verification is code-based (see the emailOTP plugin in @saroh/auth):
    // no verification LINK is sent, so there is no link sender to inject.
    // A held address gets none (admin console U9, `verification-otp.ts`).
    sendVerificationOTP: (args) =>
        deliverVerificationOtp(args, VERIFICATION_OTP_EXPIRY_SECONDS),
    // The same hold, for every way in: no session for a held person.
    mayStartSession: ({ id }) => mayStartSession(id),
    // A code proves the mailbox: a verification staff marked becomes the
    // person's own (`email-verification.ts`).
    onMailboxProven: ({ id }) => clearStaffVerification(id),
    sendResetPassword: ({ to, url }) => sendPasswordResetEmail(to, url),
    // A sign-up for an address that already has an account: the screen says
    // "Check your email" either way, and this is what arrives.
    sendExistingAccountNotice: ({ to, origin }) =>
        sendExistingAccountEmail(to, origin),
    sendChangeEmailConfirmation: ({ to, newEmail, url }) =>
        sendChangeEmailConfirmationEmail(to, url, newEmail),
    sendDeleteAccountVerification: ({ to, url }) =>
        sendDeleteAccountEmail(to, url),
    // The `signed_up` product milestone (DEC-125): the user's id, nothing
    // else. A no-op unless PostHog is on.
    onUserCreated: ({ id }) => signedUp(id),
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
});
