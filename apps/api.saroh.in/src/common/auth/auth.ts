import type { Auth } from "@saroh/auth";
import { createAuth } from "@saroh/auth";

import {
    sendChangeEmailConfirmationEmail,
    sendDeleteAccountEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
} from "../email";

/**
 * The Better Auth instance — api.saroh.in is now the auth SERVER (it hosts
 * /api/auth/*) and the sole DB owner. It issues auth and sends verification /
 * reset email (relocated here from accounts, which is now just the UI).
 */
export const auth: Auth = createAuth({
    sendVerificationEmail: ({ to, url }) => sendVerificationEmail(to, url),
    sendResetPassword: ({ to, url }) => sendPasswordResetEmail(to, url),
    sendChangeEmailConfirmation: ({ to, newEmail, url }) =>
        sendChangeEmailConfirmationEmail(to, url, newEmail),
    sendDeleteAccountVerification: ({ to, url }) =>
        sendDeleteAccountEmail(to, url),
});
