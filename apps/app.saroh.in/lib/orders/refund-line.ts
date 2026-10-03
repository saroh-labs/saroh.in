import type { OrderRead, OrderReadMoney } from "./read";

/**
 * The refund lines under Order Detail's total (B9, DEC-067). A cancel — a
 * refund in full — is done once the provider accepts the refund, but the
 * money isn't back until its webhook confirms it: until then the line says
 * "Refund on its way", never "Refunded". One whose answer was lost is the
 * card's "not confirmed yet" notice instead, and one the provider fails
 * drops out of `refunded` and becomes a Needs you row on Home.
 *
 * Pure: the money card draws what this says.
 */
export interface RefundLines {
    /** "Refunded in full" or "Refunded ₹120"; null when nothing has landed. */
    done: string | null;
    /** "Refund on its way · ₹480"; null when none is. */
    onTheWay: string | null;
}

export function refundLines(
    money: Pick<
        OrderReadMoney,
        "refunded" | "refundsBeingConfirmed" | "refundsOnTheWay"
    >,
    standing: OrderRead["refundStanding"],
    format: (amount: number) => string,
): RefundLines {
    const cents = (v: string) => Math.round(Number(v) * 100);
    const sum = (list: { amount: string }[] | undefined) =>
        (list ?? []).reduce((n, r) => n + cents(r.amount), 0);
    const onTheWay = sum(money.refundsOnTheWay);
    const unsure = sum(money.refundsBeingConfirmed);
    const landed = Math.max(0, cents(money.refunded) - onTheWay - unsure);
    return {
        done:
            landed <= 0
                ? null
                : standing === "REFUNDED" && onTheWay === 0 && unsure === 0
                  ? "Refunded in full"
                  : `Refunded ${format(landed / 100)}`,
        onTheWay:
            onTheWay > 0
                ? `Refund on its way · ${format(onTheWay / 100)}`
                : null,
    };
}
