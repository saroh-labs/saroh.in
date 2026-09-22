/**
 * The public review invitation, and the checks that narrow it. Kept apart
 * from `reviews.ts`, which reads the app's env, so they can be tested without
 * one — the checkout-shape pattern.
 */

export interface ReviewLine {
    orderItemId: string;
    productName: string;
    image: string | null;
    reviewed: boolean;
}

export interface ReviewInvitation {
    storeName: string;
    /** `--site-*` variables for the business's theme, or null for defaults. */
    theme: Record<string, string> | null;
    suggestedName: string;
    lines: ReviewLine[];
}

/** Why a link cannot be used — each has its own sentence on the page. */
export type ReviewGoneReason = "expired" | "completed" | "not-eligible";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";

function isLine(v: unknown): v is ReviewLine {
    return (
        isRecord(v) &&
        isString(v.orderItemId) &&
        isString(v.productName) &&
        (v.image === null || isString(v.image)) &&
        typeof v.reviewed === "boolean"
    );
}

function isTheme(v: unknown): v is Record<string, string> | null {
    return v === null || (isRecord(v) && Object.values(v).every(isString));
}

export function isReviewInvitation(v: unknown): v is ReviewInvitation {
    return (
        isRecord(v) &&
        isString(v.storeName) &&
        isString(v.suggestedName) &&
        isTheme(v.theme) &&
        Array.isArray(v.lines) &&
        v.lines.every(isLine)
    );
}

/** The 410 body's reason, if it is one this page knows. */
export function goneReason(body: unknown): ReviewGoneReason | null {
    const details = isRecord(body)
        ? isRecord(body.error)
            ? body.error.details
            : body.details
        : undefined;
    const reason = isRecord(details) ? details.reason : undefined;
    return reason === "expired" ||
        reason === "completed" ||
        reason === "not-eligible"
        ? reason
        : null;
}
