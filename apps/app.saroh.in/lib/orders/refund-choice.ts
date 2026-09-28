/**
 * The refund sheet's own rules (B8), pure: why a refund is made, and "Or
 * another amount". The API decides what is refunded — it caps another
 * amount at what was paid and not yet handed back — so these say only what
 * the sheet can know before it asks.
 */

/** "Why", as the design lists it. The label is what the order keeps. */
export const REFUND_REASONS = [
    { value: "wrong", label: "Wrong item" },
    { value: "quality", label: "Quality" },
    { value: "late", label: "Late" },
    { value: "changed", label: "Customer changed their mind" },
    { value: "goodwill", label: "Goodwill" },
    { value: "other", label: "Other" },
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number]["value"];

/** Longest reason the API keeps. */
export const REFUND_REASON_MAX = 500;

/**
 * What the order records as the reason: the choice's label, or for "Other"
 * the words typed beside it (the label when none were). Null: none chosen.
 */
export function reasonText(
    choice: RefundReason | "",
    other: string,
): string | null {
    if (!choice) return null;
    if (choice === "other") {
        const typed = other.trim().slice(0, REFUND_REASON_MAX);
        return typed || "Other";
    }
    return REFUND_REASONS.find((r) => r.value === choice)?.label ?? null;
}

export type AnotherAmount =
    | { kind: "none" }
    | { kind: "ok"; amount: number; money: string }
    | { kind: "bad"; error: string };

/**
 * "Or another amount", as typed: nothing (the lines decide), an amount the
 * API can take ("50" or "49.50", above zero, no more than is left), or why
 * not. `remaining` is what was paid and not yet refunded, in major units;
 * `format` says an amount as the screen does.
 */
export function anotherAmount(
    raw: string,
    remaining: number,
    format: (n: number) => string,
): AnotherAmount {
    const typed = raw.trim();
    if (!typed) return { kind: "none" };
    if (!/^\d+(\.\d{1,2})?$/.test(typed)) {
        return {
            kind: "bad",
            error: "Type an amount like 50 or 49.50.",
        };
    }
    const cents = Math.round(Number(typed) * 100);
    if (cents <= 0) return { kind: "bad", error: "Type an amount above zero." };
    const leftCents = Math.round(remaining * 100);
    if (cents > leftCents) {
        return {
            kind: "bad",
            error:
                leftCents <= 0
                    ? "Nothing is left to refund on this order."
                    : `At most ${format(leftCents / 100)} can be refunded.`,
        };
    }
    return {
        kind: "ok",
        amount: cents / 100,
        money: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
    };
}
