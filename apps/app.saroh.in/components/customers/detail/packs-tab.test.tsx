import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
    CustomerDetail,
    DetailPack,
} from "@/lib/customer-workspace/detail";

import { Overview } from "./overview";
import { PacksTab } from "./packs-tab";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/class-packs/actions", () => ({
    sellPack: vi.fn(),
    extendHolder: vi.fn(),
}));

/**
 * Customer Detail's class packs (round-2 C7): the Packs tab's rows open
 * Pack Detail and their bookings, Extend and Sell show only to whoever may
 * use them, and the Overview's Classes left card sells from the page and
 * says a failed read in the card itself.
 */

const NOW = new Date("2026-09-28T10:00:00Z");

const pack = (over: Partial<DetailPack> = {}): DetailPack => ({
    id: "pp1",
    pack: { id: "pack_1", name: "10 classes", kind: "CLASSES" },
    credits: 10,
    used: 3,
    left: 7,
    expiresAt: "2026-10-20T00:00:00Z",
    boughtAt: "2026-09-01T06:00:00Z",
    standing: "ACTIVE",
    price: "3000.00",
    currency: "INR",
    paidBy: "CASH",
    extensions: [],
    uses: [
        {
            bookingId: "bk_1",
            startAt: "2026-09-30T01:30:00Z",
            service: { id: "s1", name: "Vinyasa" },
            state: "BOOKED",
        },
    ],
    ...over,
});

const tab = (
    rows: DetailPack[],
    opts: { canSell?: boolean; canExtend?: boolean } = {},
) =>
    renderToStaticMarkup(
        <PacksTab
            rows={rows}
            first="Asha"
            canSell={opts.canSell ?? true}
            canExtend={opts.canExtend ?? true}
            onSell={vi.fn()}
            onExtend={vi.fn()}
            timeZone="Asia/Kolkata"
            now={NOW}
        />,
    );

describe("the Packs tab", () => {
    it("draws a pack: its name opens Pack Detail, 7 of 10, use-by, what they paid", () => {
        const html = tab([pack()]);
        expect(html).toContain('href="/class-packs/pack_1"');
        expect(html).toContain("10 classes pack");
        expect(html).toContain("7 of 10");
        expect(html).toContain("Use by 20 Oct");
        expect(html).toContain("Bought 1 Sep · ₹3,000 · Cash");
        expect(html).toContain("Can still use · 1");
        expect(html).toContain("Classes booked · 1");
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain(">Extend<");
        expect(html).toContain("Sell a pack");
    });

    it("keeps Extend and Sell from a role that can't, and says why", () => {
        const html = tab([pack()], { canSell: false, canExtend: false });
        expect(html).not.toContain("Sell a pack");
        expect(html).toContain("Your role can&#x27;t extend packs");
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Extend</);
    });

    it("says when they've never had a pack", () => {
        expect(tab([])).toContain(
            "Asha has no class pack. Sell them one and their classes come off it as they book.",
        );
        expect(tab([], { canSell: false })).toContain(
            "Asha has no class pack.",
        );
    });

    it("opens on the ended ones when nothing is left to use", () => {
        const html = tab([
            pack({
                standing: "EXPIRED",
                expiresAt: "2026-09-20T00:00:00Z",
                left: 2,
            }),
        ]);
        expect(html).toContain("Ran out 20 Sep with 2 unused");
        expect(html).toMatch(/aria-pressed="true"[^>]*>Used up or expired · 1/);
    });
});

const gym = (over: Partial<CustomerDetail> = {}): CustomerDetail => ({
    contact: {
        id: "c1",
        name: "Asha Rao",
        firstName: "Asha",
        lastName: "Rao",
        email: "asha@example.in",
        phone: null,
        company: null,
        source: null,
        createdAt: "2026-07-01T00:00:00Z",
    },
    money: true,
    timezone: "Asia/Kolkata",
    stats: {
        bookings: 0,
        attended: 0,
        noShows: 0,
        lateCancels: 0,
        classesLeft: {
            total: 7,
            packs: 7,
            membership: null,
            nextExpiry: "2026-10-20T00:00:00Z",
            allowance: null,
        },
    },
    notes: { from: "contact", rows: [], allergenChoices: [] },
    allergens: [],
    bookings: { from: "contact", upcoming: [], past: [] },
    packs: { from: "contact", rows: [pack()] },
    consent: null,
    unavailable: [],
    ...over,
});

const overview = (d: CustomerDetail, onSellPack?: () => void) =>
    renderToStaticMarkup(
        <Overview
            d={d}
            now={NOW}
            canStop={false}
            stopping={false}
            canConsent={false}
            onStop={vi.fn()}
            onOrders={vi.fn()}
            onBookings={vi.fn()}
            onSellPack={onSellPack}
        />,
    );

describe("the Classes left card", () => {
    it("lists a pack as a link to its Pack Detail, and sells from the page", () => {
        const html = overview(gym(), vi.fn());
        expect(html).toContain('aria-label="Classes left"');
        expect(html).toMatch(/<a[^>]*href="\/class-packs\/pack_1"/);
        expect(html).toContain("7 of 10");
        expect(html).toMatch(/<button[^>]*>Sell a pack<\/button>/);
        // Not a trip to the Packs list.
        expect(html).not.toContain('href="/class-packs"');
    });

    it("offers no sale to a role that can't sell", () => {
        expect(overview(gym())).not.toContain("Sell a pack");
    });

    it("says a failed packs read in the card only", () => {
        const html = overview(
            gym({
                packs: null,
                stats: { ...gym().stats, classesLeft: null },
                unavailable: [{ source: "packs", label: "Class packs" }],
            }),
        );
        expect(html).toContain("Classes left couldn&#x27;t be read just now.");
    });

    it("draws no card with Class packs or Appointments off", () => {
        const off = gym();
        delete off.packs;
        delete off.stats.classesLeft;
        expect(overview(off)).not.toContain('aria-label="Classes left"');
    });
});
