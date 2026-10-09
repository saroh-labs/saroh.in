import { providerName } from "@/lib/payments/providers";

/**
 * Where an order's online payment stands when it isn't simply paid (#122),
 * as the API sends it (`online-payment.ts` there): the Orders list, its
 * quick view and Order Detail say it in words, with the next step — never a
 * colour alone. Pure, so the words are pinned by tests.
 */
export type OnlinePaymentState = "FAILED" | "WAITING" | "NOT_FINISHED";

export interface OnlinePayment {
    state: OnlinePaymentState;
    /** The provider's stored key ("RAZORPAY"). */
    provider: string;
    /** ISO: when it failed, or when the customer started paying. */
    since: string;
}

export interface OnlinePaymentWords {
    /** "Payment failed", "Waiting for Razorpay", "Payment not finished". */
    word: string;
    /** The next step, in a few words: "send a new pay link". */
    next: string;
    /** A sentence for a banner: what happened and what to do. */
    detail: string;
    /** Something to act on (failed, not finished), or only to wait for. */
    tone: "act" | "wait";
}

/**
 * The words for a state. `canSend`: this viewer may send a pay link (the
 * money read, `order:read`); without it, the next step is not to start the
 * order until it's paid, as the kitchen's banner says.
 */
export function onlinePaymentWords(
    payment: Pick<OnlinePayment, "state" | "provider">,
    canSend: boolean,
): OnlinePaymentWords {
    const provider = providerName(payment.provider);
    switch (payment.state) {
        case "FAILED":
            return {
                word: "Payment failed",
                next: canSend ? "send a new pay link" : "not paid yet",
                detail: `${provider} said the payment didn't go through, so nothing was taken. ${
                    canSend
                        ? "Send a new pay link, or take it at the counter."
                        : "Don't start it until it's paid."
                }`,
                tone: "act",
            };
        case "WAITING":
            return {
                word: `Waiting for ${provider}`,
                next: "the customer started paying",
                detail: `The customer started paying. It shows as paid here once ${provider} confirms it — usually within a few minutes. Don't start it until then.`,
                tone: "wait",
            };
        case "NOT_FINISHED":
            return {
                word: "Payment not finished",
                next: canSend ? "send a new pay link" : "not paid yet",
                detail: `The customer opened ${provider}'s payment but didn't finish it, so nothing was taken. ${
                    canSend
                        ? "Send a new pay link, or take it at the counter."
                        : "Don't start it until it's paid."
                }`,
                tone: "act",
            };
    }
}

/** "Payment failed — send a new pay link": the row's one line. */
export function onlinePaymentLine(
    payment: Pick<OnlinePayment, "state" | "provider"> | null | undefined,
    canSend: boolean,
): { text: string; tone: OnlinePaymentWords["tone"] } | null {
    if (!payment) return null;
    const words = onlinePaymentWords(payment, canSend);
    return { text: `${words.word} — ${words.next}`, tone: words.tone };
}
