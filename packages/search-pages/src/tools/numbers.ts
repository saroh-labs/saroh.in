import { rupee } from "../money";

/**
 * Money and percentages as the tool boards print them, for the tools that
 * work in paise (integer: no float touches a rupee). A minus is "−", as
 * the boards draw it.
 */

/** Typed rupees (already read as a number) → whole paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Paise → "₹1,000.00" (`exact`) or "₹1,000" when there are no paise. */
export function money(paise: number, exact = false): string {
    return rupee(paise / 100, exact).replace(/^-/, "−");
}

/** 40 → "40%", 66.666 → "66.7%", -1.69 → "−1.7%". */
export function percent(x: number): string {
    const r = Math.round(x * 10) / 10;
    return `${r < 0 ? "−" : ""}${Math.abs(r)}%`;
}
