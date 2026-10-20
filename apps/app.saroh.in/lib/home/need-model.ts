/**
 * A row of Needs you and its inline action, and a money change: the shapes
 * Home's flat list and Home A's groups share. Kept apart from `service.ts`
 * so the Home A shapes (`today-first-model.ts`) can use them without a
 * cycle; `service.ts` re-exports them. Type-only.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

/**
 * A Needs-you tag's colour, as the design names them: `bad` for something
 * already wrong, `due` for something to do soon, `info` for something to
 * know. The tag's words always say it too.
 */
export type HomeTone = "bad" | "due" | "info";

/**
 * What an inline action on a Needs-you row will do (F4). The API sends one
 * only to a viewer who may do it, only when the write can take it, with
 * words that say who is told and how (`home-inline.ts`). Each calls its
 * target's own endpoint; see `lib/home/inline-actions.ts` for how it runs.
 */
export interface HomeInline {
    kind:
        | "MARK_SENT"
        | "RETRY"
        | "SEND_REMINDER"
        | "REPLY"
        | "REVIEW_REPLY"
        | "REFUND"
        // Needs you's groups (DEC-171): a booking awaiting payment.
        | "SEND_PAY_LINK"
        | "TURN_DOWN";
    /** The row's button. */
    label: string;
    /** What will happen, and who is told. */
    confirm: string;
    /** The confirm's button. */
    yes: string;
    /** What the row says once done. */
    done: string;
    /** A message leaves the business: held ten seconds first. */
    sends: boolean;
    /** Whether Undo is offered (never once a message has left). */
    undoable: boolean;
    /**
     * The order, subscription, invoice, contact or review it acts on; for
     * REFUND, the payment taken at the wrong amount; for SEND_PAY_LINK and
     * TURN_DOWN, the booking.
     */
    target: string;
    /** The customer's first name, for the words after; null without one. */
    person: string | null;
    /** MARK_SENT: the step it moves the order to. */
    stage?: string;
    /**
     * RETRY: how — a new payment link, or a new charge on their autopay (D13).
     * The API offers no Retry while an autopay charge is under way.
     */
    via?: "PAY_LINK" | "MANDATE";
}

/**
 * A step a Needs-you row opens where it is taken, beside its inline action
 * (D14): "Send a set-up link" on a renewal whose autopay limit is too low
 * opens Subscription Detail's own set-up sheet. Sent only to someone who may
 * take it, while the business offers autopay.
 */
export interface HomeRowLink {
    label: string;
    href: string;
}

/**
 * One row of Needs you (F3), flat and already ranked by the API.
 *
 * Money travels in minor units beside the words, and `amountIn` says where
 * it goes: "₹4,800 overdue from Farah Khan" is the title "overdue from Farah
 * Khan" with `amountIn: "title"`. See `lib/home/needs.ts`.
 */
export interface HomeNeed {
    id: string;
    code: string;
    severity: HomeSeverity;
    title: string;
    sub: string | null;
    amountMinor: number | null;
    currency: string | null;
    amountIn: "title" | "sub" | null;
    tag: string | null;
    tone: HomeTone;
    href: string;
    moduleKey?: string;
    inline?: HomeInline;
    link?: HomeRowLink;
    /**
     * A quiet second action beside `inline` (A7): Turn down beside Send
     * payment link on a booking awaiting payment.
     */
    second?: HomeInline;
}

/**
 * This week's takings against the same days last week (F7): up, down or
 * level by a whole percent, or `THIN` — too little last week to compare.
 */
export type HomeWeekChange =
    { kind: "UP" | "DOWN" | "LEVEL"; percent: number } | { kind: "THIN" };
