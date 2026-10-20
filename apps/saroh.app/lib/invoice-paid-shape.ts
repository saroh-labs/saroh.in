/**
 * What has been paid on an invoice, as its pay page says it (DEC-173, U16
 * #1128): the payments the API's allow-list sends, checked field by field,
 * and the few facts the page draws from them. Kept apart from
 * `invoice-pay.ts`, which reads the app's env, so it can be tested without
 * one: the checkout-shape pattern.
 *
 * The page says only what it knows: partly paid, paid, a cheque not in the
 * bank yet, or a cheque the bank returned. An older API sends none of
 * these, and the page reads as before.
 */

export type PayBankStatus = "WAITING" | "CLEARED" | "BOUNCED";

/** One payment received on the invoice, as the pay read sends it. */
export interface PayPayment {
    /** A money string, "4000.00". */
    amount: string;
    /** CASH | UPI | BANK_TRANSFER | CARD | OTHER | CHEQUE | ONLINE. */
    method: string;
    receivedAt: string;
    cheque: {
        number: string | null;
        bank: string | null;
        status: PayBankStatus;
    } | null;
}

const BANK_STATUSES: readonly string[] = ["WAITING", "CLEARED", "BOUNCED"];
const MONEY = /^\d+(\.\d{1,2})?$/;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";

/** A money string from the API, checked; anything strange is none. */
export function payAmountOf(v: unknown): string | undefined {
    return isString(v) && MONEY.test(v) ? v : undefined;
}

/** A short text from the API (a cheque's number or bank); else none. */
function shortTextOf(v: unknown): string | null {
    return isString(v) && v.trim() !== "" && v.length <= 80 ? v.trim() : null;
}

/**
 * The payments from the API, checked one by one: a row that isn't one is
 * left out, never guessed at. Absent or not a list: none.
 */
export function payPaymentsOf(v: unknown): PayPayment[] {
    if (!Array.isArray(v)) return [];
    const out: PayPayment[] = [];
    for (const row of v) {
        if (!isRecord(row)) continue;
        const amount = payAmountOf(row.amount);
        if (!amount || !isString(row.method)) continue;
        if (!isString(row.receivedAt)) continue;
        if (Number.isNaN(Date.parse(row.receivedAt))) continue;
        const c = row.cheque;
        const cheque =
            isRecord(c) &&
            isString(c.status) &&
            BANK_STATUSES.includes(c.status)
                ? {
                      number: shortTextOf(c.number),
                      bank: shortTextOf(c.bank),
                      status: c.status as PayBankStatus,
                  }
                : null;
        // A cheque without its status can't be said truthfully.
        if (row.method === "CHEQUE" && !cheque) continue;
        out.push({
            amount,
            method: row.method,
            receivedAt: row.receivedAt,
            cheque: row.method === "CHEQUE" ? cheque : null,
        });
    }
    return out;
}

const METHOD_WORDS: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    BANK_TRANSFER: "Bank transfer",
    CARD: "Card",
    CHEQUE: "Cheque",
    ONLINE: "Paid online",
};

/** "Cash", "Paid online"; null for OTHER or a method the page doesn't know. */
export function payMethodWords(method: string): string | null {
    return METHOD_WORDS[method] ?? null;
}

/** "Cheque 004512 · HDFC Bank", with whichever of the two is known. */
export function chequeWords(cheque: {
    number: string | null;
    bank: string | null;
}): string {
    return [cheque.number ? `Cheque ${cheque.number}` : "Cheque", cheque.bank]
        .filter(Boolean)
        .join(" · ");
}

/** What the page draws from the payments, in one place. */
export interface PaidStanding {
    /** Paid so far and what is left, as money strings. */
    paidSoFar: string;
    leftToPay: string;
    /** Something is paid and something is left: "Partly paid". */
    partPaid: boolean;
    /** The newest payment that counts (not a returned cheque). */
    latest: PayPayment | null;
    /** A cheque received and not in the bank yet: the newest. */
    waitingCheque: PayPayment | null;
    /**
     * A cheque the bank returned with nothing paid after it: why the
     * amount is due again. Null once a later payment came in, or once
     * nothing is owed.
     */
    bouncedCheque: PayPayment | null;
    /** Every payment that counts, oldest first, for the list of them. */
    live: PayPayment[];
}

export function paidStanding(invoice: {
    status: string;
    total: string;
    paidSoFar?: string;
    leftToPay?: string;
    payments?: PayPayment[];
}): PaidStanding {
    const payments = invoice.payments ?? [];
    const owed = invoice.status === "ISSUED" || invoice.status === "OVERDUE";
    // An older API: nothing said paid, and an owed invoice owes its total.
    const paidSoFar = invoice.paidSoFar ?? "0.00";
    const leftToPay = invoice.leftToPay ?? (owed ? invoice.total : "0.00");
    const live = payments.filter((p) => p.cheque?.status !== "BOUNCED");
    const latest = live.at(-1) ?? null;
    const waitingCheque =
        [...live].reverse().find((p) => p.cheque?.status === "WAITING") ?? null;
    const lastBounced =
        [...payments].reverse().find((p) => p.cheque?.status === "BOUNCED") ??
        null;
    const bouncedLast =
        lastBounced !== null &&
        (latest === null ||
            payments.indexOf(lastBounced) > payments.indexOf(latest));
    const bouncedCheque = owed && bouncedLast ? lastBounced : null;
    return {
        paidSoFar,
        leftToPay,
        partPaid: owed && Number(paidSoFar) > 0 && Number(leftToPay) > 0,
        latest,
        waitingCheque,
        bouncedCheque,
        live,
    };
}
