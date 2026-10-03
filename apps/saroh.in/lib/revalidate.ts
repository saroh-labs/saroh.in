import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The pricing revalidation hook's contract (plans catalogue U24, KTD-10).
 * The API calls `POST /api/revalidate` with the shared secret in this header
 * after a version is published (once the transaction commits) and again at a
 * scheduled version's `goLiveAt`.
 */
export const REVALIDATE_HEADER = "x-saroh-revalidate";

/**
 * The pages that read the catalogue, and the waitlist, whose launch offer
 * names a catalogue plan (`GET /public/waitlist/offer`). Fixed: the hook
 * takes no path, so a caller can only ever refresh these.
 */
export const REVALIDATE_PATHS: readonly {
    path: string;
    type?: "page" | "layout";
}[] = [
    { path: "/pricing" },
    { path: "/" },
    { path: "/features/[slug]", type: "page" },
    { path: "/solutions/[slug]", type: "page" },
    { path: "/waitlist" },
];

/** Compares in constant time, whatever the lengths. */
export function secretMatches(
    given: string | null,
    expected: string | undefined,
): boolean {
    if (!given || !expected) return false;
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
}
