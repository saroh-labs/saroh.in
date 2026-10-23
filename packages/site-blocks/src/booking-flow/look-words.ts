import { timeWords } from "../lib/clock";
import { gstOnPriceOf } from "../lib/gst-price";
import type { BookingService, BookPay } from "./model";
import { dateIn, dateText, visitsOf } from "./model";
import type { ChooseStep } from "./traverse";

/**
 * The words a look's booking frames say (DEC-172, U10), the same in Folio,
 * Quiet and Live (WV2Voice): each step's question, what its one filled
 * button does, the count of steps, the free-cancel deadline and the hold.
 * Pure, so each rule is tested without the flow.
 */

/**
 * How long a pay-now booking holds its time while it is paid (the API's
 * `HOLD_MINUTES`, `bookings/booking-hold.ts`). The page never starts the
 * clock itself: the hold's own `holdExpiresAt` says when it ends.
 */
export const HOLD_MINUTES = 15;

/** A step the look draws while choosing. */
export type LookStep = ChooseStep;

/** Each step's question, its heading. */
export function stepTitle(
    step: LookStep,
    service: BookingService | null,
): string {
    switch (step) {
        case "what":
            return "What would you like to book?";
        case "who":
            return "Who would you like?";
        case "when":
            return visitsOf(service) > 1
                ? "When suits you for your first visit?"
                : "When suits you?";
        case "details":
            return "Your details";
        case "pay":
            return "How would you like to pay?";
    }
}

/** The short name of a step, for Live's "Step 2 of 5 · Who". */
export const STEP_NAME: Record<LookStep, string> = {
    what: "What",
    who: "Who",
    when: "When",
    details: "Your details",
    pay: "Pay",
};

/**
 * The steps this customer will see, in order: Who only with a choice of
 * person, Pay only where there is a way to pay to choose. The count is
 * honest (VD08a): it starts at the step they arrived on, so a link with a
 * time chosen says "Step 1 of 2".
 */
export function lookSteps({
    asksWho,
    asksPay,
}: {
    asksWho: boolean;
    asksPay: boolean;
}): LookStep[] {
    return [
        "what",
        ...(asksWho ? (["who"] as const) : []),
        "when",
        "details",
        ...(asksPay ? (["pay"] as const) : []),
    ];
}

/** "Step 2 of 4": where `step` sits, counted from `from`. */
export function stepCount(
    steps: LookStep[],
    step: LookStep,
    from: LookStep,
): { at: number; of: number } {
    const i = Math.max(0, steps.indexOf(step));
    const f = steps.indexOf(from);
    const start = f < 0 ? 0 : Math.min(f, i);
    return { at: i - start + 1, of: steps.length - start };
}

/** "Step 2 of 4", or "Last step" when only one is left to see. */
export function stepCountText(count: { at: number; of: number }): string {
    return count.of === 1 ? "Last step" : `Step ${count.at} of ${count.of}`;
}

/**
 * What the last button says: what happens, and how much. "Pay ₹2,500 and
 * book" for paying now, the deposit's amount for a deposit, and "Confirm
 * booking" where nothing is paid now.
 */
export function finalLabel({
    pay,
    payingNow,
    waitMode,
}: {
    pay: BookPay;
    /** What leaves their account at booking: the price or the deposit. */
    payingNow: string;
    waitMode: "join" | "waiting" | "held" | null;
}): string {
    if (waitMode === "join") return "Join the waitlist";
    if (waitMode === "waiting") return "Leave the waitlist";
    if ((pay === "NOW" || pay === "DEPOSIT") && payingNow) {
        return `Pay ${payingNow} and book`;
    }
    return "Confirm booking";
}

/** The button that goes on from a step, by the step after it. */
export function nextLabel(next: LookStep): string {
    switch (next) {
        case "who":
            return "Next: pick who";
        case "when":
            return "Next: pick a time";
        case "details":
            return "Next: your details";
        case "pay":
            return "Next: pay";
        default:
            return "Next";
    }
}

/**
 * The free-cancel deadline: the start less the business's window
 * (`BookingRules.freeCancelHours`), or null when the business has none.
 */
export function cancelDeadline(
    startAt: string,
    freeCancelHours: number | null,
): Date | null {
    if (freeCancelHours === null || !Number.isFinite(freeCancelHours)) {
        return null;
    }
    const start = Date.parse(startAt);
    if (Number.isNaN(start)) return null;
    return new Date(start - freeCancelHours * 3_600_000);
}

/** "Thu 22 Oct, 2 am" in the business's zone. */
export function momentText(at: Date | string, zone: string): string {
    const iso = typeof at === "string" ? at : at.toISOString();
    return `${dateText(dateIn(iso, zone), true)}, ${timeWords(iso, zone)}`;
}

/**
 * "Move or cancel free until Thu 22 Oct, 2 am." — from the business's own
 * rule, never a promise it doesn't make. Null with no rule, or once the
 * deadline has passed (`now`).
 */
export function cancelText(
    startAt: string,
    freeCancelHours: number | null,
    zone: string,
    now: number,
): string | null {
    const until = cancelDeadline(startAt, freeCancelHours);
    if (!until || until.getTime() <= now) return null;
    return `Move or cancel free until ${momentText(until, zone)}.`;
}

/**
 * The GST in the price, in whole words until the receipt (VA08e): "Includes
 * GST at 18%. The receipt shows the exact amount." No paise on the page.
 * Null where the API says none.
 */
export function lookGstText(service: BookingService | null): string | null {
    const gst = gstOnPriceOf(service?.gst);
    if (!gst) return null;
    return `Includes GST at ${gst.rate}%. The receipt shows the exact amount.`;
}

/**
 * Said before paying now (VD08e): the time is held for 15 minutes from the
 * moment they press Pay. Only where a way to pay now is on offer.
 */
export function holdBeforeText(time: string): string {
    return `Paying now? We hold ${time} for you for ${HOLD_MINUTES} minutes from when you press Pay.`;
}
