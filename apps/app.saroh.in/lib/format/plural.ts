import { formatNumber } from "./money";

/**
 * A number of things, in the thing's own word: `count(3, "booking")` is
 * "3 bookings", `count(1, "booking")` "1 booking", and `count(2, "person",
 * "people")` "2 people". The number is grouped the way every other one is
 * ("1,204 customers").
 *
 * The one place a plural is decided: `scripts/check-formats.mjs` fails an
 * `n === 1 ? "" : "s"` written anywhere else in the app.
 */
export function count(n: number, one: string, many = `${one}s`): string {
    return `${formatNumber(n)} ${plural(n, one, many)}`;
}

/**
 * The word alone, for the rest of a sentence that follows a count:
 * `plural(n, "is", "are")`, `plural(n, "it", "them")`.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
    return n === 1 ? one : many;
}
