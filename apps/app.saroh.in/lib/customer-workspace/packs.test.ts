import { describe, expect, it } from "vitest";

import type { CustomerDetail, DetailPack } from "./detail";
import {
    heldPacks,
    packHref,
    packsEmptyText,
    packTabRow,
    packTabRows,
    pageMissing,
} from "./packs";

/**
 * Customer Detail's class packs in words (round-2 C7): each purchase as
 * Pack Detail's Who has it says it, seen from the person, with the classes
 * spent from it; the order; and the failure said in its own card only.
 */

const IST = "Asia/Kolkata";
const NOW = new Date("2026-09-28T10:00:00Z");

const pack = (over: Partial<DetailPack> = {}): DetailPack => ({
    id: "pp1",
    pack: { id: "pack_1", name: "10 classes", kind: "CLASSES" },
    credits: 10,
    used: 3,
    left: 7,
    expiresAt: "2026-10-12T00:00:00Z",
    boughtAt: "2026-09-01T06:00:00Z",
    standing: "ACTIVE",
    price: "3000.00",
    currency: "INR",
    paidBy: "UPI",
    extensions: [],
    uses: [],
    ...over,
});

describe("a pack on the Packs tab", () => {
    it("says a pack of 10 with 3 used: 7 left, its use-by, how it was bought, and opens Pack Detail", () => {
        const row = packTabRow(
            pack({ expiresAt: "2026-10-20T00:00:00Z" }),
            IST,
            NOW,
        );
        expect(row).toEqual(
            expect.objectContaining({
                purchaseId: "pp1",
                name: "10 classes pack",
                href: "/class-packs/pack_1",
                left: "7 of 10",
                pct: 70,
                bar: "ok",
                when: "Use by 20 Oct",
                whenTone: "plain",
                extNote: null,
                extendBlock: null,
                expiresAt: "2026-10-20T00:00:00Z",
                unitsWord: "classes",
            }),
        );
        expect(row.bought).toBe("Bought 1 Sep · ₹3,000 · UPI");
        expect(row.bought).not.toContain("older price");
    });

    it("warns when it runs out within two weeks, and names the days given", () => {
        const row = packTabRow(
            pack({
                expiresAt: "2026-10-03T00:00:00Z",
                extensions: [
                    {
                        days: 14,
                        reason: "Knee injury",
                        createdAt: "2026-09-20T06:00:00Z",
                    },
                ],
            }),
            IST,
            NOW,
        );
        expect(row.bar).toBe("soon");
        expect(row.whenTone).toBe("soon");
        expect(row.when).toBe("Use by 3 Oct — 5 days left");
        expect(row.extNote).toBe("+14 days on 20 Sep: Knee injury");
    });

    it("says an ended pack's lost classes, and why it can't be extended", () => {
        const lapsed = packTabRow(
            pack({
                standing: "EXPIRED",
                expiresAt: "2026-09-20T00:00:00Z",
                left: 2,
            }),
            IST,
            NOW,
        );
        expect(lapsed.when).toBe("Ran out 20 Sep with 2 unused");
        expect(lapsed.whenTone).toBe("lost");
        expect(lapsed.bar).toBe("ended");
        // Within 30 days of its end, E16 still lets it be extended.
        expect(lapsed.extendBlock).toBeNull();

        const used = packTabRow(
            pack({ standing: "USED_UP", left: 0, used: 10 }),
            IST,
            NOW,
        );
        expect(used.when).toBe("All used");
        expect(used.extendBlock).toBe("Nothing left to extend");

        const long = packTabRow(
            pack({
                standing: "EXPIRED",
                expiresAt: "2026-07-01T00:00:00Z",
            }),
            IST,
            NOW,
        );
        expect(long.extendBlock).toBe("Ran out more than 30 days ago");
    });

    it("lists the classes spent from it, each opening its booking, in E17's words", () => {
        const row = packTabRow(
            pack({
                uses: [
                    {
                        bookingId: "bk_2",
                        startAt: "2026-09-30T01:30:00Z",
                        service: { id: "s1", name: "Vinyasa" },
                        state: "BOOKED",
                    },
                    {
                        bookingId: "bk_1",
                        startAt: "2026-09-22T01:30:00Z",
                        service: { id: "s1", name: "Vinyasa" },
                        state: "CREDIT_BACK",
                    },
                ],
            }),
            IST,
            NOW,
        );
        expect(
            row.uses.map(({ key, href, what, state }) => ({
                key,
                href,
                what,
                state,
            })),
        ).toEqual([
            {
                key: "bk_2",
                href: "/bookings/bk_2",
                what: "Vinyasa",
                state: { label: "Booked", tone: "accent" },
            },
            {
                key: "bk_1",
                href: "/bookings/bk_1",
                what: "Vinyasa",
                state: { label: "Credit back", tone: "off" },
            },
        ]);
        expect(row.uses[0].when).toMatch(/30 Sep 07:00$/);
        expect(row.uses[1].when).toMatch(/22 Sep 07:00$/);
    });

    it("says sessions for a one-to-one pack", () => {
        const row = packTabRow(
            pack({ pack: { id: "pt", name: "PT 5", kind: "ONE_TO_ONE" } }),
            IST,
            NOW,
        );
        expect(row.unitsWord).toBe("sessions");
    });

    it("reads an answer from before C7: no uses, no days given, no payment", () => {
        const old: DetailPack = {
            id: "pp1",
            pack: { id: "pack_1", name: "10 classes" },
            credits: 10,
            used: 3,
            left: 7,
            expiresAt: "2026-10-12T00:00:00Z",
            boughtAt: "2026-09-01T06:00:00Z",
            standing: "ACTIVE",
            price: "3000.00",
            currency: "INR",
        };
        const row = packTabRow(old, IST, NOW);
        expect(row.uses).toEqual([]);
        expect(row.extNote).toBeNull();
        expect(row.unitsWord).toBe("classes");
        expect(row.bought).toBe("Bought 1 Sep · ₹3,000");
        // Without a price the rest is still said, never "₹0".
        const free = packTabRow(
            { ...old, price: undefined, currency: undefined },
            IST,
            NOW,
        );
        expect(free.bought).toBe("Bought 1 Sep");
    });

    it("puts live packs first, soonest to end, then ended ones, latest ended first", () => {
        const lists = packTabRows(
            [
                pack({ id: "later", expiresAt: "2026-11-01T00:00:00Z" }),
                pack({
                    id: "old",
                    standing: "EXPIRED",
                    expiresAt: "2026-08-01T00:00:00Z",
                }),
                pack({ id: "sooner", expiresAt: "2026-10-05T00:00:00Z" }),
                pack({
                    id: "recent",
                    standing: "USED_UP",
                    left: 0,
                    expiresAt: "2026-10-20T00:00:00Z",
                }),
            ],
            IST,
            NOW,
        );
        expect(lists.live.map((r) => r.purchaseId)).toEqual([
            "sooner",
            "later",
        ]);
        expect(lists.done.map((r) => r.purchaseId)).toEqual(["recent", "old"]);
    });
});

describe("around the packs", () => {
    it("links a pack to its Pack Detail", () => {
        expect(packHref("pack 1")).toBe("/class-packs/pack%201");
    });

    it("offers a sale in the empty text only to whoever may sell", () => {
        expect(packsEmptyText("Asha", true)).toBe(
            "Asha has no class pack. Sell them one and their classes come off it as they book.",
        );
        expect(packsEmptyText("Asha", false)).toBe("Asha has no class pack.");
    });

    it("hands the sell dialog what they hold, for first-pack-only", () => {
        const d = {
            contact: { id: "c1" },
            packs: {
                from: "contact",
                rows: [
                    pack(),
                    pack({
                        id: "pp2",
                        pack: { id: "pack_2", name: "5 classes" },
                        expiresAt: "2026-09-01T00:00:00Z",
                        standing: "EXPIRED",
                    }),
                ],
            },
        } as unknown as Pick<CustomerDetail, "contact" | "packs">;
        expect(heldPacks(d, NOW)).toEqual([
            { contactId: "c1", packId: "pack_1", left: 7, standing: "ACTIVE" },
            {
                contactId: "c1",
                packId: "pack_2",
                left: 7,
                standing: "EXPIRED",
            },
        ]);
        expect(heldPacks({ ...d, packs: null }, NOW)).toEqual([]);
    });

    it("names a failed packs read in its own card, not again at the top", () => {
        expect(
            pageMissing({
                unavailable: [
                    { source: "packs", label: "Class packs" },
                    { source: "invoices", label: "Invoices" },
                ],
            }),
        ).toEqual(["Invoices"]);
    });
});
