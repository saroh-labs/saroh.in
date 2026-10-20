import { prisma } from "@saroh/database";

import { fromMinor } from "../../common/money";
import type { BankStatus } from "../invoices/invoice-state";
import {
    BANK_STATUSES,
    CHEQUE_PAYMENT_METHOD,
} from "../invoices/invoice-state";

/**
 * The payments the customer's pay page shows (DEC-173, U16 #1128): what has
 * been received on the invoice, so "₹4,000 received · Cash · 19 Oct" and
 * "Cheque for ₹8,400 received · Cheque 004512 · HDFC Bank" are the page's
 * own facts, never a guess.
 *
 * An allow-list like the rest of the pay read: the amount, how it was paid,
 * the day it was received, and for a cheque its number, bank and where it
 * is (waiting, in the bank, or returned). Never the reference, the note,
 * who recorded it, a bounce or remove reason, or any id. A payment removed
 * by mistake is gone from the page; a bounced cheque stays, so the page can
 * say why the amount is due again.
 */
export interface PayLinkPayment {
    /** A money string, "4000.00", from the ledger's integer paise. */
    amount: string;
    /** CASH | UPI | BANK_TRANSFER | CARD | OTHER | CHEQUE | ONLINE. */
    method: string;
    receivedAt: string;
    /** Only on a cheque; null on anything else. */
    cheque: {
        number: string | null;
        bank: string | null;
        status: BankStatus;
        /**
         * A bounced cheque that had been marked as in the bank first (#7):
         * the page says it was returned after it was banked.
         */
        returnedAfterBanking: boolean;
    } | null;
}

/** The newest this many; the page never needs a longer history. */
export const PAY_LINK_PAYMENTS_MAX = 20;

/**
 * The invoice's payments for its pay page, oldest first. The caller found
 * the invoice by its token and runs this in the business's RLS context.
 */
export async function payLinkPayments(
    organizationId: string,
    invoiceId: string,
): Promise<PayLinkPayment[]> {
    const rows = await prisma.invoicePayment.findMany({
        where: { organizationId, invoiceId, removedAt: null },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: PAY_LINK_PAYMENTS_MAX,
        select: {
            amountCents: true,
            method: true,
            receivedAt: true,
            chequeNumber: true,
            chequeBank: true,
            bankStatus: true,
            clearedAt: true,
        },
    });
    return rows.reverse().map((r) => ({
        amount: fromMinor(r.amountCents),
        method: r.method,
        receivedAt: r.receivedAt.toISOString(),
        cheque:
            r.method === CHEQUE_PAYMENT_METHOD
                ? {
                      number: r.chequeNumber,
                      bank: r.chequeBank,
                      status: bankStatusOf(r.bankStatus),
                      returnedAfterBanking:
                          r.bankStatus === "BOUNCED" && r.clearedAt !== null,
                  }
                : null,
    }));
}

/** A cheque's status as stored; a row with none reads as still waiting. */
function bankStatusOf(v: string | null): BankStatus {
    return (BANK_STATUSES as readonly string[]).includes(v ?? "")
        ? (v as BankStatus)
        : "WAITING";
}
