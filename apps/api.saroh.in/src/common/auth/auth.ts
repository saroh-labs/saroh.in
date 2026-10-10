import type { Auth } from "@saroh/auth";
import { createAuth, VERIFICATION_OTP_EXPIRY_SECONDS } from "@saroh/auth";

import {
    sendChangeEmailConfirmationEmail,
    sendDeleteAccountEmail,
    sendExistingAccountEmail,
    sendPasswordResetEmail,
    sendVerificationOtpEmail,
} from "../email";

/**
 * The Better Auth instance — api.saroh.in is now the auth SERVER (it hosts
 * /api/auth/*) and the sole DB owner. It issues auth and sends verification /
 * reset email (relocated here from accounts, which is now just the UI).
 */
export const auth: Auth = createAuth({
    // Email verification is code-based (see the emailOTP plugin in @saroh/auth):
    // no verification LINK is sent, so there is no link sender to inject.
    sendVerificationOTP: ({ to, otp, type }) =>
        sendVerificationOtpEmail(
            to,
            otp,
            type,
            VERIFICATION_OTP_EXPIRY_SECONDS,
        ),
    sendResetPassword: ({ to, url }) => sendPasswordResetEmail(to, url),
    // A sign-up for an address that already has an account: the screen says
    // "Check your email" either way, and this is what arrives.
    sendExistingAccountNotice: ({ to, origin }) =>
        sendExistingAccountEmail(to, origin),
    sendChangeEmailConfirmation: ({ to, newEmail, url }) =>
        sendChangeEmailConfirmationEmail(to, url, newEmail),
    sendDeleteAccountVerification: ({ to, url }) =>
        sendDeleteAccountEmail(to, url),
});
