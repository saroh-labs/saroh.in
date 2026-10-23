/**
 * The Needs-you row shapes (F3, F4) and the week's comparison (F7), which
 * both today's Home and Home A's groups (`home-today-first-model.ts`) are
 * built from. Their own file so neither model file imports the other;
 * `home-model.ts` re-exports every one.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

/**
 * The colour a row's tag is drawn in, as the design names them: `bad` for
 * something already wrong (late, failed, blocked), `due` for something to do
 * soon, `info` for something to know. The tag's words always say it too, so
 * the colour is never the only signal.
 */
export type HomeTone = "bad" | "due" | "info";

/**
 * A step a Needs-you row opens where it is taken, beside its inline action:
 * "Send a set-up link" on a renewal whose autopay limit is too low (D14)
 * opens Subscription Detail's own set-up sheet, where the method is picked.
 */
export interface HomeRowLink {
    /** The button: "Send a set-up link". */
    label: string;
    href: string;
}

/** The inline actions a Needs-you row can carry (F4). */
export type HomeInlineKind =
    | "MARK_SENT"
    | "RETRY"
    | "SEND_REMINDER"
    | "REPLY"
    | "REVIEW_REPLY"
    | "REFUND"
    // Needs you's groups only (DEC-171): a booking awaiting payment.
    | "SEND_PAY_LINK"
    | "TURN_DOWN";

/**
 * How a Retry is made (F4, D13): `PAY_LINK`, a fresh pay link; `MANDATE`,
 * a new charge on the customer's autopay. No Retry is offered while such a
 * charge is under way ("Autopay charge in progress").
 */
export type HomeRetryVia = "PAY_LINK" | "MANDATE";

/**
 * What an inline action on a Needs-you row will do (F4), decided by the API
 * (`home-inline.ts`): it is sent only to a viewer who may do it, only when
 * the write it calls can take it, and its words say truthfully who is told
 * and how. A row without one stays a link.
 *
 * Every action calls the target's own endpoint — the order's stage move,
 * the subscription's retry, the invoice's reminder, the customer's thread —
 * and Home adds no write of its own.
 */
export interface HomeInline {
    kind: HomeInlineKind;
    /** The row's button: "Mark sent". */
    label: string;
    /** What will happen, and who is told, said before it happens. */
    confirm: string;
    /** The confirm's button: "Mark sent and tell Anika". */
    yes: string;
    /** What the row says once it's done: "Reminder sent to Farah". */
    done: string;
    /**
     * A message leaves the business. The app holds it ten seconds (default
     * 51) before it goes, and Undo in that time means nothing leaves; after
     * it, no Undo.
     */
    sends: boolean;
    /** Whether Undo is offered after (never once a message has left). */
    undoable: boolean;
    /**
     * What it acts on: the order, subscription, invoice, contact or review
     * id; for REFUND, the mismatched payment's attempt id.
     */
    target: string;
    /** The customer's first name, for what the toast says after; else null. */
    person: string | null;
    /** MARK_SENT: the step it moves the order to. */
    stage?: string;
    /** RETRY: how it is retried. */
    via?: HomeRetryVia;
}

/**
 * One row of Needs you (F3): one thing to do, with the words for it.
 *
 * The flat list is the ranked actions again, with each action's evidence
 * promoted to a row of its own (a row per order, not "3 open orders"), so
 * the ranking stays on the server. Money travels in minor units beside the
 * words and is placed by `amountIn`, because formatting it is the client's
 * (`formatMoney`): "₹4,800 overdue from Farah Khan" is `amountIn: "title"`
 * with the title "overdue from Farah Khan".
 */
export interface HomeNeed {
    /** Stable across reads: the action's code, and the row's own id. */
    id: string;
    /** The action it came from, e.g. `COMMERCE_OPEN_ORDERS`. */
    code: string;
    severity: HomeSeverity;
    title: string;
    /** The line under the title, without its money. */
    sub: string | null;
    amountMinor: number | null;
    currency: string | null;
    /** Where the amount goes: before the title, before the line, or nowhere. */
    amountIn: "title" | "sub" | null;
    /** The tag's words; the tone is never the only signal. */
    tag: string | null;
    tone: HomeTone;
    href: string;
    moduleKey?: string;
    inline?: HomeInline;
    link?: HomeRowLink;
    /** A quiet second action in place (A7); only on `needGroups`' rows. */
    second?: HomeInline;
}

/**
 * This week's takings against last week's same days (F7): up, down or level
 * by a whole percent, or `THIN` — too little last week to compare.
 */
export type HomeWeekChange =
    { kind: "UP" | "DOWN" | "LEVEL"; percent: number } | { kind: "THIN" };
