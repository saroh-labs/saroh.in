import { describe, expect, it } from "vitest";

import { pinClock } from "@/lib/format/test-clock";
import type { GstAsk } from "@/lib/gst/item-words";
import type { GstOnPrice } from "@/lib/gst/on-price";

import type { NotePurchase } from "./pack-card-notes";
import { cardNotes } from "./pack-card-notes";
import { eachWords, owedSummary, packCard } from "./pack-cards";
import { detailHeader } from "./pack-detail";
import type {
    PackDetail,
    PackEventsPage,
    PackHolder,
    PackSale,
} from "./pack-detail-data";
import type { PackServiceOption, PackValues } from "./pack-editor";
import { eachNote, glance, priceToPay } from "./pack-editor-words";
import { holderRow } from "./pack-holders";
import {
    aboutRows,
    coverLines,
    customerPreview,
    overviewTiles,
} from "./pack-overview";
import { priceHistory, saleRow, salesByMonth } from "./pack-sales";
import { packSetPrice, sellLabel, sellTerms } from "./sell-words";

/**
 * One figure, one kind (12 Oct 2026), on Class packs. A 12-class pack at
 * ₹6,000 and 18%, good for a ₹600 class:
 *
 * - GST is added: it is ₹7,080 to pay, ₹590 a class, against ₹708 for a
 *   class alone. The pack's own price says "₹6,000 + GST"; what was taken,
 *   and every comparison, is what was paid.
 * - Prices include GST, and a business that isn't registered: ₹6,000,
 *   ₹500 a class against ₹600, exactly as before.
 */

pinClock();

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-10-12T06:30:00.000Z");
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

const ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 600_000,
    gstCents: 108_000,
    payCents: 708_000,
};
const INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 600_000,
    gstCents: 91_525,
    payCents: 600_000,
};
const WAYS = { added: ADDED, included: INCLUDED, unregistered: null } as const;
type Way = keyof typeof WAYS;
const PLAIN = ["included", "unregistered"] as const;

function pack(way: Way, over: Partial<PackDetail> = {}): PackDetail {
    return {
        id: "pk_1",
        name: "12 classes",
        description: null,
        credits: 12,
        validityDays: 90,
        price: "6000.00",
        currency: "INR",
        status: "ACTIVE",
        services: [{ id: "s1", name: "HIIT" }],
        sold: 3,
        activeHolders: 3,
        createdAt: "2026-08-02T06:30:00.000Z",
        kind: "CLASSES",
        firstPackOnly: false,
        creditsLeft: 30,
        people: 3,
        // Two sold at ₹6,000 before GST was added, one at ₹7,080 after.
        takings: [{ currency: "INR", amount: "19080.00" }],
        hasPendingChanges: false,
        gstRate: way === "unregistered" ? null : "18",
        gst: WAYS[way],
        overview: {
            holders: 3,
            creditsLeft: 30,
            runningOut: 0,
            lostToExpiry: 0,
            sold: 3,
            soldThisMonth: 1,
            takings: [{ currency: "INR", amount: "19080.00" }],
            takingsThisMonth: [{ currency: "INR", amount: "7080.00" }],
        },
        ...over,
    };
}

const holder = (over: Partial<PackHolder> = {}): PackHolder => ({
    purchaseId: "pp_1",
    contact: { id: "c1", name: "Asha Rao" },
    credits: 12,
    used: 2,
    left: 10,
    standing: "ACTIVE",
    expiresAt: inDays(60),
    soldAt: "2026-10-10T06:30:00.000Z",
    price: "7080.00",
    currency: "INR",
    paidBy: "UPI",
    extendedDays: 0,
    extensions: [],
    ...over,
});

const sale = (over: Partial<PackSale> = {}): PackSale => ({
    purchaseId: "pp_1",
    contact: { id: "c1", name: "Asha Rao" },
    soldAt: "2026-10-10T06:30:00.000Z",
    credits: 12,
    price: "7080.00",
    currency: "INR",
    paidBy: "UPI",
    soldBy: null,
    invoiceId: null,
    ...over,
});

describe("a pack's card on the Packs list", () => {
    it("GST is added: the price says + GST, and a class is what it costs to pay", () => {
        const card = packCard(pack("added"), true);
        expect(card.price).toBe("₹6,000 + GST");
        expect(card.each).toBe("₹590 a class with GST");
        // What it took is what was paid, whichever way each was sold.
        expect(card.takings).toBe("₹19,080 taken");
    });

    it("prices include GST, and not registered: the card as before", () => {
        for (const way of PLAIN) {
            const card = packCard(pack(way), true);
            expect(card.price).toBe("₹6,000");
            expect(card.each).toBe("₹500 a class");
        }
    });

    it("a one-to-one pack says a session", () => {
        expect(eachWords(pack("added"), "ONE_TO_ONE")).toBe(
            "₹590 a session with GST",
        );
    });
});

describe("bought at an older price, on a card", () => {
    const bought = (price: string): NotePurchase => ({
        pack: { id: "pk_1" },
        contact: { name: "Asha Rao" },
        left: 10,
        standing: "ACTIVE",
        price,
        currency: "INR",
        expiresAt: inDays(60),
    });
    const notes = (way: Way, prices: string[]) =>
        cardNotes(
            {
                id: "pk_1",
                kind: "CLASSES",
                price: "6000.00",
                currency: "INR",
                gst: WAYS[way],
            },
            prices.map(bought),
            NOW,
            ZONE,
        ).map((n) => n.text);

    it("GST is added: someone who paid ₹7,080 bought at today's price", () => {
        expect(notes("added", ["7080.00"])).toEqual([]);
    });

    it("GST is added: someone who paid ₹6,000 before it was added did too", () => {
        expect(notes("added", ["6000.00"])).toEqual([]);
    });

    it("GST is added: a real older price is still named, as what was paid", () => {
        expect(notes("added", ["7080.00", "5000.00", "5000.00"])).toEqual([
            "2 bought at ₹5,000, and they keep it",
        ]);
    });

    it("prices include GST, and not registered: judged on the price, as before", () => {
        for (const way of PLAIN) {
            expect(notes(way, ["6000.00"])).toEqual([]);
            expect(notes(way, ["5000.00"])).toEqual([
                "1 bought at ₹5,000, and they keep it",
            ]);
        }
    });
});

describe("Pack Detail", () => {
    it("GST is added: the header and Price row say the whole sum", () => {
        const sum = "₹6,000 + ₹1,080 GST (18%) = ₹7,080 to pay";
        expect(detailHeader(pack("added")).meta).toBe(
            `${sum} · ₹590 a class with GST · use within 90 days · HIIT`,
        );
        const [first] = aboutRows(pack("added"), {
            freeCancelHours: undefined,
            timeZone: ZONE,
        });
        expect(first.find((r) => r.k === "Price")?.v).toBe(
            `${sum} · ₹590 a class with GST`,
        );
    });

    it("GST is added: a customer is shown what they pay", () => {
        const preview = customerPreview(pack("added"), NOW, ZONE);
        expect(preview.price).toBe("₹7,080");
        expect(preview.line).toContain("₹590 a class with GST");
    });

    it("what it took is what was paid", () => {
        expect(overviewTiles(pack("added"))[1]).toMatchObject({
            k: "Sold",
            sub: "₹19,080 taken",
        });
    });

    it("a class alone is named at what it costs to pay", () => {
        // The page hands in the service's amount to pay (`payCents`).
        expect(
            coverLines(pack("added"), [
                { id: "s1", priceCents: 70_800, currency: "INR" },
            ]),
        ).toEqual(["HIIT · drop-in ₹708"]);
    });

    it("prices include GST, and not registered: the page as before", () => {
        for (const way of PLAIN) {
            expect(detailHeader(pack(way)).meta).toBe(
                "₹6,000 · ₹500 a class · use within 90 days · HIIT",
            );
            expect(customerPreview(pack(way), NOW, ZONE).price).toBe("₹6,000");
        }
    });
});

describe("who has it, and each sale", () => {
    const row = (way: Way, price: string) =>
        holderRow(holder({ price }), pack(way), NOW, ZONE).bought;
    const older = (way: Way, price: string) =>
        saleRow(sale({ price }), pack(way), { timeZone: ZONE, invoices: false })
            .older;

    it("GST is added: ₹7,080 paid is today's price, not an older one", () => {
        expect(row("added", "7080.00")).toBe("Bought 10 Oct · ₹7,080 · UPI");
        expect(older("added", "7080.00")).toBe(false);
    });

    it("GST is added: ₹6,000 paid before it was added is today's price too", () => {
        expect(row("added", "6000.00")).toBe("Bought 10 Oct · ₹6,000 · UPI");
        expect(older("added", "6000.00")).toBe(false);
    });

    it("GST is added: a real older price is still marked", () => {
        expect(row("added", "5000.00")).toBe(
            "Bought 10 Oct · ₹5,000 (older price) · UPI",
        );
        expect(older("added", "5000.00")).toBe(true);
    });

    it("prices include GST, and not registered: judged on the price, as before", () => {
        for (const way of PLAIN) {
            expect(older(way, "6000.00")).toBe(false);
            expect(older(way, "5000.00")).toBe(true);
            expect(older(way, "7080.00")).toBe(true);
        }
    });
});

describe("sales by month, across the day GST was added", () => {
    it("sums what was actually paid, never what today's choice would make of it", () => {
        const sales = [
            sale({
                purchaseId: "a",
                price: "6000.00",
                soldAt: "2026-10-02T06:30:00.000Z",
            }),
            sale({
                purchaseId: "b",
                price: "6000.00",
                soldAt: "2026-10-05T06:30:00.000Z",
            }),
            sale({
                purchaseId: "c",
                price: "7080.00",
                soldAt: "2026-10-11T06:30:00.000Z",
            }),
        ];
        const { months, note } = salesByMonth(sales, "INR", NOW, ZONE);
        expect(months.at(-1)).toMatchObject({ n: "3 sold", amt: "₹19,080" });
        expect(note).toBe("₹19,080 in the last six months");
    });
});

describe("the price history", () => {
    const events: PackEventsPage = {
        events: [
            {
                id: "e1",
                kind: "CHANGED",
                details: { price: ["5000.00", "6000.00"] },
                holder: null,
                actor: { kind: "TEAM", userId: "u1", name: "Priya" },
                createdAt: "2026-09-03T06:30:00.000Z",
            },
        ],
        nextCursor: null,
        earlierUnrecorded: false,
    };
    const sales = [
        // At ₹5,000, before the change.
        sale({ purchaseId: "a", price: "5000.00" }),
        // At ₹6,000, before GST was added, then with it on top.
        sale({ purchaseId: "b", price: "6000.00" }),
        sale({ purchaseId: "c", price: "7080.00" }),
    ];

    it("GST is added: each price says + GST, and a sale counts under the price it was sold at", () => {
        const history = priceHistory(pack("added"), events, sales, ZONE);
        expect(history.entries).toEqual([
            {
                t: "₹6,000 + GST now",
                sub: "Since 3 Sep · 2 bought at this price",
            },
            {
                t: "₹5,000 + GST",
                sub: "Until 3 Sep · 1 bought at it, and they keep it",
            },
        ]);
        expect(history.about).toBe("₹5,000 + GST until 3 Sep");
    });

    it("prices include GST, and not registered: the history as before", () => {
        for (const way of PLAIN) {
            const history = priceHistory(
                pack(way),
                events,
                sales.slice(0, 2),
                ZONE,
            );
            expect(history.entries).toEqual([
                {
                    t: "₹6,000 now",
                    sub: "Since 3 Sep · 1 bought at this price",
                },
                {
                    t: "₹5,000",
                    sub: "Until 3 Sep · 1 bought at it, and they keep it",
                },
            ]);
        }
    });
});

describe("sold and not yet used", () => {
    it("is each live purchase's share of what was paid for it", () => {
        // 10 of 12 left on ₹7,080 is ₹5,900; 6 of 12 on ₹6,000 is ₹3,000.
        expect(
            owedSummary([
                {
                    contact: { id: "c1" },
                    credits: 12,
                    left: 10,
                    standing: "ACTIVE",
                    price: "7080.00",
                    currency: "INR",
                },
                {
                    contact: { id: "c2" },
                    credits: 12,
                    left: 6,
                    standing: "ACTIVE",
                    price: "6000.00",
                    currency: "INR",
                },
            ]),
        ).toBe(
            "16 classes still owed to 2 people · ₹8,900 sold and not yet used",
        );
    });
});

describe("the Pack Editor", () => {
    const values = (over: Partial<PackValues> = {}): PackValues => ({
        name: "12 classes",
        description: null,
        credits: 12,
        validityDays: 90,
        price: "6000",
        currency: "INR",
        serviceIds: ["hiit"],
        kind: "CLASSES",
        firstPackOnly: false,
        gstRate: "18",
        sacCode: null,
        gstPriceMode: null,
        ...over,
    });
    /** A class alone, at what it costs to pay (the service's `payCents`). */
    const service = (payCents: number): PackServiceOption => ({
        id: "hiit",
        name: "HIIT",
        capacity: 16,
        priceCents: payCents,
        currency: "INR",
        active: true,
    });
    const ADDS: GstAsk = { asked: true, priceMode: "ADDED" };
    const INCLUDES: GstAsk = { asked: true, priceMode: "INCLUDED" };
    const NOT_ASKED: GstAsk = { asked: false, priceMode: null };

    it("GST is added: the sum is under the price, and a class is compared with a class, both to pay", () => {
        expect(priceToPay(values(), ADDS)).toBe(
            "₹6,000 + ₹1,080 GST (18%) = ₹7,080 to pay",
        );
        // ₹7,080 for 12 is ₹590; a ₹600 class with 18% added is ₹708.
        expect(eachNote(values(), [service(70_800)], ADDS)).toBe(
            "₹590 a class with GST · drop-in ₹708",
        );
        expect(glance(values(), [service(70_800)], 3, ADDS)).toEqual([
            ["Per class", "₹590 with GST"],
            // 590 against 708.
            ["Saving vs drop-in", "17%"],
            ["Sold so far", "3"],
        ]);
    });

    it("prices include GST, and not registered: ₹500 a class against ₹600, as before", () => {
        for (const ask of [INCLUDES, NOT_ASKED]) {
            expect(priceToPay(values(), ask)).toBeNull();
            expect(eachNote(values(), [service(60_000)], ask)).toBe(
                "₹500 a class · drop-in ₹600",
            );
            expect(glance(values(), [service(60_000)], 3, ask)).toEqual([
                ["Per class", "₹500"],
                ["Saving vs drop-in", "17%"],
                ["Sold so far", "3"],
            ]);
        }
        // With nothing said of the business, as an older caller passes it.
        expect(eachNote(values(), [service(60_000)])).toBe(
            "₹500 a class · drop-in ₹600",
        );
    });

    it("the pack's own way wins over the business's", () => {
        expect(
            priceToPay(values({ gstPriceMode: "INCLUDED" }), ADDS),
        ).toBeNull();
        expect(priceToPay(values({ gstPriceMode: "ADDED" }), INCLUDES)).toBe(
            "₹6,000 + ₹1,080 GST (18%) = ₹7,080 to pay",
        );
    });
});

describe("the sell dialog", () => {
    const sell = {
        id: "pk_1",
        name: "12 classes",
        credits: 12,
        validityDays: 90,
        price: "6000.00",
        currency: "INR",
        gstRate: "18",
        gstPriceMode: null,
    };
    const ADDS: GstAsk = { asked: true, priceMode: "ADDED" };
    const INCLUDES: GstAsk = { asked: true, priceMode: "INCLUDED" };

    it("GST is added: the pack's price says + GST, and the button takes ₹7,080", () => {
        expect(packSetPrice(sell, ADDS)).toBe("₹6,000 + GST");
        expect(sellTerms(sell, NOW.getTime(), ADDS)).toBe(
            "₹6,000 + GST · 12 classes · use by 10 January 2027",
        );
        expect(sellLabel(sell, "UPI", true, ADDS)).toBe("Take ₹7,080");
    });

    it("prices include GST, and not registered: ₹6,000 everywhere, as before", () => {
        for (const ask of [INCLUDES, null]) {
            expect(packSetPrice(sell, ask)).toBe("₹6,000");
            expect(sellTerms(sell, NOW.getTime(), ask)).toBe(
                "₹6,000 · 12 classes · use by 10 January 2027",
            );
            expect(sellLabel(sell, "UPI", true, ask)).toBe("Take ₹6,000");
        }
    });
});
