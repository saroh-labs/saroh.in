/**
 * The Money card of a booking's page (U12; BKMBookingDetail's Money,
 * BKDBooking's): its lines, and the sentences under them. The API works
 * every amount out; this only says it. Pure, so the page and its tests
 * agree.
 */
import type { BookingMoney } from "@/lib/services/booking-money";
import {
    deadlineText,
    paidLine,
    refundLine,
    refundPolicyLine,
} from "@/lib/services/booking-money";
import { methodWord } from "@/lib/services/desk-pay";

/** One line of the Money card. */
export interface MoneyRow {
    key: string;
    /** The desk's word: "Price", "Paid", "Still to take". */
    label: string;
    text: string;
    /** Said as what matters now. */
    strong?: boolean;
    /** A refund that didn't go through. */
    bad?: boolean;
}

/**
 * The Money card's lines (BKMBookingDetail's Money, BKDBooking's): the
 * price, what was paid online and at the desk, what is still to take or
 * that nothing is, and any refund. Amounts are the API's.
 */
export function moneyRows(
    m: BookingMoney,
    format: (cents: number) => string,
    cancelled: boolean,
): MoneyRow[] {
    const rows: MoneyRow[] = [];
    if (m.priceCents !== null && m.priceCents > 0) {
        rows.push({ key: "price", label: "Price", text: format(m.priceCents) });
    }
    if (m.paidOnlineCents > 0) {
        rows.push({
            key: "online",
            label: m.deposit ? "Deposit" : "Paid",
            text: `${format(m.paidOnlineCents)} paid online`,
        });
    }
    const desk = m.paidAtDeskCents ?? 0;
    if (desk > 0) {
        rows.push({
            key: "desk",
            label: "At the desk",
            text: `${format(desk)} paid at the desk${methodWord(m.deskMethod) ? ` · ${methodWord(m.deskMethod)}` : ""}`,
        });
    }
    if (m.refund) {
        const r = m.refund;
        const amount = format(r.amountCents);
        rows.push({
            key: "refund",
            label: "Refund",
            text:
                r.status === "SUCCEEDED"
                    ? `${amount} refunded`
                    : r.status === "FAILED"
                      ? `${amount} didn't go through`
                      : `${amount} on its way`,
            bad: r.status === "FAILED",
        });
    }
    if (!cancelled) {
        const left = m.take?.cents ?? m.dueCents;
        if (left !== null && left > 0) {
            rows.push({
                key: "left",
                label: "Still to take",
                text: `${format(left)} to take at the visit`,
                strong: true,
            });
        } else if (
            m.priceCents !== null &&
            m.priceCents > 0 &&
            (m.paidOnlineCents > 0 || desk > 0)
        ) {
            rows.push({
                key: "left",
                label: "Still to take",
                text: "Nothing, it's paid",
                strong: true,
            });
        }
    }
    return rows;
}

/** A sentence under Money's lines; `bad` for a refund that failed. */
export interface MoneyNote {
    text: string;
    bad?: boolean;
}

/**
 * The sentences under Money's lines: a refund still on its way or that
 * failed, in full; while it can still be cancelled, the free-cancel time
 * and the business's refund policy (E30, DEC-058); and the old paid line
 * when the rows have nothing to say.
 */
export function moneyNotes(
    m: BookingMoney,
    f: {
        format: (cents: number) => string;
        cancelled: boolean;
        ended: boolean;
        freeCancelUntil: string | null | undefined;
        timezone: string;
    },
): MoneyNote[] {
    const notes: MoneyNote[] = [];
    if (moneyRows(m, f.format, f.cancelled).length === 0) {
        const paid = paidLine(m);
        if (paid) notes.push({ text: paid });
    }
    const refund = refundLine(m);
    if (refund && m.refund?.status !== "SUCCEEDED") {
        notes.push({ text: refund, bad: m.refund?.status === "FAILED" });
    }
    if (!f.cancelled && !f.ended) {
        const deadline = f.freeCancelUntil
            ? `Free to cancel until ${deadlineText(f.freeCancelUntil, f.timezone)}.`
            : null;
        const policy = refundPolicyLine(m, !!f.freeCancelUntil);
        const text = [deadline, policy].filter(Boolean).join(" ");
        if (text) notes.push({ text });
    }
    return notes;
}
