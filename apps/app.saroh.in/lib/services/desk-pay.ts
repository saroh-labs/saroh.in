/**
 * "Take ₹X" at the desk for a booking (round-2 P2), pure so the booking
 * page, the calendar's quick look and their tests say it the same way: the
 * ways the desk takes it (the walk-in's, B13), what each says before the
 * button, the button's words, the change, and what the toast says after.
 * The API works out what is owed and refuses what it can't take; nothing
 * here decides that.
 */

import type { CashChange } from "@/lib/orders/new-order";
import { cashChange, centsOf } from "@/lib/orders/new-order";

/** How the desk takes it, as the API records it. */
export type DeskMethod = "CASH" | "UPI" | "CARD";

/** A choice in the dialog: a way to take it here, or a link to pay online. */
export type DeskChoice = DeskMethod | "LINK";

/** What "Take ₹X" can take now, as the booking and diary reads send it. */
export interface DeskTake {
    cents: number;
    /** A pay link could ask for it instead (never a deposit's balance). */
    byLink: boolean;
}

/** What the API is sent (`POST bookings/:id/desk-payment`). */
export interface DeskPaymentInput {
    method: DeskMethod;
    /** What the button said: the API refuses a changed amount. */
    amountCents: number;
    /** Cash given, for the change; only with CASH. */
    receivedCents?: number;
}

/** What the desk took, as the API answers. */
export interface DeskPayment {
    invoiceId: string;
    number: string | null;
    amountCents: number;
    currency: string;
    method: DeskMethod;
    changeCents: number | null;
    /** The same take asked again (a double click): nothing new was written. */
    replayed: boolean;
}

/** How a payment taken by hand reads: "Cash", "UPI", "Card". */
export function methodWord(method: string | null | undefined): string | null {
    switch (method) {
        case "CASH":
            return "Cash";
        case "UPI":
            return "UPI";
        case "CARD":
            return "Card";
        case "BANK_TRANSFER":
            return "Bank transfer";
        case "OTHER":
            return "Other";
        default:
            return null;
    }
}

/** "Paid at the desk · Cash" — how the desk took it, never how much. */
export function paidAtDeskText(method: string | null | undefined): string {
    const word = methodWord(method);
    return word ? `Paid at the desk · ${word}` : "Paid at the desk";
}

/**
 * The chips, in the walk-in's order (B13), each with why it's off when it
 * is. A link bills the whole booking, so it's never offered for what is
 * left after a deposit; it needs someone who may send links and a provider.
 */
export function deskChoices(input: {
    take: DeskTake;
    /** `booking:write` and `invoice:write`, with a provider connected. */
    canLink: boolean;
    /**
     * The plan takes payment online (`takesOnlinePayment`). When it
     * doesn't, the link isn't offered at all — not even greyed out — and
     * the counter ways are the choices (R33). Absent: yes.
     */
    online?: boolean;
}): { key: DeskChoice; label: string; off: string | null }[] {
    return [
        { key: "CASH", label: "Cash", off: null },
        { key: "UPI", label: "UPI at the counter", off: null },
        { key: "CARD", label: "Card machine", off: null },
        ...(input.online === false
            ? []
            : [
                  {
                      key: "LINK" as const,
                      label: "Send a pay link",
                      off: !input.take.byLink
                          ? "A pay link bills the whole booking, so take the rest here"
                          : !input.canLink
                            ? "Connect a payment provider to send a link"
                            : null,
                  },
              ]),
    ];
}

/** What each choice does, said before the button (the walk-in's words). */
export function deskNote(choice: DeskChoice, amount: string): string {
    switch (choice) {
        case "CASH":
            return "Paid now. It goes in the till, and the booking's invoice is marked paid.";
        case "UPI":
            return `Show the counter QR. Record it once ${amount} shows on your UPI app.`;
        case "CARD":
            return `Key ${amount} into the machine; record it once it approves.`;
        case "LINK":
            return "You get a link to send them. The booking shows unpaid until they pay; Saroh doesn't send it for you yet.";
    }
}

/** The button's words. */
export function deskButton(choice: DeskChoice, amount: string): string {
    switch (choice) {
        case "CASH":
            return `Take ${amount} cash`;
        case "UPI":
            return "UPI received";
        case "CARD":
            return "Card approved";
        case "LINK":
            return "Get the pay link";
    }
}

/** The change line under "Cash given", from what was typed. */
export function deskChange(given: string, cents: number): CashChange {
    return cashChange(given, cents);
}

/**
 * What stops the button, or null: cash given that's short, or that isn't
 * an amount at all.
 */
export function deskProblem(
    choice: DeskChoice,
    given: string,
    cents: number,
    format: (cents: number) => string,
): string | null {
    if (choice !== "CASH" || !given.trim()) return null;
    if (!Number.isFinite(centsOf(given)))
        return "Type the cash given as an amount.";
    const change = cashChange(given, cents);
    return change.kind === "short"
        ? `That's ${format(change.cents)} short.`
        : null;
}

/** What the API is sent for a choice taken here (not a link). */
export function deskInput(
    method: DeskMethod,
    cents: number,
    given: string,
): DeskPaymentInput {
    const received = method === "CASH" && given.trim() ? centsOf(given) : NaN;
    return {
        method,
        amountCents: cents,
        ...(Number.isFinite(received) ? { receivedCents: received } : {}),
    };
}

/** The toast once it's taken: "₹500 taken in cash — give ₹500 change." */
export function deskTakenText(
    paid: DeskPayment,
    format: (cents: number) => string,
): string {
    const amount = format(paid.amountCents);
    const how =
        paid.method === "CASH"
            ? `${amount} taken in cash`
            : paid.method === "UPI"
              ? `${amount} taken by UPI`
              : `${amount} taken by card`;
    return paid.changeCents
        ? `${how} — give ${format(paid.changeCents)} change.`
        : `${how}. The invoice is marked paid.`;
}
