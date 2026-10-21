import type { PaidStanding, PayPayment } from "@/lib/invoice-paid-shape";
import { chequeWords, payMethodWords } from "@/lib/invoice-paid-shape";
import { payDate, payMoney } from "@/lib/invoice-pay-shape";

/**
 * What has been paid on an invoice, on its pay page (DEC-173, U16 #1128;
 * INVRecordPlus "What Vivek sees" and "The receipt for a cheque"): the
 * newest payment as a receipt, "₹4,000.00 received · Cash · 19 October
 * 2026", or a cheque's own words while it waits for the bank, and the
 * earlier payments under it. A cheque the bank returned says so, and that
 * the amount is due again.
 *
 * Only what the API's read says: nothing when nothing was received. Drawn
 * in the business's `--site-*` tokens, never Saroh's brand, in today's
 * (Classic) look.
 */
export function InvoicePaidSoFar({
    standing,
    currency,
}: {
    standing: PaidStanding;
    currency: string;
}) {
    const money = (a: string) => payMoney(a, currency);
    const { latest, waitingCheque, bouncedCheque, live } = standing;
    if (!latest && !bouncedCheque) return null;
    const headline = waitingCheque ?? latest;
    const others = live.filter((p) => p !== headline);
    return (
        <div className="mt-6 space-y-3" data-paid-so-far="">
            {bouncedCheque ? (
                <div
                    role="status"
                    className="rounded-xl border border-site-border bg-site-surface p-5"
                >
                    <p className="font-semibold text-site-fg">
                        {`${chequeWords(bouncedCheque.cheque ?? { number: null, bank: null })} was returned by the bank${
                            bouncedCheque.cheque?.returnedAfterBanking
                                ? " after it was banked"
                                : ""
                        }`}
                    </p>
                    <p className="mt-1 text-sm text-site-muted">
                        {`The ${money(bouncedCheque.amount)} it paid is due again.`}
                    </p>
                </div>
            ) : null}
            {headline ? (
                <div className="rounded-xl border border-site-border bg-site-surface p-5">
                    {headline.cheque?.status === "WAITING" ? (
                        <ChequeWaiting
                            payment={headline}
                            money={money}
                            settles={Number(standing.leftToPay) === 0}
                        />
                    ) : (
                        <Received payment={headline} money={money} />
                    )}
                    {others.length > 0 ? (
                        <div className="mt-4 border-t border-site-border pt-3">
                            <p className="text-xs font-medium text-site-muted">
                                Also received
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-site-body">
                                {others.map((p, i) => (
                                    <li
                                        key={`${i}-${p.receivedAt}`}
                                        className="flex flex-wrap justify-between gap-x-4"
                                    >
                                        <span>{paymentWords(p)}</span>
                                        <span className="tabular-nums">
                                            {money(p.amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** "₹4,000.00 received", then how and when. */
function Received({
    payment,
    money,
}: {
    payment: PayPayment;
    money: (a: string) => string;
}) {
    return (
        <>
            <p className="text-xl font-bold tabular-nums tracking-tight text-site-fg">
                {`${money(payment.amount)} received`}
            </p>
            <p className="mt-1 text-sm text-site-muted">
                {paymentWords(payment)}
            </p>
        </>
    );
}

/**
 * A cheque not in the bank yet: received, and settled only once it clears
 * (DEC-173). "This invoice is settled" only when it pays all that is left.
 */
function ChequeWaiting({
    payment,
    money,
    settles,
}: {
    payment: PayPayment;
    money: (a: string) => string;
    settles: boolean;
}) {
    return (
        <>
            <p className="text-xl font-bold tabular-nums tracking-tight text-site-fg">
                {`Cheque for ${money(payment.amount)} received`}
            </p>
            <p className="mt-1 text-sm text-site-muted">
                {paymentWords(payment, { bankStatus: false })}
            </p>
            <p className="mt-3 text-sm text-site-body">
                {settles
                    ? "This invoice is settled once the cheque clears. If it's returned by the bank, the amount is due again."
                    : "This payment counts once the cheque clears. If it's returned by the bank, the amount is due again."}
            </p>
        </>
    );
}

/**
 * How and when, in the page's words: "Cash · 19 October 2026", "Cheque
 * 004512 · HDFC Bank · 19 October 2026 · in the bank". A method the page
 * doesn't know is left unsaid; `bankStatus` false leaves a cheque's
 * status to the words around it.
 */
export function paymentWords(
    p: PayPayment,
    { bankStatus = true }: { bankStatus?: boolean } = {},
): string {
    const how = p.cheque ? chequeWords(p.cheque) : payMethodWords(p.method);
    const parts = [how, payDate(p.receivedAt)];
    if (bankStatus && p.cheque?.status === "CLEARED") parts.push("in the bank");
    if (bankStatus && p.cheque?.status === "WAITING") {
        parts.push("not in the bank yet");
    }
    return parts.filter(Boolean).join(" · ");
}
