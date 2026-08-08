/**
 * Render a Prisma Decimal (or its string form) as a fixed 2-decimal money
 * string — purely via string ops, so no float ever touches the value.
 * Prisma's Decimal.toString() drops trailing zeros ("60", "24.5"); money
 * should read "60.00" / "24.50". Inputs are Decimal(_,2), so there are never
 * more than 2 fractional digits to round.
 */
export function toMoneyString(value: { toString(): string }): string {
    const raw = value.toString();
    const negative = raw.startsWith("-");
    const [intPart, fracPart = ""] = (negative ? raw.slice(1) : raw).split(".");
    const frac = (fracPart + "00").slice(0, 2);
    return `${negative ? "-" : ""}${intPart}.${frac}`;
}
