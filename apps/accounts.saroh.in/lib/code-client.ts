import { authClient } from "./auth.client";
import type { CodeClient } from "./sign-in-code";

/**
 * The code steps' calls, on the real auth client (`lib/sign-in-code.ts` says
 * what each answer means). All three are Better Auth's `emailOTP` endpoints:
 * nothing here makes a session of its own.
 *
 * A refusal for asking too often carries the server's wait in
 * `X-Retry-After`, which the client's result leaves out, so it is read off
 * the response as it passes.
 */
export const codeClient: CodeClient = {
    async send({ email, kind }) {
        let retryAfter: string | null = null;
        const { error } = await authClient.emailOtp.sendVerificationOtp(
            { email, type: kind },
            {
                onError(context) {
                    retryAfter = context.response.headers.get("x-retry-after");
                },
            },
        );
        return { error, retryAfter };
    },
    async check({ email, code, kind, name }) {
        if (kind === "email-verification") {
            // A password account confirming its address. With
            // `autoSignInAfterVerification` the right code signs it in.
            const { error } = await authClient.emailOtp.verifyEmail({
                email,
                otp: code,
            });
            return { error };
        }
        const { error } = await authClient.signIn.emailOtp({
            email,
            otp: code,
            ...(name ? { name } : {}),
        });
        return { error };
    },
};
