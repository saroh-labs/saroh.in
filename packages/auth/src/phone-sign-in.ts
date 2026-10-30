import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/**
 * Signing in with a verified phone (DEC-196, messaging brief unit 2): the
 * session half. The API checks the OTP widget's token with the provider, applies
 * its limits and finds the person by their verified phone
 * (`apps/api.saroh.in/src/modules/account-phone/`); then it asks this
 * endpoint for the session, by user id.
 *
 * The session is made exactly as `emailOTP`'s `/sign-in/email-otp` makes
 * it: `internalAdapter.createSession`, then `setSessionCookie`. So the
 * session row, the cookie (name, domain, signing) and the
 * `session.create.before` hook — `mayStartSession`, the demo-owner refusal
 * — are the same for every way in.
 *
 * Server-only: never on the HTTP router, reachable only through
 * `auth.api` from the API's own code, after the API's server-side check.
 * It is not a mailbox proof (`MAILBOX_PROOF_PATHS` never names it).
 */
export function phoneSignIn(): BetterAuthPlugin {
    return {
        id: "saroh-phone-sign-in",
        endpoints: {
            signInVerifiedPhone: createAuthEndpoint.serverOnly(
                { method: "POST" },
                async (ctx) => {
                    const body = ctx.body as { userId?: unknown } | undefined;
                    const userId = body?.userId;
                    if (typeof userId !== "string" || !userId) {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error -- APIError extends Error at runtime; see assertNotSoleOwner in server.ts
                        throw new APIError("BAD_REQUEST", {
                            message: "userId is required",
                        });
                    }
                    const user =
                        await ctx.context.internalAdapter.findUserById(userId);
                    if (!user) {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error -- as above
                        throw new APIError("UNAUTHORIZED", {
                            message: "Failed to create session",
                            code: "FAILED_TO_CREATE_SESSION",
                        });
                    }
                    // Null when `session.create.before` refused (a hold, a demo).
                    const session =
                        await ctx.context.internalAdapter.createSession(
                            user.id,
                        );
                    // Typed non-null, but a refusing hook returns null.
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
                    if (!session) {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error -- as above
                        throw new APIError("UNAUTHORIZED", {
                            message: "Failed to create session",
                            code: "FAILED_TO_CREATE_SESSION",
                        });
                    }
                    await setSessionCookie(ctx, { session, user });
                    return ctx.json({ token: session.token });
                },
            ),
        },
    };
}

/**
 * Start a session for a user whose phone the caller has just verified on
 * the server, as the request's own client (its `headers` give the address
 * and user agent the session row keeps). Returns the response headers to
 * copy onto the reply: `Set-Cookie` above all. Throws Better Auth's
 * `APIError` (401) when the session is refused.
 */
export async function startPhoneSession(
    auth: { api: object },
    input: { userId: string; headers: Headers },
): Promise<Headers> {
    // The instance is typed with the general options (see createAuth), so
    // the plugin's endpoint is reached by name.
    const api = auth.api as unknown as {
        signInVerifiedPhone: (args: {
            body: { userId: string };
            headers: Headers;
            returnHeaders: true;
        }) => Promise<{ headers: Headers }>;
    };
    const { headers } = await api.signInVerifiedPhone({
        body: { userId: input.userId },
        headers: input.headers,
        returnHeaders: true,
    });
    return headers;
}
