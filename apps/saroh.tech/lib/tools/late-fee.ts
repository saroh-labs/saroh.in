export type FeeType = "flat" | "month" | "year";

/**
 * Simple interest, not compounded. Days charged are days late minus grace
 * days. `rate` is the percentage, or for a flat fee the fee in cents.
 */
export function lateFee(input: {
    type: FeeType;
    amount: number;
    rate: number;
    daysLate: number;
    graceDays: number;
}): { charged: number; fee: number; total: number } {
    const charged = Math.max(0, Math.round(input.daysLate - input.graceDays));
    let fee = 0;
    if (charged > 0) {
        if (input.type === "flat") fee = Math.round(input.rate);
        else {
            const period = input.type === "month" ? 30 : 365;
            fee = Math.round(
                (input.amount * input.rate * charged) / (100 * period),
            );
        }
    }
    return { charged, fee, total: input.amount + fee };
}
