/**
 * The moments a business is told about once (wave G). The API keeps the
 * same list (`organizations/moments.ts`) and stores which of them the
 * business has seen. A new moment is a line in both.
 *
 * Pure: safe in server and client components.
 */
export const MOMENT_KEYS = [
    "first-order",
    "first-booking",
    "orders-10",
    "orders-100",
] as const;

export type MomentKey = (typeof MOMENT_KEYS)[number];

/**
 * One moment, as the shared `Moment` draws it: a title, one line holding
 * the real fact, and at most one thing worth doing next.
 */
export interface MomentView {
    key: MomentKey;
    title: string;
    fact: string;
    action?: { label: string; href: string };
}
