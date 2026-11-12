/**
 * Pages error tracking leaves out entirely (DEC-125), on the server and in
 * the browser: nothing about them is sent to PostHog, not even a scrubbed
 * route. A staff invite's page (admin console U24) is one: whoever holds
 * its link is being let into Saroh's own console. An AI app's sign-in
 * (`/oauth/…`, U9) is another: its address carries a signed sign-in request.
 */
export const UNTRACKED_PAGES = ["/staff-invite", "/oauth"] as const;

/** Whether an address or path is one of {@link UNTRACKED_PAGES}, or under one. */
export function untrackedPage(pathOrUrl: string | null | undefined): boolean {
    if (!pathOrUrl) return false;
    let pathname: string;
    try {
        pathname = new URL(pathOrUrl, "https://accounts.invalid").pathname;
    } catch {
        return false;
    }
    return UNTRACKED_PAGES.some(
        (page) => pathname === page || pathname.startsWith(`${page}/`),
    );
}
