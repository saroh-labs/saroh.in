/**
 * Indian grouping, as the drawn screens show money: 1200 → ₹1,200,
 * 118400 → ₹1,18,400; paise only when there are some, or when asked
 * (`paise`: 1200 → ₹1,200.00).
 */
export function rupee(n: number, paise = false): string {
    const neg = n < 0;
    const [whole = "0", frac = "00"] = Math.abs(n).toFixed(2).split(".");
    let head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    const groups: string[] = [];
    while (head.length > 2) {
        groups.unshift(head.slice(-2));
        head = head.slice(0, -2);
    }
    if (head) groups.unshift(head);
    const s = groups.length ? [...groups, tail].join(",") : tail;
    return `${neg ? "-" : ""}₹${s}${paise || frac !== "00" ? `.${frac}` : ""}`;
}

/** A tax rate as the bill prints it: 2.5 → "2.5%", 9 → "9%". */
export const pct = (x: number) => `${x}%`;
