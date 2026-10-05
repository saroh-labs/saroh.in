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
