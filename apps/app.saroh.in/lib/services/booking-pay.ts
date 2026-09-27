import type { CustomerPick } from "@/lib/customers/picker";

/**
 * How a booking made by hand is paid (the "Saroh Bookings" design's New
 * booking, E4), pure so both New booking dialogs and tests share it.
 */

/** What the viewer may do about the customer and the money (E4). */
export interface BookingPeople {
    /** `contact:read`: search customers and see their Needs attention. */
    canSearch: boolean;
    /** `booking:write` and `invoice:write`, with a provider connected. */
    payLink: boolean;
}

/** Send a pay link, pay at the session, or paid now. */
export type PayChoice = "LINK" | "DESK" | "PAID";

/**
 * The choices in the design's order. "Send a pay link" is offered only for
 * a priced booking by someone who may issue its invoice, with a payment
 * provider connected; it is then the default, as the design has it.
 */
export function payChoices(offerLink: boolean): {
    key: PayChoice;
    label: string;
}[] {
    return [
        ...(offerLink
            ? [{ key: "LINK" as const, label: "Send a pay link" }]
            : []),
        { key: "DESK", label: "Pays at the session" },
        { key: "PAID", label: "Paid now" },
    ];
}

/** The choice to start with, and to fall back to when the link goes. */
export function defaultPay(offerLink: boolean): PayChoice {
    return offerLink ? "LINK" : "DESK";
}

/** What each choice does, said before "Book it". */
export function payNote(choice: PayChoice): string {
    switch (choice) {
        case "LINK":
            return "Booked now, and you get a pay link to send them. It shows unpaid until they pay; Saroh doesn't send it for you yet.";
        case "DESK":
            return "Booked now; the calendar shows they pay at the session.";
        case "PAID":
            return "Recorded as paid. Saroh takes no payment and makes no receipt for it.";
    }
}

/** What the booking API is sent for a choice. A link books it unpaid. */
export function paidWithFor(choice: PayChoice): "DESK" | "PAID" | undefined {
    return choice === "LINK" ? undefined : choice;
}

/**
 * Who a booking is for, as the booking API takes it: a contact by id, or
 * someone new by their email (the API makes the contact, or books the one
 * that email already belongs to). A walk-in can't be booked: a booking
 * needs a customer record.
 */
export function bookerFor(
    pick: CustomerPick | null,
):
    | { contactId: string }
    | { bookerEmail: string; bookerName?: string; bookerPhone?: string }
    | null {
    if (!pick || pick.kind === "walk-in") return null;
    if (pick.kind === "contact") return { contactId: pick.id };
    return {
        bookerEmail: pick.email,
        ...(pick.name ? { bookerName: pick.name } : {}),
        ...(pick.phone ? { bookerPhone: pick.phone } : {}),
    };
}
