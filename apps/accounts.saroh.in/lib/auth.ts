import { createAuth } from "@saroh/auth/server";

import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

/**
 * accounts.saroh.in's Better Auth instance — a thin construction over the
 * shared @saroh/auth factory so its session-relevant config stays identical
 * to api.saroh.in's validator. Only the email senders are app-specific.
 */
export const auth = createAuth({
    sendVerificationEmail: ({ to, url }) => sendVerificationEmail(to, url),
    sendResetPassword: ({ to, url }) => sendPasswordResetEmail(to, url),
});
