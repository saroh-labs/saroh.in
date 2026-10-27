/**
 * The sign-in ways' rules with nothing to read (DEC-196), apart from
 * `SignInWaysService` so a DTO can name them without loading the service.
 */
/** A code that couldn't go, or a way that is off: the customer can't fix it. */
export const UNAVAILABLE_MESSAGE =
    "We couldn't send your code. Try again in a few minutes";

export const SIGN_IN_WAYS = ["EMAIL", "WHATSAPP", "SMS"] as const;
export type SignInWay = (typeof SIGN_IN_WAYS)[number];

/** A business that never chose: what it had before the choice existed. */
export const UNCHOSEN_WAYS: readonly SignInWay[] = ["EMAIL", "WHATSAPP"];

/** Why a way can't be used now, for the settings screen (U9). */
export type WayBlocked =
    "NOT_APPROVED" | "SWITCHED_OFF" | "NO_BALANCE" | "NOT_YET";

/** The chosen ways that work now, in order; email when none is left. */
export function effectiveWays(
    chosen: readonly SignInWay[],
    usable: ReadonlySet<SignInWay>,
): SignInWay[] {
    const left = chosen.filter((way) => usable.has(way));
    return left.length > 0 ? left : ["EMAIL"];
}
