/**
 * Auth constants that BOTH the server config and browser UI need.
 *
 * Deliberately its own module with no imports: `@saroh/auth` ("." / "./server")
 * pulls in better-auth's server, the Prisma client and the DB connection, so a
 * client component importing the OTP length from there would drag all of that
 * into the browser bundle. This file is exported as source at
 * `@saroh/auth/constants` and transpiled by the consuming Next app, the same
 * way `./client` is.
 */

/** How long a verification code stays valid, in seconds. */
export const VERIFICATION_OTP_EXPIRY_SECONDS = 600;

/** Digits in a verification code. The UI renders exactly this many inputs. */
export const VERIFICATION_OTP_LENGTH = 6;

/**
 * Wrong tries a code takes before it is spent and a new one has to be asked
 * for. A six-digit code is guessable by construction, so this lockout, not
 * the entropy, is the control.
 */
export const CODE_ALLOWED_ATTEMPTS = 5;

/**
 * The limiter on asking for a code and on checking one: this many requests,
 * then none until `CODE_LIMIT_WINDOW_SECONDS` have passed since the last.
 * Per address the request came from, per endpoint.
 */
export const CODE_LIMIT_MAX = 3;
export const CODE_LIMIT_WINDOW_SECONDS = 60;

/**
 * How long the code step waits before "Resend code" can be pressed: the
 * limiter's window spread over what it allows, so a person who resends as
 * soon as the button lets them is not refused on the second code. The
 * screens read it from here, the same file the server's limiter is set from,
 * so the countdown and the limiter cannot drift. A refusal carries the
 * server's own wait, which the screen then counts down instead.
 */
export const CODE_RESEND_SECONDS = Math.ceil(
    CODE_LIMIT_WINDOW_SECONDS / (CODE_LIMIT_MAX - 1),
);

/**
 * The session cookie's name prefix: `AUTH_COOKIE_PREFIX`, else Better Auth's
 * own `better-auth`. Production leaves it unset. The development environment
 * sets its own (`saroh-dev`), because its hosts sit under production's
 * cookie domain (`*.dev.saroh.in` under `.saroh.in`): a browser sends
 * production's session cookie to them too, and with one name the two would
 * be confused. The API that writes the cookie and every app that checks for
 * it must read the same value (plan 2026-10-05-001).
 */
export function sessionCookiePrefix(): string {
    // An empty value is unset, as everywhere else in the env.
    const prefix = process.env.AUTH_COOKIE_PREFIX?.trim();
    if (!prefix) return "better-auth";
    return prefix;
}
