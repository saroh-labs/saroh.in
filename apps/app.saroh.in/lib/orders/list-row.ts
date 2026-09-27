import { formatMoneyMajor } from "@/lib/format/money";

import type { OrderRow } from "./business-service";

/**
 * How one row of the Orders list says where an order stands (plan B, B3),
 * after the "Saroh Orders Screen" design. Pure, so the words are pinned by
 * tests and the row component only draws them.
 *
 * The step words are the order type's, as the API sends them (`steps`,
 * `stepIndex`; DEC-045) — the app keeps no copy of the table. Late is the
 * API's too (`late`), from the storefront's threshold for the type.
 */

/**
 * The pill's tone:
 * - `new` — waiting for someone to start it (Saffron tint);
 * - `prog` — somewhere in the middle;
 * - `ready` — ready for the customer (green);
 * - `done` — at its last step (an outline, asking nothing);
 * - `bad` — refunded or cancelled.
 */
export type StepTone = "new" | "prog" | "ready" | "done" | "bad";

export interface RowProgress {
    /** The pill's word: the step it is at, or Refunded / Cancelled. */
    word: string;
    tone: StepTone;
    /** 0-based step on `count`; null when no progress is drawn. */
    index: number | null;
    count: number;
    /** The progress bar said in words: "Step 2 of 4 · Pick-up · Next: Ready". */
    label: string | null;
    /** The step after this one, if any. */
    next: string | null;
}

type ProgressFields = Pick<
    OrderRow,
    "standing" | "steps" | "stepIndex" | "fulfilmentLabel"
>;

export function rowProgress(row: ProgressFields): RowProgress {
    if (row.standing === "REFUNDED" || row.standing === "CANCELLED") {
        return {
            word: row.standing === "REFUNDED" ? "Refunded" : "Cancelled",
            tone: "bad",
            index: null,
            count: row.steps.length,
            label: null,
            next: null,
        };
    }
    const count = row.steps.length;
    const index =
        count === 0 ? null : Math.min(Math.max(row.stepIndex, 0), count - 1);
    const step = index === null ? undefined : row.steps[index];
    const last = index !== null && index === count - 1;
    // No steps (an old row, O-2): done once fulfilled, else waiting to start.
    const tone: StepTone =
        index === null
            ? row.standing === "FULFILLED"
                ? "done"
                : "new"
            : last
              ? "done"
              : step?.stage === "READY"
                ? "ready"
                : index === 0
                  ? "new"
                  : "prog";
    const next = index === null ? null : (row.steps[index + 1]?.label ?? null);
    return {
        word:
            step?.label ??
            (row.standing === "FULFILLED" ? "Fulfilled" : "Open"),
        tone,
        index,
        count,
        label:
            index === null
                ? null
                : `Step ${index + 1} of ${count} · ${row.fulfilmentLabel}` +
                  (next ? ` · Next: ${next}` : ""),
        next,
    };
}

/** "just now", "12 min", "3 h", "2 d" — the design's clock words. */
export function ageWords(minutes: number): string {
    const m = Math.max(0, Math.floor(minutes));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min`;
    if (m < 24 * 60) return `${Math.floor(m / 60)} h`;
    return `${Math.floor(m / (24 * 60))} d`;
}

/**
 * How long a row has waited, and "Late · 3 h" once the API says it is late.
 * Only while the order is still on its way: a finished, refunded or
 * cancelled order has nothing to wait for. An appointment goes by its
 * visits, not the clock, so it shows none (B14 brings "Next visit").
 */
export function rowAge(
    row: Pick<
        OrderRow,
        | "standing"
        | "steps"
        | "stepIndex"
        | "fulfilmentType"
        | "ageMinutes"
        | "late"
    >,
): { text: string; late: boolean } | null {
    if (row.standing === "REFUNDED" || row.standing === "CANCELLED") {
        return null;
    }
    if (
        row.fulfilmentType === "APPOINTMENT_IN_PERSON" ||
        row.fulfilmentType === "APPOINTMENT_ONLINE"
    ) {
        return null;
    }
    if (row.steps.length > 0 && row.stepIndex >= row.steps.length - 1) {
        return null;
    }
    // With no steps to go by (an old row, O-2), fulfilled is done.
    if (row.steps.length === 0 && row.standing === "FULFILLED") return null;
    const words = ageWords(row.ageMinutes);
    return row.late === true
        ? { text: `Late · ${words}`, late: true }
        : { text: words, late: false };
}

/**
 * The row's money, only when the API sent it: a caller without `order:read`
 * (the kitchen, DEC-024) gets neither the total nor what is unpaid, and the
 * row draws neither. "₹480 unpaid" only while there is something to collect
 * on an order that still stands.
 */
export function rowMoney(
    row: Pick<
        OrderRow,
        "total" | "unpaidAmount" | "currency" | "payment" | "standing"
    >,
): { total: string | null; unpaid: string | null } {
    const total =
        row.total === undefined
            ? null
            : formatMoneyMajor(row.total, row.currency);
    const owed = Number(row.unpaidAmount ?? 0);
    const stands = row.standing !== "CANCELLED" && row.standing !== "REFUNDED";
    const unpaid =
        row.unpaidAmount !== undefined &&
        row.payment === "UNPAID" &&
        stands &&
        owed > 0
            ? `${formatMoneyMajor(row.unpaidAmount, row.currency)} unpaid`
            : null;
    return { total, unpaid };
}

/** "#1042 · 2 items · Hill Road · Pick-up" — the storefront only with several. */
export function rowSubline(
    row: Pick<OrderRow, "itemCount" | "store" | "fulfilmentLabel">,
    showStore: boolean,
): string {
    const items = row.itemCount === 1 ? "1 item" : `${row.itemCount} items`;
    return [items, showStore ? row.store.name : null, row.fulfilmentLabel]
        .filter(Boolean)
        .join(" · ");
}

/** The customer's name, or their email when there is no name. */
export function rowCustomer(row: Pick<OrderRow, "customer">): string {
    return row.customer?.name ?? row.customer?.email ?? "Unknown customer";
}

/** Two letters from the name, or one from the email when there is no name. */
export function rowInitials(row: Pick<OrderRow, "customer">): string {
    const name = row.customer?.name ?? "";
    const letters = name
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    if (letters.length > 0) return letters;
    return (row.customer?.email ?? "?").charAt(0).toUpperCase();
}
