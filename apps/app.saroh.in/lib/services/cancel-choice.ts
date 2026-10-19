/**
 * The cancel sheet's money question (U3, BA-01, Q14), pure so the sheet,
 * every screen that cancels and their tests agree. The API decides what a
 * cancel does with money (`booking-cancel.ts`); this only says it before
 * it is done, and picks the choice the business's own policy makes:
 *
 * - Cancelled in time with a policy that refunds: Refund is picked, and
 *   the money goes back automatically whoever cancels (no role gate, Q14).
 * - Late, or a policy that doesn't refund: Keep is picked. Someone who may
 *   refund payments (`payment:manage`) can still pick Refund, which the
 *   API makes as the business cancelling (`returnCredit`).
 * - Nothing paid online: a plain "Cancel booking? · Keep booking".
 * - A visit of a treatment: its money is on its order (E9).
 */

import { formatMoney } from "@/lib/format/money";
import type { BookingMoney } from "@/lib/services/booking-money";
import {
    deadlineText,
    refundable,
    TREATMENT_REFUNDED_FROM_ORDER,
} from "@/lib/services/booking-money";

/** Refund what was paid, or keep it. */
export type MoneyChoice = "refund" | "keep";

/** One of the two choices, as its card says it. */
export interface MoneyOption {
    /** "Refund ₹400", "Keep the deposit". */
    label: string;
    /** The line under it. */
    note: string;
    /** Off, with `note` saying why. */
    disabled: boolean;
}

export type CancelChoice =
    /** Nothing paid online: nothing to ask about money. */
    | { kind: "plain"; body: string }
    /** A visit of a treatment: refunded from its order, never here. */
    | { kind: "visit"; body: string; treatmentOrderId: string }
    | {
          kind: "money";
          /** The policy in one sentence, said first. */
          policy: string;
          /** Over the two choices: "The ₹400 deposit". */
          heading: string;
          /** "deposit" or "payment". */
          what: "deposit" | "payment";
          /** "₹400". */
          amount: string;
          late: boolean;
          /** What the policy picks. */
          preset: MoneyChoice;
          refund: MoneyOption;
          keep: MoneyOption;
      };

export function cancelChoice(input: {
    money: BookingMoney | undefined;
    freeCancelUntil: string | null | undefined;
    timezone: string;
    now: number;
    /** `payment:manage`: may refund what the policy keeps. */
    canRefund: boolean;
    /** The customer's first name, for "how Kabir paid". */
    first: string;
}): CancelChoice {
    const m = input.money;
    const first = input.first || "they";
    if (m?.treatmentOrderId) {
        return {
            kind: "visit",
            treatmentOrderId: m.treatmentOrderId,
            body: `The visit is cancelled and its time freed. ${TREATMENT_REFUNDED_FROM_ORDER}`,
        };
    }
    if (!m || m.paidOnlineCents <= 0 || m.refund || refundable(m) <= 0) {
        return {
            kind: "plain",
            body: `${first === "they" ? "They're" : `${first} is`} told, and the time opens up for someone else.`,
        };
    }
    const amount = formatMoney(refundable(m), m.currency);
    const what = m.deposit ? "deposit" : "payment";
    const it = m.deposit ? "the deposit" : "the payment";
    const late =
        !!input.freeCancelUntil &&
        input.now > new Date(input.freeCancelUntil).getTime();
    const refunds = !late && m.refundInTimeCancels !== false;
    const stillRefund = input.canRefund ? " You can still refund it." : "";
    const policy = refunds
        ? input.freeCancelUntil
            ? `It's before the free-cancel time (${deadlineText(input.freeCancelUntil, input.timezone)}), so your policy refunds ${it}.`
            : `Your policy refunds ${it} when a booking is cancelled.`
        : late
          ? `It's past the free-cancel time (${deadlineText(input.freeCancelUntil ?? "", input.timezone)}), so your policy keeps ${it}.${stillRefund}`
          : `Your policy doesn't refund cancellations, so it keeps ${it}.${stillRefund}`;
    const how = `It goes back to how ${first === "they" ? "they" : first} paid, in 5 to 7 days.`;
    return {
        kind: "money",
        policy,
        heading: m.deposit ? `The ${amount} deposit` : `The ${amount} paid`,
        what,
        amount,
        late,
        preset: refunds ? "refund" : "keep",
        refund: {
            label: `Refund ${amount}`,
            // In time the policy refunds it for anyone (Q14). Otherwise
            // only someone who may refund can hand it back.
            disabled: !refunds && !input.canRefund,
            note:
                refunds || input.canRefund
                    ? how
                    : "Only someone who can refund payments can give it back.",
        },
        keep: {
            label: m.deposit ? "Keep the deposit" : "Keep the payment",
            // A cancel in time is refunded by the API whenever the policy
            // says so: keeping it is not a choice it offers.
            disabled: refunds,
            note: refunds
                ? "Your policy refunds a cancel made in time."
                : late
                  ? "What your policy says for a late cancel."
                  : "What your policy says.",
        },
    };
}

/** The sheet's button for a choice. */
export function cancelLabel(choice: CancelChoice, pick: MoneyChoice): string {
    if (choice.kind === "visit") return "Cancel visit";
    if (choice.kind === "plain") return "Cancel booking";
    return pick === "refund"
        ? `Cancel and refund ${choice.amount}`
        : `Cancel, keep the ${choice.what}`;
}

/**
 * What the API is sent: `returnCredit` only when the policy keeps the
 * money and Refund was picked by someone who may.
 */
export function cancelOptions(
    choice: CancelChoice,
    pick: MoneyChoice,
): { returnCredit?: boolean } {
    if (choice.kind !== "money") return {};
    return pick === "refund" &&
        choice.preset === "keep" &&
        !choice.refund.disabled
        ? { returnCredit: true }
        : {};
}
