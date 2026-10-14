import type { NextCharge } from "./plan";

/**
 * Settings › Plan and billing says one thing at a time (owner, 13 Oct
 * 2026): one status line that is always there ("You're on Plan B · First
 * month until ‹date› · then ‹amount› a month"), at most ONE message when
 * something needs the business, and everything else that is true but asks
 * nothing behind "How billing works". Pure: which words, and which note
 * wins. The notes themselves are `yourPlan`'s (`./plan-view.ts`).
 */

type Cycle = "month" | "year";

/**
 * What a note on "Your plan" is about. The screen shows one message at a
 * time and keeps the rest behind "How billing works": `planMessage`
 * ranks them by this.
 */
export type PlanNoteKind =
    | "overdue"
    | "authorise"
    | "move"
    | "scheduled"
    | "renewed"
    | "renew"
    | "warning"
    | "given"
    | "firstMonth"
    | "term";

/** A note on "Your plan": words around one date, and what can be done. */
export interface PlanNote {
    kind: PlanNoteKind;
    tone: "info" | "attention";
    lead: string;
    iso: string | null;
    tail: string;
    /** Opens the change dialog for a plan: to authorise or start again. */
    action: { label: string; planId: string; cycle: Cycle } | null;
}

/** One fact on the status line: words around at most one date. */
export interface StatusPart {
    lead: string;
    iso?: string | null;
    tail?: string;
}

/**
 * What happens next, after "You're on ‹plan›": the first month and what
 * follows it, the next charge, or why there is none. A line that names no
 * amount says the plan's price first, so what it costs is never left out.
 */
export function nextParts(
    next: NextCharge,
    opts: { firstMonth?: boolean; cycle?: Cycle; price?: string | null } = {},
): StatusPart[] {
    const price =
        opts.price && opts.price !== "₹0" && opts.price !== "Free"
            ? [{ lead: opts.price }]
            : [];
    switch (next.kind) {
        case "charge":
            return opts.firstMonth
                ? [
                      { lead: "First month until ", iso: next.iso },
                      {
                          lead: `then ${next.amount} ${opts.cycle === "year" ? "a year" : "a month"}`,
                      },
                  ]
                : [{ lead: `Next charge ${next.amount} on `, iso: next.iso }];
        case "ends":
            return [...price, { lead: "Ends ", iso: next.iso }];
        case "paidTo":
            return [...price, { lead: "Paid to ", iso: next.iso }];
        default:
            return [...price, { lead: next.text }];
    }
}

/**
 * Which note may be the page's one message, most pressing first: a payment
 * that failed, a change that is due and waits on the business, a plan
 * change that is on its way, the term's renewal, then any other warning.
 * A kind left out is a background fact and never the message: a plan given
 * for a while (the status line and its card say it), the first month and
 * the 12-month term.
 */
const RANK: Partial<Record<PlanNoteKind, number>> = {
    overdue: 0,
    authorise: 1,
    move: 2,
    scheduled: 2,
    renewed: 3,
    renew: 4,
    warning: 5,
};

/**
 * The one message, and what waits behind "How billing works".
 *
 * A checkout waiting for its payment comes before every note (`pending`):
 * it is the payment being made, it checks with the provider as it is
 * drawn, and it is what stops a second payment. `rest` keeps every other
 * note in the order it was written, so nothing the page knew is dropped.
 */
export function planMessage(input: {
    notes: readonly PlanNote[];
    /** A legacy plan's one warning (`planSummary`). */
    warning?: string | null;
    /** A checkout is waiting, and this reader may carry it on. */
    pending?: boolean;
}): { message: PlanNote | "pending" | null; rest: PlanNote[] } {
    const notes: PlanNote[] = [
        ...input.notes,
        ...(input.warning
            ? [
                  {
                      kind: "warning" as const,
                      tone: "attention" as const,
                      lead: input.warning,
                      iso: null,
                      tail: "",
                      action: null,
                  },
              ]
            : []),
    ];
    if (input.pending) return { message: "pending", rest: notes };
    let first: PlanNote | null = null;
    for (const note of notes) {
        const rank = RANK[note.kind];
        if (rank === undefined) continue;
        if (first === null || rank < (RANK[first.kind] ?? Infinity)) {
            first = note;
        }
    }
    return { message: first, rest: notes.filter((n) => n !== first) };
}

/**
 * How Saroh's plans are paid, said once for every business. The same
 * sentences the change dialog's quote says of one change.
 */
export function billingRules(yearly: boolean): string[] {
    return [
        yearly
            ? "Monthly is autopay for 12 months and yearly is one payment. Before either ends, we ask you to pay for the next term."
            : "Plans are paid monthly by autopay, for 12 months. Before that ends, we ask you to pay for the next term.",
        "Upgrades start today. A cheaper plan or Free starts when what you've paid for ends.",
    ];
}
