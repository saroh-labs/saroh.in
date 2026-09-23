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

/** "1234.50" → 123450, by digits: no float touches the cent. */
export function toMinor(value: { toString(): string }): number {
    const [whole, frac = ""] = toMoneyString(value).split(".");
    const negative = whole.startsWith("-");
    const minor = Math.abs(Number(whole)) * 100 + Number(frac.slice(0, 2));
    return negative ? -minor : minor;
}

/** 123450 → "1234.50". */
export function fromMinor(minor: number): string {
    const sign = minor < 0 ? "-" : "";
    const abs = Math.abs(minor);
    return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
