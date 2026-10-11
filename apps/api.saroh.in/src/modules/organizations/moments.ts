/**
 * The moments a business is told about once (wave G): a first order, a first
 * booking, a tenth order. Pure, so the list and the reading of what is
 * stored are tested without a database.
 *
 * The workspace decides WHEN a moment is true, from reads it already makes
 * (the only order, the only booking). The API keeps one fact: that someone
 * in the business put it away or opened what it pointed at, so nobody is
 * told twice, on any device. Stored on `Organization.momentsSeen` as
 * `{ "<key>": "<ISO time>" }`.
 *
 * A fixed list, never a caller's own key: the column holds only these.
 * A new moment is a line here and the same line in the workspace's
 * `lib/moments/keys.ts`.
 */
export const MOMENT_KEYS = [
    "first-order",
    "first-booking",
    "orders-10",
    "orders-100",
] as const;

export type MomentKey = (typeof MOMENT_KEYS)[number];

export function isMomentKey(value: unknown): value is MomentKey {
    return (
        typeof value === "string" &&
        (MOMENT_KEYS as readonly string[]).includes(value)
    );
}

/**
 * What is stored, read safely: the known keys with a time against them.
 * Anything else in the column (an older key, a value that is not a time)
 * is left out rather than trusted.
 */
export function seenMoments(
    stored: unknown,
): Partial<Record<MomentKey, string>> {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        return {};
    }
    const out: Partial<Record<MomentKey, string>> = {};
    for (const key of MOMENT_KEYS) {
        const at = (stored as Record<string, unknown>)[key];
        if (typeof at === "string" && !Number.isNaN(Date.parse(at))) {
            out[key] = at;
        }
    }
    return out;
}
