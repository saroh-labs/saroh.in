import { DISPLAY_LOCALE } from "@/lib/format/locale";

/**
 * A class pack's balance, in words (ADR-007). Pure, so the New booking
 * dialog, booking detail and the purchases list all say the same thing.
 *
 * The balance is never stored: the API derives `used` from the redemptions
 * not given back, and this only reads it. Nothing here adds up money.
 */

export type PackStanding = "ACTIVE" | "USED_UP" | "EXPIRED";

/** What a balance is worked out from — a purchase as the API sends it. */
export interface Balance {
    /** The classes it was sold with. */
    credits: number;
    /** Classes spent and not given back. */
    used: number;
    /** When it stops, ISO. */
    expiresAt: string;
}

export function classesLeft(p: Balance): number {
    return Math.max(0, p.credits - p.used);
}

/** Expired wins over used up: a pack past its date is over whatever is left. */
export function packStanding(p: Balance, now: Date): PackStanding {
    if (new Date(p.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
    return classesLeft(p) === 0 ? "USED_UP" : "ACTIVE";
}

/** "7 left", "1 left", "Used up" or "Expired". */
export function balanceLabel(p: Balance, now: Date): string {
    const standing = packStanding(p, now);
    if (standing === "EXPIRED") return "Expired";
    if (standing === "USED_UP") return "Used up";
    return `${classesLeft(p)} left`;
}

/**
 * Can this pack pay for a session starting at `startAt`? It needs a class
 * left and must still be valid when the session STARTS — not merely today —
 * which is the API's rule too. Whether it covers the service is asked of the
 * API (it lists only packs covering it), so it is not guessed here.
 */
export function usableAt(p: Balance, startAt: string | Date): boolean {
    return (
        classesLeft(p) > 0 &&
        new Date(p.expiresAt).getTime() > new Date(startAt).getTime()
    );
}

/** The packs that can pay for a session, the one expiring soonest first. */
export function usablePacks<T extends Balance>(
    purchases: readonly T[],
    startAt: string | Date,
): T[] {
    return purchases
        .filter((p) => usableAt(p, startAt))
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

/** "12 Oct", in the zone given — the service's own, on a booking. */
export function shortDay(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        day: "numeric",
        month: "short",
    }).format(new Date(iso));
}

/** "Morning pack · 7 left, expires 12 Oct" — a pack offered by name. */
export function packOffer(
    p: Balance & { pack: { name: string } },
    timeZone: string,
): string {
    return `${p.pack.name} · ${classesLeft(p)} left, expires ${shortDay(p.expiresAt, timeZone)}`;
}
