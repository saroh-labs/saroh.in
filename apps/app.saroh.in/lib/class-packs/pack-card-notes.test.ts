import { describe, expect, it } from "vitest";

import type { NotePurchase } from "./pack-card-notes";
import { cardNotes } from "./pack-card-notes";

const NOW = new Date("2026-09-18T06:30:00.000Z");
const ZONE = "Asia/Kolkata";
const inDays = (n: number) =>
    new Date(NOW.getTime() + n * 86_400_000).toISOString();

const PACK = {
    id: "pk_5",
    kind: "CLASSES" as const,
    price: "2200",
    currency: "INR",
};

function bought(over: Partial<NotePurchase> = {}): NotePurchase {
    return {
        pack: { id: "pk_5" },
        contact: { name: "Farah Khan" },
        left: 3,
        standing: "ACTIVE",
        price: "2200",
        currency: "INR",
        expiresAt: inDays(48),
        ...over,
    };
}

describe("a pack card's notes (E15, after Saroh Packs)", () => {
    it("names who runs out soonest, then who bought at an older price, then what ran out unused", () => {
        const notes = cardNotes(
            PACK,
            [
                bought(),
                bought({
                    contact: { name: "Sneha Pillai" },
                    left: 1,
                    price: "2000",
                    expiresAt: inDays(7),
                }),
                bought({
                    contact: { name: "Rohit Menon" },
                    left: 2,
                    price: "2000",
                    expiresAt: inDays(4),
                }),
                bought({
                    contact: { name: "Kiran Das" },
                    left: 2,
                    price: "2000",
                    standing: "EXPIRED",
                    expiresAt: inDays(-40),
                }),
                // Another pack's sale says nothing here.
                bought({ pack: { id: "pk_10" }, standing: "EXPIRED" }),
            ],
            NOW,
            ZONE,
        );
        expect(notes).toEqual([
            { text: "Rohit Menon: 2 classes run out 22 Sep", tone: "accent" },
            { text: "Sneha Pillai: 1 class runs out 25 Sep", tone: "accent" },
            { text: "3 bought at ₹2,000 — they keep it", tone: "quiet" },
            { text: "2 classes ran out unused", tone: "quiet" },
        ]);
    });

    it("names two running out and counts the rest", () => {
        const soon = [3, 5, 9, 12].map((d, i) =>
            bought({ contact: { name: `P${i}` }, expiresAt: inDays(d) }),
        );
        const notes = cardNotes(PACK, soon, NOW, ZONE).map((n) => n.text);
        expect(notes).toEqual([
            "P0: 3 classes run out 21 Sep",
            "P1: 3 classes run out 23 Sep",
            "2 more run out within 14 days",
        ]);
    });

    it("says sessions for a one-to-one pack, and nothing for a used-up one", () => {
        const notes = cardNotes(
            { ...PACK, kind: "ONE_TO_ONE" },
            [
                bought({ left: 1, expiresAt: inDays(2) }),
                bought({ left: 0, standing: "USED_UP", expiresAt: inDays(3) }),
            ],
            NOW,
            ZONE,
        );
        expect(notes.map((n) => n.text)).toEqual([
            "Farah Khan: 1 session runs out 20 Sep",
        ]);
    });

    it("says nothing for a pack nobody has bought", () => {
        expect(cardNotes(PACK, [], NOW, ZONE)).toEqual([]);
    });
});
