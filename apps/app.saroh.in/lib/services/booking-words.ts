/**
 * One word for each thing in Bookings (DEC-113 as amended by DEC-170, U18
 * of the bookings plan). Every screen that says how a booking stands, how
 * it went or how it is paid takes its words from here, so the calendar,
 * the list, quick look and a booking's page never disagree.
 *
 * `scripts/check-words.mjs` fails on the words these replaced ("To
 * confirm", "No-show", "Check in", "Pay link", …) in the workspace.
 * Pure and import-free: client components read it too.
 */
export const BOOKING_WORDS = {
    /** A `PENDING` booking: held while the customer pays (DEC-170). */
    awaitingPayment: "Awaiting payment",
    /** How it went, `ATTENDED`. */
    came: "Came",
    /** How it went, `NO_SHOW`. */
    didntCome: "Didn't come",
    /** Nobody has marked how it went yet. */
    notMarked: "Not marked yet",
    /** The button that marks someone as here. */
    markArrived: "Mark arrived",
    /** Paid at the desk, on the day (DEC-170's default for a booking by hand). */
    paysAtVisit: "Pays at the visit",
    /** The link a customer pays from. */
    paymentLink: "Payment link",
    /** The button that makes a booking. */
    book: "Book",
} as const;

/** How a booking went, in words: Came, Didn't come, or Not marked yet. */
export function outcomeWord(outcome: "ATTENDED" | "NO_SHOW" | null): string {
    if (outcome === "ATTENDED") return BOOKING_WORDS.came;
    if (outcome === "NO_SHOW") return BOOKING_WORDS.didntCome;
    return BOOKING_WORDS.notMarked;
}
