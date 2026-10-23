/**
 * The shape of a read of a business's unpaid bills, shared by Insights'
 * owed by age (`owed-by-age.ts`, which reads them) and Home's This week
 * (`home/home-week.ts`, which folds the same read, review #16). A leaf, so
 * neither imports the other.
 */

/** One unpaid bill, as `readUnpaidBills` reads it. */
export interface OwedBill {
    currency: string;
    /** Always ISSUED here; `isPastDue` reads it. */
    status: string;
    dueAt: Date | null;
    total: { toString(): string };
    paidCents: number;
}

export interface UnpaidBills {
    bills: OwedBill[];
    /** Billed anyone outside an order, ever: else there is no "₹0 owed". */
    ever: boolean;
}

/** A read of the unpaid bills that is made once, however often it is asked. */
export type UnpaidBillsRead = () => Promise<UnpaidBills>;
