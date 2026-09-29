import { describe, expect, it } from "vitest";

import {
    allergyNotesOf,
    attentionLines,
    cardAttention,
    rowAttention,
} from "@/lib/orders/attention";
import type { OrderAttentionTag } from "@/lib/orders/business-service";
import type { OrderAttention, OrderAttentionEntry } from "@/lib/orders/read";

const SESAME = { id: "al_1", name: "Sesame" };
const SESAME_TOO = { id: "al_2", name: "sesame" };

function tag(over: Partial<OrderAttentionTag> = {}): OrderAttentionTag {
    return {
        id: "a1",
        kind: "ALLERGY",
        label: "Sesame",
        detail: null,
        source: "STAFF",
        ...over,
    };
}

function entry(over: Partial<OrderAttentionEntry> = {}): OrderAttentionEntry {
    return {
        id: "a1",
        kind: "ALLERGY",
        label: "Sesame",
        detail: null,
        sensitive: false,
        allergen: SESAME,
        matchAllergens: [SESAME, SESAME_TOO],
        source: "STAFF",
        ...over,
    };
}

describe("rowAttention — the Orders row's tag (B15)", () => {
    it("says the first entry as the design's tag, and names every one", () => {
        expect(
            rowAttention({
                attention: [
                    tag(),
                    tag({
                        id: "a2",
                        kind: "MEDICAL",
                        label: "Pregnant",
                        detail: "Second trimester",
                        source: "BOOKING_PAGE",
                    }),
                ],
            }),
        ).toEqual({
            state: "shown",
            text: "Allergy: Sesame +1",
            name: "Needs attention: Allergy: Sesame, Medical: Pregnant",
            title: "Sesame. Second trimester · from the booking page",
        });
    });

    it("one entry reads without a count", () => {
        const one = rowAttention({
            attention: [tag({ kind: "ACCESS", label: "Anxious patient" })],
        });
        expect(one).toMatchObject({
            state: "shown",
            text: "Access: Anxious patient",
        });
    });

    it("says Not available when it couldn't be read, never nothing", () => {
        expect(rowAttention({ attention: null })).toEqual({
            state: "unavailable",
            text: "Not available",
            name: "Needs attention couldn't be checked",
        });
    });

    it("draws nothing when there is none, or the API is older", () => {
        expect(rowAttention({ attention: [] })).toEqual({ state: "none" });
        expect(rowAttention({})).toEqual({ state: "none" });
    });
});

describe("attentionLines — the quick view", () => {
    it("bolds the kind and label, then the detail", () => {
        expect(
            attentionLines({
                entries: [entry({ detail: " Use nitrile gloves " })],
                hiddenSensitiveCount: 0,
            }),
        ).toEqual([
            {
                id: "a1",
                head: "Allergy: Sesame.",
                detail: "Use nitrile gloves",
            },
        ]);
    });

    it("has nothing to say without a read", () => {
        expect(attentionLines(null)).toEqual([]);
        expect(attentionLines(undefined)).toEqual([]);
    });
});

describe("cardAttention — Order Detail's customer card", () => {
    it("marks a sensitive entry so the printed ticket leaves it off", () => {
        const card = cardAttention({
            entries: [
                entry(),
                entry({
                    id: "a2",
                    kind: "MEDICAL",
                    label: "Pregnant",
                    sensitive: true,
                    allergen: null,
                    matchAllergens: [],
                }),
            ],
            hiddenSensitiveCount: 0,
        });
        expect(card.entries.map((e) => [e.text, e.sensitive])).toEqual([
            ["Allergy: Sesame", false],
            ["Medical: Pregnant", true],
        ]);
        expect(card.hidden).toBeNull();
    });

    it("says what this viewer can't see", () => {
        const read: OrderAttention = {
            entries: [entry()],
            hiddenSensitiveCount: 1,
        };
        expect(cardAttention(read).hidden).toBe("1 more note you can't see");
        expect(
            cardAttention({ entries: [], hiddenSensitiveCount: 2 }).hidden,
        ).toBe("2 notes you can't see");
    });
});

describe("allergyNotesOf — the allergy check keeps the exact match", () => {
    it("checks by every allergen of the entry's name", () => {
        expect(
            allergyNotesOf({
                entries: [
                    entry({ detail: "Carries an EpiPen" }),
                    // No allergen named: nothing to match the lines on.
                    entry({ id: "a2", allergen: null, matchAllergens: [] }),
                    entry({
                        id: "a3",
                        kind: "MEDICAL",
                        label: "Pregnant",
                    }),
                ],
                hiddenSensitiveCount: 0,
            }),
        ).toEqual([
            {
                body: "Allergy: Sesame. Carries an EpiPen",
                allergens: [SESAME, SESAME_TOO],
            },
        ]);
    });

    it("falls back to the entry's own allergen", () => {
        expect(
            allergyNotesOf({
                entries: [entry({ matchAllergens: [] })],
                hiddenSensitiveCount: 0,
            })?.[0]?.allergens,
        ).toEqual([SESAME]);
    });

    it("null when it couldn't be read; undefined from an older API", () => {
        expect(allergyNotesOf(null)).toBeNull();
        expect(allergyNotesOf(undefined)).toBeUndefined();
    });
});
