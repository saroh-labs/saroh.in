import type {
    BookingPageData,
    BookingService,
    BookPay,
    OfferedCredit,
} from "./model";
import {
    bookingPaymentOf,
    creditChoice,
    formatMoney,
    laterWords,
    payCentsOf,
    payChoices,
    restAfterDeposit,
    rulesText,
    serviceGstWords,
    unpayableText,
} from "./model";
import { waitlistTerms } from "./waitlist";

/**
 * What the booking page says about paying, worked out from what is chosen:
 * the ways to pay, the one chosen, what is due now and what is left, the
 * words on the summary's button and the phone's bar, and the rules under
 * them. Pure, so the flow's shell only draws it.
 */

/** Joining a full class's line, already in it, or a place held for them. */
export type WaitMode = "join" | "waiting" | "held" | null;

/** What is left while the name isn't typed (UX-083: a next step until they try to book). */
export const NAME_LEFT = "Add your name.";
export const PHONE_WRONG = "Check the phone number.";

export function payWords({
    page,
    service,
    credit,
    payChoice,
    signedIn,
    waitMode,
}: {
    page: BookingPageData;
    service: BookingService | null;
    credit: OfferedCredit | null;
    payChoice: BookPay | null;
    signedIn: boolean;
    waitMode: WaitMode;
}) {
    const waiting = waitMode === "join" || waitMode === "waiting";
    // What one booking costs to pay, GST and all: the API's amount, on the
    // button, the summary and the confirmation.
    const price = service
        ? formatMoney(payCentsOf(service), service.currency)
        : null;
    const gstWords = serviceGstWords(service);
    // The ways this service may be paid (E8): the one chosen, else the
    // first — and a service that takes a deposit is at the desk only when
    // online can't take it (DEC-089). Only the ways the business allows
    // (DEC-088). A class credit of their own is offered first (A10).
    const way = bookingPaymentOf(page.rules);
    const choices = service
        ? [
              ...(credit ? [creditChoice(credit, service.currency)] : []),
              ...payChoices(service, page.payOnline, page.businessName, way),
          ]
        : [];
    // A priced service nothing the business allows can pay for: it can't
    // be booked here, and the summary shows no payment line (#822). A
    // credit still books it.
    const unpayable = credit
        ? null
        : unpayableText(service, page.payOnline, page.businessName, way);
    const deskOffered = choices.some((c) => c.pay === "DESK");
    const chosenPay =
        choices.find((c) => c.pay === payChoice) ?? choices.at(0) ?? null;
    const pay: BookPay = chosenPay?.pay ?? "DESK";
    /** What leaves their account at booking: the deposit or the price. */
    const payingNow = chosenPay?.amount ?? price ?? "";
    /** What is left for the visit once the deposit is paid. */
    const rest =
        pay === "DEPOSIT" && service ? restAfterDeposit(service) : null;
    const zero = formatMoney(0, service?.currency ?? "INR") ?? "₹0";

    // "At the desk" for a visit in person, "later" for one held online.
    const later = laterWords(service, page.businessName);
    const dueLabel = unpayable
        ? ""
        : waiting
          ? "Waitlist"
          : pay === "CREDIT"
            ? "Uses 1 credit"
            : pay === "DEPOSIT"
              ? "Deposit now"
              : pay === "NOW"
                ? "To pay now"
                : price
                  ? later.label
                  : "To pay";
    const due = unpayable
        ? ""
        : waiting
          ? zero
          : (chosenPay?.amount ?? price ?? zero);
    // Not signed in yet, the last step is signing in (A9).
    const confirmLabel = !signedIn
        ? "Continue to sign in"
        : waitMode === "join"
          ? "Join the waitlist"
          : waitMode === "waiting"
            ? "Leave the waitlist"
            : pay === "CREDIT"
              ? "Book with 1 credit"
              : pay === "DEPOSIT"
                ? `Pay ${payingNow} deposit and book`
                : pay === "NOW"
                  ? `Pay ${price ?? ""} and book`
                  : price && !unpayable
                    ? later.confirm
                    : "Book";
    const barLabel = !signedIn
        ? "Continue to sign in"
        : waitMode === "join"
          ? "Join waitlist"
          : waitMode === "waiting"
            ? "Leave waitlist"
            : pay === "CREDIT"
              ? "Book with 1 credit"
              : pay === "NOW" || pay === "DEPOSIT"
                ? "Pay and book"
                : "Book";
    const rules = waiting
        ? waitlistTerms()
        : rulesText(page.rules, pay === "NOW" || pay === "DEPOSIT");

    return {
        waiting,
        price,
        gstWords,
        choices,
        unpayable,
        deskOffered,
        chosenPay,
        pay,
        payingNow,
        rest,
        dueLabel,
        due,
        confirmLabel,
        barLabel,
        rules,
    };
}

export type PayWords = ReturnType<typeof payWords>;

/** What still stops the booking, or "" when nothing does. */
export function blockOf({
    hasService,
    unpayable,
    hasStart,
    whoOk,
    phoneOk,
}: {
    hasService: boolean;
    unpayable: string | null;
    hasStart: boolean;
    whoOk: boolean;
    phoneOk: boolean;
}): string {
    if (!hasService) return "Pick what you'd like to book.";
    if (unpayable) return unpayable;
    if (!hasStart) return "Pick a time.";
    if (!whoOk) return NAME_LEFT;
    if (!phoneOk) return PHONE_WRONG;
    return "";
}
