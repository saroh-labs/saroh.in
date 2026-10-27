"use client";

import {
    emailOTPClient,
    inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth browser client. Auth now lives on api.saroh.in, so the
 * client is cross-origin from every frontend: point `NEXT_PUBLIC_BETTER_AUTH_URL`
 * at the api (it appends `/api/auth`) and send credentials so the browser
 * attaches the `.saroh.in` session cookie on every request.
 *
 * `emailOTPClient` mirrors the server's `emailOTP` plugin and is what exposes
 * `authClient.emailOtp.*` — the code-based email verification the signup flow
 * runs on. Remaining plugin clients (admin, organization, twoFactor, apiKey, …)
 * are added alongside their M2 server slices.
 */
export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    fetchOptions: { credentials: "include" },
    plugins: [
        emailOTPClient(),
        // The verified phone on the session's user (DEC-196), as the
        // server's `user.additionalFields` declares it.
        inferAdditionalFields({
            user: {
                phoneE164: { type: "string", required: false, input: false },
                phoneVerifiedAt: {
                    type: "date",
                    required: false,
                    input: false,
                },
            },
        }),
    ],
});

export const { signIn, signUp, signOut, useSession, getSession, emailOtp } =
    authClient;
