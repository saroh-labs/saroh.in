import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";

import type { InvoiceStanding } from "./service";

/**
 * "How to pay us" as an unpaid invoice's paper prints it (R32, #833): the
 * UPI ID, the bank transfer on one line, then the note. The API's
 * `howToPayLines` (`invoices/invoice-paper-view.ts` there) draws the same
 * lines on the PDF, so the printed screen and the download agree. Only an
 * unpaid invoice — issued or overdue, never a credit note — asks to be
 * paid; null otherwise, and when nothing is set. Pure.
 */
export function howToPayLines(
    i: { standing: InvoiceStanding; kind?: string },
    pay: PayInstructionsSettings | null | undefined,
): string[] | null {
    const owed = i.standing === "ISSUED" || i.standing === "OVERDUE";
    if (!owed || i.kind === "CREDIT_NOTE" || !pay) return null;
    const lines: string[] = [];
    if (pay.upiId) lines.push(`UPI: ${pay.upiId}`);
    if (pay.bankAccountNumber && pay.bankIfsc && pay.bankAccountName) {
        lines.push(
            [
                `Bank transfer: ${pay.bankAccountName}`,
                `A/c ${pay.bankAccountNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}`,
                `IFSC ${pay.bankIfsc}`,
                pay.bankName,
            ]
                .filter(Boolean)
                .join(" · "),
        );
    }
    if (pay.note?.trim()) lines.push(pay.note.trim());
    return lines.length ? lines : null;
}
