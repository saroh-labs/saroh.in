import type { PaymentMethod } from "@/lib/invoices/service";

/**
 * The ways a business says it was paid outside Saroh (#834), in the order
 * Record as paid and an invoice's Mark paid offer them. The API keeps the
 * choice on the order's invoice and its timeline.
 */
export const PAID_HOW: readonly { value: PaymentMethod; label: string }[] = [
    { value: "CASH", label: "Cash" },
    { value: "UPI", label: "UPI" },
    { value: "BANK_TRANSFER", label: "Bank transfer" },
    { value: "CARD", label: "Card at the counter" },
    { value: "OTHER", label: "Other" },
];

/**
 * The money card's "Paid by" for an order paid by hand: "Cash · recorded
 * by hand". Marked paid before the way was asked, only "Recorded by hand".
 */
export function paidByHandWords(how: PaymentMethod | null | undefined): string {
    const way = PAID_HOW.find((w) => w.value === how)?.label;
    return way ? `${way} · recorded by hand` : "Recorded by hand";
}
