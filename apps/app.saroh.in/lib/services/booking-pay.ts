import type { CustomerPick } from "@/lib/customers/picker";

/**
 * How a booking made by hand is paid (E4, DEC-170), pure so the booking
 * sheets (`components/bookings/sheets/pay-choice.tsx`), both New booking
 * flows and their tests share it.
 */

/** What the viewer may do about the customer and the money (E4). */
export interface BookingPeople {
    /** `contact:read`: search customers and see their Needs attention. */
    canSearch: boolean;
    /**
     * `booking:write` and `invoice:write`, on a plan that takes payment
     * online, with a provider connected (`offersOnlinePay`, R33).
     */
    payLink: boolean;
    /**
     * `booking:write` and `invoice:write` (`canTakeDeskPayments`): may
     * record "Paid now" (DEC-098). Left out, it is read as allowed, as
     * before DEC-170; the API refuses it either way.
     */
    canTakePayment?: boolean;
}

/** Pays at the visit, send a payment link, or paid now. */
export type PayChoice = "LINK" | "DESK" | "PAID";

/** How "Paid now" was paid (DEC-170), saved with the booking. */
export type PaidBy = "CASH" | "UPI" | "CARD";

export const PAID_BY: readonly { key: PaidBy; label: string }[] = [
    { key: "CASH", label: "Cash" },
    { key: "UPI", label: "UPI" },
    { key: "CARD", label: "Card" },
];

/**
 * The choices in the boards' order (BKMNewBookingStep5): "Pays at the
 * visit" first and the default for a booking made by hand (DEC-170), then
 * "Send a payment link" only for a priced booking by someone who may issue
 * its invoice, on a plan that takes payment online, with a provider
 * connected, then "Paid now".
 */
export function payChoices(offerLink: boolean): {
    key: PayChoice;
    label: string;
}[] {
    return [
        { key: "DESK", label: "Pays at the visit" },
        ...(offerLink
            ? [{ key: "LINK" as const, label: "Send a payment link" }]
            : []),
        { key: "PAID", label: "Paid now" },
    ];
}

/**
 * The choice to start with, and to fall back to when the link goes:
 * always "Pays at the visit" (DEC-170). A payment link or "Paid now" stays
 * one choice away. The argument is kept for older callers.
 */
export function defaultPay(_offerLink?: boolean): PayChoice {
    return "DESK";
}

/**
 * What each choice does, on its card (BKMNewBookingStep5). `amount` is the
 * price in words ("₹800"); without one the visit line says so plainly.
 */
export function payNote(choice: PayChoice, amount?: string | null): string {
    switch (choice) {
        case "DESK":
            return amount
                ? `${amount} to take when they come`
                : "Take it when they come";
        case "LINK":
            return "You share it on WhatsApp or SMS. Shows Awaiting payment until paid.";
        case "PAID":
            return "Cash, UPI or card, taken already";
    }
}

/** The line under Cash, UPI or Card once one is picked. */
export function paidByNote(how: PaidBy, amount?: string | null): string {
    switch (how) {
        case "CASH":
            return "Recorded as paid in cash. It goes in the till.";
        case "UPI":
            return `Record it once ${amount ?? "the payment"} shows on your UPI app.`;
        case "CARD":
            return "Record it once the card machine approves.";
    }
}

/** "Paid now" with no way picked: what the Book button says is missing. */
export const PAID_BY_MISSING = "Say how they paid: Cash, UPI or Card.";

/**
 * What stops a booking's payment being sent as chosen, or null: "Paid
 * now" needs how it was paid.
 */
export function payProblem(
    choice: PayChoice,
    paidBy: PaidBy | null,
): string | null {
    return choice === "PAID" && !paidBy ? PAID_BY_MISSING : null;
}

/** What the booking API is sent for a choice. A link books it unpaid. */
export function paidWithFor(choice: PayChoice): "DESK" | "PAID" | undefined {
    return choice === "LINK" ? undefined : choice;
}

/** The payment fields of `bookByHand`, as chosen (DEC-170). */
export function payInput(
    choice: PayChoice,
    paidBy: PaidBy | null,
): { paidWith?: "DESK" | "PAID"; paidBy?: PaidBy } {
    const paidWith = paidWithFor(choice);
    return {
        ...(paidWith ? { paidWith } : {}),
        ...(paidWith === "PAID" && paidBy ? { paidBy } : {}),
    };
}

/**
 * Who a booking is for, as the booking API takes it: a contact by id;
 * someone new by their email (the API makes the contact, or books the one
 * that email already belongs to); or, with no email, by their name and
 * phone (DEC-170: the customer with that phone, else one kept by it). A
 * walk-in can't be booked: a booking needs a customer record.
 */
export function bookerFor(
    pick: CustomerPick | null,
):
    | { contactId: string }
    | { bookerEmail: string; bookerName?: string; bookerPhone?: string }
    | { bookerPhone: string; bookerName: string }
    | null {
    if (!pick || pick.kind === "walk-in") return null;
    if (pick.kind === "contact") return { contactId: pick.id };
    const email = pick.email.trim();
    const name = pick.name.trim();
    const phone = pick.phone.trim();
    if (email) {
        return {
            bookerEmail: email,
            ...(name ? { bookerName: name } : {}),
            ...(phone ? { bookerPhone: phone } : {}),
        };
    }
    if (name && phone) return { bookerPhone: phone, bookerName: name };
    return null;
}
