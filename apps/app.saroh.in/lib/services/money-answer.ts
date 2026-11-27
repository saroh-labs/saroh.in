/**
 * A booking's money as one answer (DEC-272): the API works it out once
 * (`bookingPay` in the bookings module) and every surface here only says
 * it — the List's Money and badge, the diary's block, the quick look, the
 * booking's page and the customer's page. Pure and import-light: client
 * components read it.
 */
import { formatMoney } from "@/lib/format/money";
import { BOOKING_WORDS } from "@/lib/services/booking-words";

/** The one payment word, as the API sends it. */
export type PayWord =
    | "FREE"
    | "PAID"
    | "AWAITING_PAYMENT"
    | "PAYS_AT_VISIT"
    | "PACK"
    | "MEMBERSHIP"
    | "ON_ORDER"
    | "WITH_COURSE"
    | "NOTHING_TO_PAY";

/** How the money came in, or that a pay link asks for it. */
export type PayHow = "ONLINE" | "DESK" | "ONLINE_AND_DESK" | "LINK" | null;

/**
 * The answer. `paidCents` and `dueCents` come only to a viewer who reads
 * money (DEC-098); the word and how come to everyone who reads bookings.
 */
export interface BookingPay {
    word: PayWord | null;
    how: PayHow;
    paidCents?: number;
    /** Still to take; null where money doesn't apply (a pack, a course). */
    dueCents?: number | null;
}

const PAID_HOW: Record<"ONLINE" | "DESK" | "ONLINE_AND_DESK", string> = {
    ONLINE: "Paid online",
    DESK: "Paid at the desk",
    ONLINE_AND_DESK: "Paid online and at the desk",
};

/**
 * The payment word in the desk's words: "Awaiting payment", "Pays at the
 * visit", "Paid online", "Free", "Class pack"… Null when there is nothing
 * to say (no price, nothing recorded).
 */
export function payText(
    pay: BookingPay | null | undefined,
    packName?: string | null,
): string | null {
    switch (pay?.word) {
        case "FREE":
            return BOOKING_WORDS.free;
        case "PAID":
            return pay.how && pay.how !== "LINK" ? PAID_HOW[pay.how] : "Paid";
        case "AWAITING_PAYMENT":
            return BOOKING_WORDS.awaitingPayment;
        case "PAYS_AT_VISIT":
            return BOOKING_WORDS.paysAtVisit;
        case "PACK":
            return packName ? `Pack · ${packName}` : "Class pack";
        case "MEMBERSHIP":
            return "Membership";
        case "ON_ORDER":
            return "Paid on its order";
        case "WITH_COURSE":
            return "Paid with the course";
        case "NOTHING_TO_PAY":
            return "Nothing to pay";
        default:
            return null;
    }
}

/** Money still owed for it: the one payment word says Awaiting payment. */
export function owes(pay: BookingPay | null | undefined): boolean {
    return pay?.word === "AWAITING_PAYMENT";
}

/**
 * "Awaiting payment ₹1,200", "Paid online ₹1,200", "Pays at the visit
 * ₹800": the word with the amount that goes with it, for a viewer who reads
 * money; the word alone for anyone else.
 */
export function payLine(
    pay: BookingPay | null | undefined,
    currency: string | null,
    packName?: string | null,
): string | null {
    const word = payText(pay, packName);
    if (!word || !pay) return word;
    const cents =
        pay.word === "PAID" ? pay.paidCents : (pay.dueCents ?? undefined);
    return cents && cents > 0
        ? `${word} ${formatMoney(cents, currency)}`
        : word;
}
