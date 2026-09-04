import { safeDestination } from "@saroh/auth/origins";

/**
 * Where to send someone after they sign in (#222).
 *
 * The trust decision itself lives in `@saroh/auth/origins` beside
 * `isTrustedOrigin`, where it is tested — what belongs here is only this app's
 * answer to "and if there is nowhere to return to?".
 *
 * Called from SERVER components. `safeDestination` reads
 * `BETTER_AUTH_TRUSTED_ORIGINS`, which the browser never sees; in a client
 * component every development origin would be rejected against the hard-coded
 * production list.
 */

export { safeDestination } from "@saroh/auth/origins";

/** Where someone lands when there is nowhere better to send them. */
export const DEFAULT_DESTINATION = "/apps";

/** {@link safeDestination}, falling back to the app launcher. */
export function safeReturnTo(redirect: string | string[] | undefined): string {
    return safeDestination(redirect) ?? DEFAULT_DESTINATION;
}
