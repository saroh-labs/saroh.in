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
