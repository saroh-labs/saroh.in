/**
 * Where a newly verified account goes first (DEC-127).
 *
 * Saroh counts a finished sign-up as an ad conversion, but only for a
 * visitor who accepted advertising cookies on saroh.in, and this app loads
 * no advertising tag and can't read that answer. So when
 * `NEXT_PUBLIC_SIGNUP_WELCOME_URL` is set (saroh.in's `/welcome`), the new
 * account passes through that page, which counts it or doesn't and sends
 * the browser on to `destination` at once. Nothing about the person goes
 * with it: only where they are going, and the time, which lets saroh.in
 * tell a fresh sign-up from a bookmark.
 *
 * Unset, or for a destination that page won't forward to (it forwards only
 * to this app and the workspace), the account goes straight there, as it
 * always did. saroh.in reads the address in its `lib/welcome.ts`, and its
 * tests hold the two together.
 *
 * Kept free of imports so that test can load it.
 */
export function viaWelcome(input: {
    /** saroh.in's `/welcome`, or nothing when the hand-off is off. */
    welcomeUrl: string | undefined;
    /** Where the account is going: an address, or a path on this app. */
    destination: string;
    /** This app's origin, which a path is read against. */
    base: string;
    /** The origins `/welcome` forwards to: this app's and the workspace's. */
    forwardable: readonly string[];
    now: number;
}): string {
    if (!input.welcomeUrl) return input.destination;
    let next: URL;
    try {
        next = new URL(input.destination, input.base);
    } catch {
        return input.destination;
    }
    if (next.protocol !== "https:" || !input.forwardable.includes(next.origin))
        return input.destination;
    const query = new URLSearchParams({
        next: next.toString(),
        at: String(input.now),
    });
    return `${input.welcomeUrl}?${query.toString()}`;
}
