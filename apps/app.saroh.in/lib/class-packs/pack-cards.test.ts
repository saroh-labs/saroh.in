import { describe, expect, it } from "vitest";

import type { OwedPurchase, PackListItem } from "./pack-cards";
import {
    detailHref,
    orderForList,
    owedSummary,
    packCard,
    packHref,
    rulesNote,
} from "./pack-cards";

function pack(over: Partial<PackListItem> = {}): PackListItem {
    return {
        id: "pk_1",
        name: "10 classes",
        description: null,
        credits: 10,
        validityDays: 60,
        price: "1500.00",
        currency: "INR",
        status: "ACTIVE",
        services: [
            { id: "s1", name: "HIIT" },
            { id: "s2", name: "Yoga" },
        ],
        sold: 48,
        activeHolders: 32,
        createdAt: "2026-09-01T00:00:00.000Z",
        kind: "CLASSES",
        firstPackOnly: false,
        creditsLeft: 124,
        people: 31,
        takings: [{ currency: "INR", amount: "72000.00" }],
        hasPendingChanges: false,
        ...over,
    };
}

const labels = (p: PackListItem) =>
    packCard(p, true).badges.map((b) => b.label);

describe("packCard", () => {
    it("says a live pack's price, per-class price, terms and counts", () => {
        const card = packCard(pack(), true);
        expect(card).toMatchObject({
            price: "₹1,500",
            each: "₹150 a class",
            terms: "10 classes · use within 60 days · HIIT, Yoga",
            sold: "48",
            takings: "₹72,000 taken",
            stillToUse: "124",
            stillToUseNote: "across 31 people",
            why: null,
            showSell: true,
            sellDisabled: false,
            canArchive: true,
            badges: [],
        });
    });

    it("names the kind, first pack only and unpublished changes", () => {
        expect(
            labels(
                pack({
                    kind: "ONE_TO_ONE",
                    firstPackOnly: true,
                    hasPendingChanges: true,
                }),
            ),
        ).toEqual(["One-to-one", "First pack only", "Changes not published"]);
        const pt = packCard(pack({ kind: "ONE_TO_ONE", credits: 5 }), true);
        expect(pt.terms).toMatch(/^5 sessions · /);
        expect(pt.each).toBe("₹300 a session");
    });

    it("a draft has no Sell, can't be archived, opens the editor and says why", () => {
        const card = packCard(pack({ status: "DRAFT", sold: 0 }), true);
        expect(card.badges.map((b) => b.label)).toEqual(["Draft"]);
        expect(card.showSell).toBe(false);
        expect(card.canArchive).toBe(false);
        expect(card.href).toBe("/class-packs/pk_1/edit");
        expect(card.openHref).toBeNull();
        expect(card.why).toMatch(/^Draft — not on sale until you publish/);
    });

    it("a draft never says it has unpublished changes", () => {
        expect(
            labels(pack({ status: "DRAFT", hasPendingChanges: true })),
        ).toEqual(["Draft"]);
    });

    it("a draft not priced yet says so", () => {
        const card = packCard(pack({ status: "DRAFT", price: "0.00" }), true);
        expect(card.price).toBe("No price yet");
        expect(card.each).toBeNull();
    });

    it("an archived pack keeps Sell, off, with why beside it", () => {
        const card = packCard(pack({ status: "ARCHIVED" }), true);
        expect(card.badges.map((b) => b.label)).toEqual(["Archived"]);
        expect(card).toMatchObject({ showSell: true, sellDisabled: true });
        expect(card.why).toMatch(/Sell again puts it back on sale/);
    });

    it("a pack nobody has bought says so", () => {
        const card = packCard(
            pack({
                sold: 0,
                activeHolders: 0,
                people: 0,
                creditsLeft: 0,
                takings: [],
            }),
            true,
        );
        expect(card.takings).toBe("None yet");
        expect(card.stillToUseNote).toBe("Nobody has any left");
    });

    it("an older API without the new counts says less, not something wrong", () => {
        const older = pack();
        delete older.takings;
        delete older.people;
        delete older.creditsLeft;
        const card = packCard(older, true);
        expect(card.takings).toBeNull();
        expect(card.stillToUse).toBe("—");
        expect(card.stillToUseNote).toBe("across 32 people");
    });

    it("a published pack opens its own page, for anyone who can see the list (E16)", () => {
        expect(packCard(pack(), true).href).toBe("/class-packs/pk_1");
        expect(packCard(pack(), false).href).toBe("/class-packs/pk_1");
        expect(packCard(pack(), false).openHref).toBe("/class-packs/pk_1");
        const archived = packCard(pack({ status: "ARCHIVED" }), true);
        expect(archived.href).toBe("/class-packs/pk_1");
        expect(archived.openHref).toBe("/class-packs/pk_1");
    });

    it("a draft leads nowhere for someone who can't change packs", () => {
        const draft = pack({ status: "DRAFT", sold: 0 });
        expect(packHref(draft, false)).toBeNull();
        expect(packCard(draft, false).href).toBeNull();
        expect(packCard(draft, false).openHref).toBeNull();
    });

    it("names a tab in Pack Detail's address, and leaves Overview out", () => {
        expect(detailHref("pk 1", "who")).toBe("/class-packs/pk%201?tab=who");
        expect(detailHref("pk_1", "overview")).toBe("/class-packs/pk_1");
    });
});

describe("orderForList", () => {
    it("puts packs on sale first, then drafts, then archived, keeping order", () => {
        const list = [
            pack({ id: "a", status: "ARCHIVED" }),
            pack({ id: "b", status: "ACTIVE" }),
            pack({ id: "c", status: "DRAFT" }),
            pack({ id: "d", status: "ACTIVE" }),
        ];
        expect(orderForList(list).map((p) => p.id)).toEqual([
            "b",
            "d",
            "c",
            "a",
        ]);
    });
});

describe("owedSummary", () => {
    const live = (
        contact: string,
        left: number,
        over: Partial<OwedPurchase> = {},
    ): OwedPurchase => ({
        contact: { id: contact },
        credits: 10,
        left,
        standing: "ACTIVE",
        price: "1500.00",
        currency: "INR",
        ...over,
    });

    it("counts classes and people still owed, and what they were sold for", () => {
        expect(
            owedSummary([
                live("asha", 4),
                live("asha", 2),
                live("ravi", 6),
                live("old", 5, { standing: "EXPIRED" }),
                live("done", 0, { standing: "USED_UP" }),
            ]),
        ).toBe(
            "12 classes still owed to 2 people · ₹1,800 sold and not yet used",
        );
    });

    it("says nothing is owed when nothing is", () => {
        expect(owedSummary([])).toBe("No classes owed right now");
    });

    it("says one class to one person in the singular", () => {
        expect(owedSummary([live("asha", 1)])).toBe(
            "1 class still owed to 1 person · ₹150 sold and not yet used",
        );
    });
});

describe("rulesNote", () => {
    it("names the free-cancel window", () => {
        expect(rulesNote(12)).toContain(
            "Cancel 12 hours or more before and the class comes back; later, it's used.",
        );
    });

    it("with no window, every cancel gives it back", () => {
        expect(rulesNote(null)).toContain(
            "Cancel before it starts and the class comes back.",
        );
    });

    it("leaves the cancel sentence out when the rule couldn't be read", () => {
        expect(rulesNote(undefined)).not.toContain("Cancel");
        expect(rulesNote(undefined)).toContain(
            "Unused classes end with the pack.",
        );
    });
});
