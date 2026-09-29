import type { PackStanding } from "./balance";
import type { PackKind } from "./pack-cards";
import { money, unitWord } from "./pack-cards";
import { day, RUNNING_OUT_DAYS } from "./pack-detail";

/**
 * The lines under a pack card's figures, after "Saroh Packs" (E15):
 *
 *   Sneha Pillai: 1 class runs out 25 Sep      ← running out, the accent
 *   3 bought at ₹2,000 — they keep it          ← sold at an older price
 *   2 classes ran out unused
 *
 * Worked out from the purchases the Packs page already reads, so they cost
 * no read of their own. Pure.
 */

/** A purchase as the notes read it — the purchases list's shape. */
export interface NotePurchase {
    pack: { id: string };
    contact: { name: string };
    left: number;
    standing: PackStanding;
    price: string;
    currency: string;
    expiresAt: string;
}

export interface CardNote {
    text: string;
    /** Running out is the one note in the accent. */
    tone: "accent" | "quiet";
}

const DAY_MS = 86_400_000;

/** The running-out lines a card names before it counts the rest. */
export const NAMED_RUNNING_OUT = 2;

export function cardNotes(
    pack: { id: string; kind: PackKind; price: string; currency: string },
    purchases: readonly NotePurchase[],
    now: Date,
    timeZone: string,
): CardNote[] {
    const mine = purchases.filter((p) => p.pack.id === pack.id);
    const notes: CardNote[] = [];

    const soon = mine
        .filter((p) => {
            const end = new Date(p.expiresAt).getTime();
            return (
                p.standing === "ACTIVE" &&
                p.left > 0 &&
                end > now.getTime() &&
                end <= now.getTime() + RUNNING_OUT_DAYS * DAY_MS
            );
        })
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    for (const p of soon.slice(0, NAMED_RUNNING_OUT)) {
        notes.push({
            text: `${p.contact.name}: ${p.left} ${unitWord(pack.kind, p.left)} ${p.left === 1 ? "runs" : "run"} out ${day(p.expiresAt, timeZone)}`,
            tone: "accent",
        });
    }
    const more = soon.length - NAMED_RUNNING_OUT;
    if (more > 0) {
        notes.push({
            text: `${more} more ${more === 1 ? "runs" : "run"} out within ${RUNNING_OUT_DAYS} days`,
            tone: "accent",
        });
    }

    // Sold at a price other than today's: each keeps what they paid.
    const current = Number(pack.price);
    const older = new Map<string, { n: number; currency: string }>();
    for (const p of mine) {
        if (p.currency !== pack.currency) continue;
        const paid = Number(p.price);
        if (!Number.isFinite(paid) || paid === current) continue;
        const key = String(paid);
        const at = older.get(key) ?? { n: 0, currency: p.currency };
        at.n += 1;
        older.set(key, at);
    }
    for (const [price, { n, currency }] of Array.from(older.entries())) {
        notes.push({
            text: `${n} bought at ${money(price, currency)} — they keep it`,
            tone: "quiet",
        });
    }

    const lost = mine
        .filter((p) => p.standing === "EXPIRED")
        .reduce((sum, p) => sum + Math.max(0, p.left), 0);
    if (lost > 0) {
        notes.push({
            text: `${lost} ${unitWord(pack.kind, lost)} ran out unused`,
            tone: "quiet",
        });
    }
    return notes;
}
