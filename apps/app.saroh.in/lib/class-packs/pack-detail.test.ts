import { describe, expect, it } from "vitest";

import {
    BUILT_TABS,
    archiveToast,
    detailHeader,
    tabFromQuery,
    tabMeta,
} from "./pack-detail";
import type { PackDetail, PackHolder } from "./pack-detail-data";
import {
    defaultExtendDays,
    extendBlock,
    extendChoices,
    extendFailure,
    extendedToast,
    holderRow,
    splitHolders,
} from "./pack-holders";
import {
    aboutRows,
    customerPreview,
    linkedCards,
    overviewTiles,
} from "./pack-overview";

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-10-01T06:30:00.000Z");
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

function pack(over: Partial<PackDetail> = {}): PackDetail {
    return {
        id: "pk_1",
        name: "Ten classes",
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
        sold: 4,
        activeHolders: 3,
        createdAt: "2026-08-02T06:30:00.000Z",
        kind: "CLASSES",
        firstPackOnly: false,
        creditsLeft: 17,
        people: 3,
        takings: [{ currency: "INR", amount: "6000.00" }],
        hasPendingChanges: false,
        overview: {
            holders: 3,
            creditsLeft: 17,
            runningOut: 1,
            lostToExpiry: 2,
            sold: 4,
            soldThisMonth: 1,
            takings: [{ currency: "INR", amount: "6000.00" }],
            takingsThisMonth: [{ currency: "INR", amount: "1500.00" }],
        },
        ...over,
    };
}

function holder(over: Partial<PackHolder> = {}): PackHolder {
    return {
        purchaseId: "pp_1",
        contact: { id: "c_1", name: "Asha Rao" },
        credits: 10,
        used: 4,
        left: 6,
        standing: "ACTIVE",
        expiresAt: inDays(40),
        soldAt: "2026-09-01T06:30:00.000Z",
        price: "1500.00",
        currency: "INR",
        paidBy: "UPI",
        extendedDays: 0,
        extensions: [],
        ...over,
    };
}

describe("tabs", () => {
    it("draws all five tabs; an unknown tab opens Overview", () => {
        expect(BUILT_TABS).toEqual([
            "overview",
            "who",
            "used",
            "sales",
            "activity",
        ]);
        expect(tabFromQuery("who")).toBe("who");
        expect(tabFromQuery("sales")).toBe("sales");
        expect(tabFromQuery("activity")).toBe("activity");
        expect(tabFromQuery("nope")).toBe("overview");
        expect(tabFromQuery(undefined)).toBe("overview");
    });

    it("Used this week and Activity count their own reads; a failure shows none", () => {
        const o = pack().overview;
        expect(tabMeta("used", o, { used: 4, activity: null })).toEqual({
            text: "4",
            tone: "off",
        });
        expect(tabMeta("used", o, { used: 0, activity: null })).toBeNull();
        expect(tabMeta("used", o)).toBeNull();
        expect(
            tabMeta("activity", o, {
                used: null,
                activity: { n: 100, more: true },
            }),
        ).toEqual({ text: "100+", tone: "off" });
        expect(
            tabMeta("activity", o, {
                used: null,
                activity: { n: 3, more: false },
            }),
        ).toEqual({ text: "3", tone: "off" });
        expect(tabMeta("activity", o)).toBeNull();
    });

    it("Who has it counts holders, or says who is running out", () => {
        const p = pack();
        expect(tabMeta("who", p.overview)).toEqual({
            text: "1 running out",
            tone: "accent",
        });
        expect(tabMeta("who", { ...p.overview, runningOut: 0 })).toEqual({
            text: "3",
            tone: "off",
        });
        expect(
            tabMeta("who", { ...p.overview, runningOut: 0, holders: 0 }),
        ).toBeNull();
        expect(tabMeta("overview", p.overview)).toBeNull();
    });
});

describe("detailHeader", () => {
    it("a pack on sale: its terms, pills and no band", () => {
        const head = detailHeader(pack({ firstPackOnly: true }));
        expect(head).toMatchObject({
            thumbN: "10",
            thumbUnit: "classes",
            status: { label: "On sale", tone: "ok" },
            kindLabel: "Classes",
            firstOnly: true,
            meta: "₹1,500 · ₹150 a class · use within 60 days · HIIT, Yoga",
            onSale: true,
            note: null,
            bookingPage: "On the booking page",
            editHref: "/class-packs/pk_1/edit",
        });
    });

    it("a one-to-one pack says sessions", () => {
        const head = detailHeader(pack({ kind: "ONE_TO_ONE", credits: 5 }));
        expect(head.thumbUnit).toBe("sessions");
        expect(head.kindLabel).toBe("One-to-one");
        expect(head.meta).toMatch(/₹300 a session/);
    });

    it("a draft says it can't be sold, and why", () => {
        const head = detailHeader(pack({ status: "DRAFT" }));
        expect(head.status).toEqual({ label: "Draft", tone: "off" });
        expect(head.onSale).toBe(false);
        expect(head.note?.head).toBe("Draft.");
        expect(head.bookingPage).toBe("Not on the booking page");
    });

    it("an archived pack says who keeps theirs, and has no Edit", () => {
        const head = detailHeader(pack({ status: "ARCHIVED" }));
        expect(head.note?.body).toBe(
            "Nobody new can buy it. 3 people keep their classes until their dates.",
        );
        expect(head.editHref).toBeNull();
        expect(archiveToast(pack(), false)).toBe(
            "Ten classes is on sale again.",
        );
    });

    it("unpublished changes show only on a live pack", () => {
        expect(detailHeader(pack({ hasPendingChanges: true })).pending).toBe(
            true,
        );
        expect(
            detailHeader(pack({ status: "DRAFT", hasPendingChanges: true }))
                .pending,
        ).toBe(false);
    });
});

describe("overview", () => {
    it("tiles: can be sold now, sold with takings, still to use, running out (the design's four)", () => {
        expect(overviewTiles(pack())).toEqual([
            {
                k: "Can be sold now",
                v: "Yes",
                sub: "At the desk and on the booking page",
            },
            { k: "Sold", v: "4", sub: "₹6,000 taken" },
            { k: "Still to use", v: "17", sub: "across 3 people" },
            { k: "Running out", v: "1", sub: "within 14 days" },
        ]);
        expect(overviewTiles(pack({ status: "ARCHIVED" }))[0]).toEqual({
            k: "Can be sold now",
            v: "No",
            sub: "Archived",
        });
        expect(overviewTiles(pack({ status: "DRAFT" }))[0].sub).toBe("Draft");
    });

    it("tiles for a pack nobody has bought", () => {
        const p = pack({
            overview: {
                holders: 0,
                creditsLeft: 0,
                runningOut: 0,
                lostToExpiry: 0,
                sold: 0,
                soldThisMonth: 0,
                takings: [],
                takingsThisMonth: [],
            },
        });
        expect(overviewTiles(p).map((t) => t.sub)).toEqual([
            "At the desk and on the booking page",
            "None yet",
            "Nobody has any left",
            "Nobody close",
        ]);
    });

    it("linked cards: drop-in prices, who runs out, receipts, booking page", () => {
        const cards = linkedCards(pack({ firstPackOnly: true }), {
            dropIns: [{ id: "s1", priceCents: 50_000, currency: "INR" }],
            holders: [
                holder({
                    contact: { id: "c2", name: "Ravi" },
                    left: 2,
                    expiresAt: inDays(5),
                }),
                holder(),
            ],
            receipts: [
                {
                    invoiceId: null,
                    contact: { name: "Old" },
                    createdAt: "2026-08-01T00:00:00.000Z",
                },
                {
                    invoiceId: "inv_2",
                    contact: { name: "Ravi" },
                    createdAt: "2026-09-20T06:30:00.000Z",
                },
            ],
            now: NOW,
            timeZone: ZONE,
        });
        expect(cards.map((c) => c.key)).toEqual([
            "covers",
            "who",
            "receipts",
            "booking",
        ]);
        expect(cards[0].lines.map((l) => l.text)).toEqual([
            "HIIT · drop-in ₹500",
            "Yoga",
        ]);
        expect(cards[1]).toMatchObject({
            v: "3 people · 17 classes to go",
            open: { tab: "who" },
        });
        expect(cards[1].lines.map((l) => l.text)).toEqual([
            "Ravi: 2 run out 6 Oct",
            "2 classes ran out unused",
        ]);
        // Open goes to the Invoices list narrowed to this pack (D18).
        expect(cards[2]).toMatchObject({
            v: "1 receipt",
            open: { href: "/billing/invoices?pack=pk_1" },
        });
        expect(cards[2].lines[0]).toEqual({
            text: "Ravi · 20 Sep",
            href: "/billing/invoices/inv_2",
        });
        expect(cards[3]).toMatchObject({
            v: "Offered when booking a class",
            lines: [{ text: "Only to people who haven't bought one" }],
            open: { lens: "customer" },
        });
    });

    it("no Receipts card for someone who can't open invoices", () => {
        const cards = linkedCards(pack({ status: "ARCHIVED" }), {
            dropIns: null,
            holders: null,
            receipts: null,
            now: NOW,
            timeZone: ZONE,
        });
        expect(cards.map((c) => c.key)).toEqual(["covers", "who", "booking"]);
        expect(cards[3 - 1]).toMatchObject({
            v: "Hidden",
            lines: [{ text: "Archived" }],
        });
    });

    it("everything about it, with the cancel rule when it was read", () => {
        const [first, second] = aboutRows(pack(), {
            freeCancelHours: 12,
            timeZone: ZONE,
        });
        expect(first.map((r) => r.v)).toEqual([
            "Classes only — never one-to-one sessions",
            "10 classes",
            "₹1,500 · ₹150 a class",
            "60 days from the sale",
            "HIIT, Yoga",
        ]);
        expect(second.at(-1)).toEqual({
            k: "Cancelling",
            v: "A class cancelled 12 hours before or earlier gives the credit back",
        });
        const unread = aboutRows(pack(), {
            freeCancelHours: undefined,
            timeZone: ZONE,
        });
        expect(unread[1].some((r) => r.k === "Cancelling")).toBe(false);
        // Price history sits after Created, only when it was read (E17).
        expect(unread[1].some((r) => r.k === "Price history")).toBe(false);
        const priced = aboutRows(pack(), {
            freeCancelHours: undefined,
            timeZone: ZONE,
            priceHistory: "₹1,200 until 20 Aug",
        });
        expect(priced[1].map((r) => r.k)).toEqual([
            "Who can buy it",
            "Created",
            "Price history",
            "Unused credits",
        ]);
    });

    it("the customer view names the pack's terms and today's use-by", () => {
        expect(customerPreview(pack(), NOW, ZONE)).toEqual({
            note: "How it shows to a customer booking a class who has no classes left.",
            line: "10 classes · ₹150 a class · use by 30 Nov",
            price: "₹1,500",
        });
    });
});

describe("Who has it", () => {
    it("splits live from finished, keeping the API's order", () => {
        const list = [
            holder({ purchaseId: "a" }),
            holder({ purchaseId: "b", standing: "USED_UP", left: 0 }),
            holder({ purchaseId: "c", standing: "EXPIRED" }),
        ];
        const { live, done } = splitHolders(list);
        expect(live.map((h) => h.purchaseId)).toEqual(["a"]);
        expect(done.map((h) => h.purchaseId)).toEqual(["b", "c"]);
    });

    it("a live holder: what's left, the use-by, extensions and the sale", () => {
        const row = holderRow(
            holder({
                price: "1200.00",
                extensions: [
                    {
                        id: "e1",
                        days: 14,
                        reason: "Knee injury",
                        expiresBefore: inDays(26),
                        expiresAfter: inDays(40),
                        by: { userId: "u1", name: "Priya" },
                        createdAt: "2026-09-25T06:30:00.000Z",
                    },
                ],
            }),
            pack(),
            NOW,
            ZONE,
        );
        expect(row).toMatchObject({
            name: "Asha Rao",
            href: "/contacts/c_1",
            left: "6 of 10",
            pct: 60,
            bar: "ok",
            when: "Use by 10 Nov",
            whenTone: "plain",
            extNote: "+14 days on 25 Sep: Knee injury",
            bought: "Bought 1 Sep · ₹1,200 (older price) · UPI",
            extendBlock: null,
        });
    });

    it("running out is said with the days left", () => {
        const row = holderRow(
            holder({ expiresAt: inDays(5) }),
            pack(),
            NOW,
            ZONE,
        );
        expect(row.bar).toBe("soon");
        expect(row.when).toBe("Use by 6 Oct — 5 days left");
        expect(row.whenTone).toBe("soon");
    });

    it("ran out with some unused; used up; an unrecorded method is left out", () => {
        const lost = holderRow(
            holder({
                standing: "EXPIRED",
                left: 3,
                expiresAt: inDays(-3),
                paidBy: null,
            }),
            pack(),
            NOW,
            ZONE,
        );
        expect(lost.when).toBe("Ran out 28 Sep with 3 unused");
        expect(lost.whenTone).toBe("lost");
        expect(lost.bar).toBe("ended");
        expect(lost.bought).toBe("Bought 1 Sep · ₹1,500");
        const used = holderRow(
            holder({ standing: "USED_UP", left: 0, used: 10 }),
            pack(),
            NOW,
            ZONE,
        );
        expect(used.when).toBe("All used");
        expect(used.extendBlock).toBe("Nothing left to extend");
    });

    it("Extend is off for a pack that ended more than 30 days ago", () => {
        expect(
            extendBlock(
                holder({ standing: "EXPIRED", expiresAt: inDays(-31) }),
                NOW,
            ),
        ).toBe("Ran out more than 30 days ago");
        expect(
            extendBlock(
                holder({ standing: "EXPIRED", expiresAt: inDays(-10) }),
                NOW,
            ),
        ).toBeNull();
    });
});

describe("Extend", () => {
    it("offers 7 to 30 days, each off when it would still leave the pack over", () => {
        expect(extendChoices(inDays(10), NOW).every((c) => c.ok)).toBe(true);
        expect(extendChoices(inDays(-10), NOW)).toEqual([
            { days: 7, ok: false },
            { days: 14, ok: true },
            { days: 21, ok: true },
            { days: 30, ok: true },
        ]);
        expect(defaultExtendDays(inDays(10), NOW)).toBe(14);
        expect(defaultExtendDays(inDays(-20), NOW)).toBe(21);
    });

    it("says the new date, and the API's refusals in plain words", () => {
        expect(extendedToast("Asha Rao", inDays(47), ZONE)).toBe(
            "Asha's pack now runs to 17 Nov.",
        );
        expect(
            extendFailure(
                { error: "Nothing left to extend", status: 409 },
                "Asha Rao",
            ),
        ).toBe(
            "Asha has nothing left on this pack, so there's nothing to extend.",
        );
        expect(
            extendFailure(
                {
                    error: "With 7 more days it would still have run out. Add more days.",
                    status: 400,
                },
                "Asha Rao",
            ),
        ).toBe("With 7 more days it would still have run out. Add more days.");
        expect(extendFailure({ error: "boom", status: 500 }, "Asha Rao")).toBe(
            "Couldn't extend Asha's pack. Nothing has changed — try again.",
        );
    });
});
