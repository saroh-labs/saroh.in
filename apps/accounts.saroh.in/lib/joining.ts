/**
 * Whether sign-up or sign-in ends at accepting a business's invitation
 * (UX-029): then the pages speak to an invitee, whose account joins someone
 * else's business ("that comes in a moment" was wrong for them), and the
 * address is the invitation's, since accepting refuses any other.
 */
export { isJoinDestination as isJoining } from "@saroh/auth/origins";

/** Where a page goes, carrying the destination and the address with it. */
export function withCarry(
    path: string,
    returnTo: string | null | undefined,
    email?: string,
): string {
    const q = new URLSearchParams();
    if (email) q.set("email", email);
    if (returnTo) q.set("redirect", returnTo);
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
}
