/**
 * What an operator is told when they set a business's limit below what it
 * already has (#802), in what actually happens then (#800,
 * `billing/over-limit.ts`): the rows a move down pauses say what pauses
 * and when; the rest keep what they have and only stop adding. With plan
 * rules off for the business, nothing pauses or is refused, and it says
 * so. Pure.
 */
import { PAUSE_NOTICE_DAYS, PAUSE_ROWS } from "../billing/over-limit";

/** What pauses past the limit, per catalogue row, in the console's words. */
const PAUSES: Record<keyof typeof PAUSE_ROWS, string> = {
    members:
        "the team members who joined most recently are paused (the owner never is)",
    reviewers: "the view-only people who joined most recently are paused",
    products: "its oldest products are hidden from its site and read-only",
    blog: "its oldest blog posts are hidden from its site and read-only",
    locations:
        "its newest locations stop taking orders, stock and history kept",
    sites: "its newest websites stop taking orders and bookings",
};

function pauses(rowId: string): string | null {
    return Object.prototype.hasOwnProperty.call(PAUSES, rowId)
        ? PAUSES[rowId as keyof typeof PAUSES]
        : null;
}

export function limitOverrideWarning(input: {
    /** The catalogue row (`members`, `products`, `orders`, …). */
    rowId: string;
    used: number;
    value: number;
    /** `PLAN_ENFORCEMENT` applies to this business. */
    enforced: boolean;
    /** The limit counts a month (orders, bookings, visits). */
    monthly: boolean;
}): string | null {
    const { used, value } = input;
    if (used <= value) return null;
    const has = input.monthly
        ? `It has ${used} this month already.`
        : `It has ${used} already.`;
    if (!input.enforced) {
        return `${has} Plan rules are off for this business, so nothing pauses and nothing is refused until they are on.`;
    }
    const what = pauses(input.rowId);
    if (!what) {
        return `${has} It keeps what it has; it can't add more until it is under ${value}${input.monthly ? " (a new month starts again)" : ""}.`;
    }
    return `${has} The business is told now, and ${PAUSE_NOTICE_DAYS} days later what is over ${value} pauses: ${what}. Nothing is deleted, and raising the limit again restores it at once.`;
}
