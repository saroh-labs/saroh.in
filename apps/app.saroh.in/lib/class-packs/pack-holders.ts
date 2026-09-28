import type { PackKind } from "./pack-cards";
import { money, unitWord } from "./pack-cards";
import {
    DAY_MS,
    EXTEND_CHOICES,
    MAX_EXTEND_DAYS,
    count,
    day,
    runningOut,
} from "./pack-detail";
import type { PackDetail, PackHolder } from "./pack-detail-data";
import { paidByLabel } from "./sell-words";

/**
 * Pack Detail's Who has it and Extend in words (round-2 E16): each
 * holder's row, when Extend is off and why, the dialog's choices, and the
 * API's refusals in the merchant's words. Pure.
 */

// — Who has it —————————————————————————————————————————————————————————

/** Can still use, and Used up or expired: the API's order within each. */
export function splitHolders(holders: readonly PackHolder[]): {
    live: PackHolder[];
    done: PackHolder[];
} {
    return {
        live: holders.filter((h) => h.standing === "ACTIVE"),
        done: holders.filter((h) => h.standing !== "ACTIVE"),
    };
}

/**
 * Why a holder's pack can't be extended, or null when it can: nothing left
 * (the API's 409), or ended so long ago that even the most days would
 * leave it over.
 */
export function extendBlock(h: PackHolder, now: Date): string | null {
    if (h.left <= 0) return "Nothing left to extend";
    const latest = new Date(h.expiresAt).getTime() + MAX_EXTEND_DAYS * DAY_MS;
    if (latest <= now.getTime()) {
        return `Ran out more than ${MAX_EXTEND_DAYS} days ago`;
    }
    return null;
}

export interface HolderRow {
    purchaseId: string;
    contactId: string;
    name: string;
    href: string;
    /** "3 of 10". */
    left: string;
    /** 0–100, for the bar. */
    pct: number;
    bar: "ok" | "soon" | "ended";
    /** "Use by 12 Oct — 5 days left", "All used", "Ran out 3 Oct with 2 unused". */
    when: string;
    whenTone: "soon" | "lost" | "plain";
    /** "+14 days on 3 Oct: Knee injury"; null when never extended. */
    extNote: string | null;
    /** "Bought 1 Sep · ₹1,500 (older price) · UPI". */
    bought: string;
    /** Why Extend is off for this row; null when it's on. */
    extendBlock: string | null;
}

export function holderRow(
    h: PackHolder,
    pack: Pick<PackDetail, "price" | "currency">,
    now: Date,
    timeZone: string,
): HolderRow {
    const soon = runningOut(h, now);
    const ended = h.standing === "EXPIRED";
    const days = Math.max(
        1,
        Math.ceil((new Date(h.expiresAt).getTime() - now.getTime()) / DAY_MS),
    );
    const when = ended
        ? h.left > 0
            ? `Ran out ${day(h.expiresAt, timeZone)} with ${h.left} unused`
            : `Ended ${day(h.expiresAt, timeZone)}`
        : h.left === 0
          ? "All used"
          : `Use by ${day(h.expiresAt, timeZone)}${soon ? ` — ${count(days, "day", "days")} left` : ""}`;
    const older =
        Number(h.price) !== Number(pack.price) || h.currency !== pack.currency;
    return {
        purchaseId: h.purchaseId,
        contactId: h.contact.id,
        name: h.contact.name,
        href: `/customers/${encodeURIComponent(h.contact.id)}`,
        left: `${h.left} of ${h.credits}`,
        pct: h.credits > 0 ? Math.round((100 * h.left) / h.credits) : 0,
        bar: ended ? "ended" : soon ? "soon" : "ok",
        when,
        whenTone: soon ? "soon" : ended && h.left > 0 ? "lost" : "plain",
        extNote:
            h.extensions.length > 0
                ? h.extensions
                      .map(
                          (e) =>
                              `+${count(e.days, "day", "days")} on ${day(e.createdAt, timeZone)}: ${e.reason}`,
                      )
                      .join(" · ")
                : null,
        bought: [
            `Bought ${day(h.soldAt, timeZone)}`,
            `${money(h.price, h.currency)}${older ? " (older price)" : ""}`,
            h.paidBy ? paidByLabel(h.paidBy) : null,
        ]
            .filter(Boolean)
            .join(" · "),
        extendBlock: extendBlock(h, now),
    };
}

/** When a tab has nobody in it. */
export function whoEmptyText(which: "live" | "done", kind: PackKind): string {
    return which === "live"
        ? `Nobody has ${unitWord(kind, 2)} left on this pack.`
        : "Nothing finished yet.";
}

// — Extend —————————————————————————————————————————————————————————————

/** The new use-by date a choice of days gives. */
export function extendedTo(expiresAt: string, days: number): Date {
    return new Date(new Date(expiresAt).getTime() + days * DAY_MS);
}

/**
 * The dialog's choices, each off when it would still leave the pack over
 * (the API refuses that with a 400).
 */
export function extendChoices(
    expiresAt: string,
    now: Date,
): { days: number; ok: boolean }[] {
    return EXTEND_CHOICES.map((days) => ({
        days,
        ok: extendedTo(expiresAt, days).getTime() > now.getTime(),
    }));
}

/** Two weeks, as the design opens it, or the least that would work. */
export function defaultExtendDays(expiresAt: string, now: Date): number {
    const choices = extendChoices(expiresAt, now).filter((c) => c.ok);
    return (
        choices.find((c) => c.days === 14)?.days ??
        choices.at(0)?.days ??
        MAX_EXTEND_DAYS
    );
}

/** "Asha's pack now runs to 18 Oct." */
export function extendedToast(
    name: string,
    expiresAt: string,
    timeZone: string,
): string {
    const first = name.trim().split(/\s+/)[0] || name;
    return `${first}'s pack now runs to ${day(expiresAt, timeZone)}.`;
}

/**
 * A refused extend in the merchant's words. A 409 is E13's "nothing left
 * to extend"; a 400 already names what to change; the rest say what
 * happened without a code.
 */
export function extendFailure(
    res: { error: string; status: number },
    name: string,
): string {
    const first = name.trim().split(/\s+/)[0] || name;
    if (res.status === 409) {
        return `${first} has nothing left on this pack, so there's nothing to extend.`;
    }
    if (res.status === 404) {
        return `That sale isn't here any more. Refresh to see who has the pack now.`;
    }
    if (res.status === 403) {
        return "Your role can't extend packs. An owner or admin can change that in Team.";
    }
    if (res.status === 400) return res.error;
    return `Couldn't extend ${first}'s pack. Nothing has changed — try again.`;
}
