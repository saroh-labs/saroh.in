import { safeDestination } from "@saroh/auth/origins";

import { getAppUrl } from "./app-urls";

/**
 * Where to send someone after they sign in (#222).
 *
 * The trust decision itself lives in `@saroh/auth/origins` beside
 * `isTrustedOrigin`, where it is tested. What belongs here is only this app's
 * answer to "and if there is nowhere to return to?".
 *
 * Called from SERVER components and the proxy. `safeDestination` reads
 * `BETTER_AUTH_TRUSTED_ORIGINS`, which the browser never sees; in a client
 * component every development origin would be rejected against the hard-coded
 * production list.
 */

export { safeDestination } from "@saroh/auth/origins";

/**
 * Where someone lands when there is nowhere better to send them: Saroh
 * itself. Its front door already knows the rest (no business yet goes to
 * setup, one business opens its Home, several asks which), so nothing here
 * repeats that. It used to be `/apps`, a list of Saroh's own hosts that only
 * Saroh staff have a use for (UX audit, 10 Oct).
 */
export function defaultDestination(): string {
    return getAppUrl();
}

/** The pages only someone signed out has a use for. */
export const SIGNED_OUT_PAGES = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
] as const;

function isSignedOutPage(path: string): boolean {
    const pathname = path.split(/[?#]/)[0] ?? path;
    return (
        pathname === "/" ||
        SIGNED_OUT_PAGES.some(
            (page) => pathname === page || pathname.startsWith(`${page}/`),
        )
    );
}

/**
 * Where someone who is ALREADY signed in goes when they open a sign-in page:
 * the place the link was taking them, when it is one they may follow, else
 * Saroh. A `redirect` back to a sign-in page is dropped, since following it
 * would bring them straight back here.
 */
export function signedInDestination(
    redirect: string | string[] | null | undefined,
): string {
    const destination = safeDestination(redirect ?? undefined);
    if (!destination) return defaultDestination();
    if (destination.startsWith("/") && isSignedOutPage(destination)) {
        return defaultDestination();
    }
    return destination;
}
