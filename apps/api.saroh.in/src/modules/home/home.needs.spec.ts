import { quietLastDay } from "../../../test/home-quiet-db";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { HomeAction, HomeEvidence } from "./home-model";
import { flattenNeeds, placedWords } from "./home-needs";
import { openOrderWords, orderNumber } from "./home-order-rows";
import { HomeService } from "./home.service";

/**
 * Needs you, flat (round 2, F3): one row per thing to do, ranked the way the
 * Home design lists them, with the tag's words and tone.
 */

const ZONE = "Asia/Kolkata";
// 18 Sep 2026, 09:30 in Kolkata — the design's "now".
const NOW = new Date("2026-09-18T04:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function ev(over: Partial<HomeEvidence> & { id: string }): HomeEvidence {
    return {
        title: over.id,
        subtitle: null,
        at: null,
        amountMinor: null,
        currency: null,
        href: `/x/${over.id}`,
        ...over,
    };
}

const lateOrder = ev({
    id: "o1",
    title: "1042",
    headline: "Send order #1042 to Anika Rao",
    detail: "Placed 16 Sep",
    amountMinor: 340000,
    currency: "INR",
    tag: "Late · 2 days",
    tone: "bad",
});
const dueOrder = ev({
    id: "o2",
    title: "1043",
    headline: "Send order #1043 to Dev Shah",
    detail: "Placed today at 08:10",
    tag: "Due today",
    tone: "due",
});

const ORDERS: HomeAction = {
    code: "COMMERCE_OPEN_ORDERS",
    title: "Fulfil 2 open orders",
    href: "/commerce/orders",
    severity: "OVERDUE",
    moduleKey: "COMMERCE",
    count: 2,
    evidence: [lateOrder, dueOrder],
};

const INVOICES: HomeAction = {
    code: "PAYMENTS_OVERDUE_INVOICES",
    title: "Chase an overdue invoice",
    href: "/billing/invoices/inv_1",
    severity: "OVERDUE",
    moduleKey: "PAYMENTS",
    count: 1,
    tone: "bad",
    evidence: [
        ev({
            id: "inv_1",
            title: "INV-0012",
            subtitle: "Farah Khan",
            detail: "X-ray, upper jaw",
            at: "2026-09-14T06:30:00.000Z",
            amountMinor: 480000,
            currency: "INR",
            href: "/billing/invoices/inv_1",
            tag: "Late · 4 days",
            tone: "bad",
        }),
    ],
};

const STOCK: HomeAction = {
    code: "COMMERCE_STOCK_SHORT",
    title: "2 sizes are short for orders",
    href: "/commerce/stock?show=needs",
    severity: "ATTENTION",
    moduleKey: "COMMERCE",
    count: 2,
    tag: "Blocks orders",
    tone: "bad",
    evidence: [ev({ id: "s1" }), ev({ id: "s2" })],
};

const RENEWALS: HomeAction = {
    code: "PAYMENTS_FAILED_RENEWALS",
    title: "Collect a renewal that hasn't been paid",
    href: "/billing/subscriptions/sub_1",
    severity: "OVERDUE",
    moduleKey: "PAYMENTS",
    count: 1,
    tone: "bad",
    evidence: [
        ev({
            id: "sub_1",
            title: "Monthly unlimited",
            subtitle: "Rohan Mehta",
            at: "2026-09-16T00:00:00.000Z",
            amountMinor: 250000,
            currency: "INR",
            tag: "Late · 2 days",
            tone: "bad",
        }),
    ],
};

const SITE: HomeAction = {
    code: "WEBSITE_NOT_LIVE",
    title: "Your site isn't live",
    href: "/sites/site_1",
    severity: "SETUP",
    moduleKey: "WEBSITE",
    count: 1,
    tag: "Blocked",
    tone: "bad",
    evidence: [ev({ id: "site_1" })],
};

describe("flattenNeeds", () => {
    it("ranks as the design does: late work, then blocked, then due", () => {
        // Given in the service's severity order: stock (ATTENTION) first.
        const { needs } = flattenNeeds(
            [STOCK, ORDERS, RENEWALS, INVOICES, SITE],
            ZONE,
        );

        expect(needs.map((n) => n.id)).toEqual([
            "COMMERCE_OPEN_ORDERS:o1",
            "PAYMENTS_OVERDUE_INVOICES:inv_1",
            "COMMERCE_STOCK_SHORT",
            "PAYMENTS_FAILED_RENEWALS:sub_1",
            "WEBSITE_NOT_LIVE",
            "COMMERCE_OPEN_ORDERS:o2",
        ]);
    });

    it("puts a late order above an overdue invoice", () => {
        const { needs } = flattenNeeds([INVOICES, ORDERS], ZONE);
        expect(needs[0].title).toBe("Send order #1042 to Anika Rao");
        expect(needs[1].title).toBe("overdue from Farah Khan");
    });

    it("says each row in the design's words, with its tag and tone", () => {
        const { needs } = flattenNeeds(
            [ORDERS, INVOICES, STOCK, RENEWALS, SITE],
            ZONE,
        );
        const by = Object.fromEntries(needs.map((n) => [n.id, n]));

        expect(by["COMMERCE_OPEN_ORDERS:o1"]).toMatchObject({
            title: "Send order #1042 to Anika Rao",
            sub: "Placed 16 Sep",
            amountMinor: 340000,
            currency: "INR",
            amountIn: "sub",
            tag: "Late · 2 days",
            tone: "bad",
            href: "/x/o1",
        });
        expect(by["COMMERCE_OPEN_ORDERS:o2"]).toMatchObject({
            tag: "Due today",
            tone: "due",
            // No money for someone who doesn't read orders.
            amountIn: null,
        });
        expect(by["PAYMENTS_OVERDUE_INVOICES:inv_1"]).toMatchObject({
            title: "overdue from Farah Khan",
            amountIn: "title",
            sub: "INV-0012 · X-ray, upper jaw · was due 14 Sep",
            tag: "Late · 4 days",
            tone: "bad",
        });
        expect(by.COMMERCE_STOCK_SHORT).toMatchObject({
            title: "2 sizes are short for orders",
            sub: "Open orders are waiting on them. Stock shows which, and by how many.",
            tag: "Blocks orders",
            tone: "bad",
            href: "/commerce/stock?show=needs",
        });
        expect(by["PAYMENTS_FAILED_RENEWALS:sub_1"]).toMatchObject({
            title: "Rohan Mehta's Monthly unlimited renewal hasn't been paid",
            sub: "was due 16 Sep",
            amountIn: "sub",
            tag: "Late · 2 days",
        });
        expect(by.WEBSITE_NOT_LIVE).toMatchObject({
            title: "Your site isn't live",
            sub: "Nobody can find you until you publish it.",
            tag: "Blocked",
            tone: "bad",
        });
    });

    it("says a declined renewal failed", () => {
        const failed: HomeAction = {
            ...RENEWALS,
            evidence: [{ ...RENEWALS.evidence![0], tag: "Payment failed" }],
        };
        const [row] = flattenNeeds([failed], ZONE).needs;
        expect(row.title).toBe(
            "Rohan Mehta's Monthly unlimited renewal failed",
        );
        expect(row.sub).toBe("The charge was declined.");
    });

    it("stands one row for what a source counted but didn't send", () => {
        const many: HomeAction = { ...INVOICES, count: 8 };
        const { needs, needsTotal } = flattenNeeds([many], ZONE);

        expect(needs).toHaveLength(2);
        expect(needs[1]).toMatchObject({
            id: "PAYMENTS_OVERDUE_INVOICES:more",
            title: "7 more overdue invoices",
            href: INVOICES.href,
            tag: null,
        });
        expect(needsTotal).toBe(8);
    });

    it("counts a one-row source as one thing, however many it names", () => {
        expect(flattenNeeds([STOCK], ZONE).needsTotal).toBe(1);
    });

    it("leaves suggestions off, and a module's blocker on with its words", () => {
        const { needs } = flattenNeeds(
            [
                {
                    code: "INSIGHTS_VIEW",
                    title: "Review this week's performance",
                    href: "/analytics",
                    severity: "SUGGESTION",
                },
                {
                    code: "APPOINTMENTS_SETUP",
                    title: "Add when you're open",
                    href: "/bookings/availability",
                    severity: "SETUP",
                },
                {
                    code: "PAYMENTS_ATTENTION",
                    title: "Reconnect Razorpay",
                    href: "/settings/providers",
                    severity: "ATTENTION",
                },
            ],
            ZONE,
        );

        expect(needs.map((n) => [n.title, n.tag, n.tone])).toEqual([
            ["Reconnect Razorpay", "Needs fixing", "bad"],
            ["Add when you're open", "To set up", "info"],
        ]);
    });

    it("gives nothing, and a total of none, when nothing needs doing", () => {
        expect(flattenNeeds([], ZONE)).toEqual({ needs: [], needsTotal: 0 });
    });
});

describe("openOrderWords", () => {
    const order = (over: Record<string, unknown>) => ({
        orderId: "1042",
        createdAt: ago(3 * HOUR),
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        fulfilment: "DELIVERY",
        ...over,
    });

    it("says a delivery past its day is late, in hours under a day", () => {
        const late = order({ createdAt: ago(25 * HOUR) });
        expect(openOrderWords(late, "Anika Rao", NOW, ZONE)).toMatchObject({
            headline: "Send order #1042 to Anika Rao",
            tag: "Late · 1 day",
            tone: "bad",
        });
        const collect = order({
            fulfilment: "COLLECT",
            createdAt: ago(3 * HOUR),
        });
        expect(openOrderWords(collect, "Anika Rao", NOW, ZONE).tag).toBe(
            "Late · 3 h",
        );
    });

    it("says an order not late yet is due, by the business's days", () => {
        // Placed 08:30 Kolkata; a delivery is late after a day: tomorrow.
        const fresh = order({ createdAt: ago(HOUR) });
        expect(openOrderWords(fresh, null, NOW, ZONE)).toMatchObject({
            headline: "Send order #1042 to a customer",
            tag: "Due tomorrow",
            tone: "due",
            detail: "Placed today at 08:30",
        });
        const pickup = order({ fulfilment: "COLLECT", createdAt: ago(HOUR) });
        expect(openOrderWords(pickup, "Dev", NOW, ZONE)).toMatchObject({
            headline: "Get order #1042 ready for Dev",
            tag: "Due today",
        });
    });

    it("asks for the hand-over once a pick-up is ready", () => {
        const ready = order({ fulfilment: "COLLECT", stage: "READY" });
        expect(openOrderWords(ready, "Dev", NOW, ZONE).headline).toBe(
            "Hand over order #1042 to Dev",
        );
    });

    it("never calls an order late that the Orders list wouldn't", () => {
        const handed = order({ stage: "COLLECTED", createdAt: ago(5 * DAY) });
        expect(openOrderWords(handed, "Dev", NOW, ZONE)).toMatchObject({
            tag: undefined,
            tone: "due",
        });
        const old = { orderId: "ORD-001", createdAt: ago(5 * DAY) };
        expect(openOrderWords(old, "Dev", NOW, ZONE)).toMatchObject({
            headline: "Send order ORD-001 to Dev",
            tag: undefined,
        });
    });

    it("numbers a storefront's order with a hash, and leaves a code alone", () => {
        expect(orderNumber("1042")).toBe("#1042");
        expect(orderNumber("ORD-001")).toBe("ORD-001");
    });
});

describe("placedWords", () => {
    it("says today with the time, yesterday, then the date", () => {
        expect(placedWords(ago(HOUR).toISOString(), NOW, ZONE)).toBe(
            "Placed today at 08:30",
        );
        expect(placedWords(ago(DAY).toISOString(), NOW, ZONE)).toBe(
            "Placed yesterday",
        );
        expect(placedWords(ago(3 * DAY).toISOString(), NOW, ZONE)).toBe(
            "Placed 15 Sep",
        );
    });
});

describe("HomeService needs", () => {
    function service(over: {
        orders?: unknown[];
        invoices?: unknown[];
        failStock?: boolean;
        zone?: string | null;
    }) {
        const views = [
            { key: "COMMERCE", label: "Sell", readiness: "ACTIVE" },
            { key: "PAYMENTS", label: "Payments", readiness: "ACTIVE" },
        ].map((v) => ({ blockers: [], ...v }));
        const availability = {
            listViews: jest.fn().mockResolvedValue(views),
        } as unknown as ModuleAvailabilityService;
        const orders = over.orders ?? [];
        const invoices = over.invoices ?? [];
        const db = {
            // D8's paused-subscriptions source: Payments on, so it has nothing.
            organizationModule: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            order: {
                count: jest.fn().mockResolvedValue(orders.length),
                findMany: jest.fn().mockResolvedValue(orders),
            },
            invoice: {
                count: jest.fn().mockResolvedValue(invoices.length),
                findMany: jest
                    .fn()
                    // Failed renewals read first, then overdue invoices.
                    .mockResolvedValueOnce([])
                    .mockResolvedValue(invoices),
            },
            paymentIntent: {
                count: jest.fn().mockResolvedValue(0),
                findMany: jest.fn().mockResolvedValue([]),
            },
            businessProfile: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(
                        over.zone === undefined
                            ? null
                            : { timezone: over.zone },
                    ),
            },
        };
        const stockChecks = {
            openShort: over.failStock
                ? jest.fn().mockRejectedValue(new Error("mid-migration"))
                : jest.fn().mockResolvedValue([]),
        };
        return new HomeService(
            availability,
            quietLastDay(db) as never,
            stockChecks as never,
        );
    }

    const OWNER = {
        organizationId: "org_1",
        organizationRole: "OWNER" as const,
    };

    const lateDelivery = {
        id: "ord_1",
        orderId: "1042",
        storeId: "store_1",
        total: "3400",
        currency: "INR",
        createdAt: new Date(Date.now() - 3 * DAY),
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        fulfilment: "DELIVERY",
        customer: { firstName: "Anika", lastName: "Rao", email: "a@x.in" },
    };
    const overdueInvoice = {
        id: "inv_1",
        number: "INV-0012",
        total: "4800",
        currency: "INR",
        dueAt: new Date(Date.now() - 4 * DAY),
        billToName: "Farah Khan",
        contact: null,
        lines: [{ description: "X-ray" }],
    };

    it("sends a late order above an overdue invoice, beside the old actions", async () => {
        const model = await service({
            orders: [lateDelivery],
            invoices: [overdueInvoice],
        }).build(OWNER);

        expect(model.needs.map((n) => n.title)).toEqual([
            "Send order #1042 to Anika Rao",
            "overdue from Farah Khan",
        ]);
        expect(model.needs[0]).toMatchObject({
            tag: "Late · 3 days",
            tone: "bad",
            amountMinor: 340000,
            href: "/commerce/orders/ord_1?storefront=store_1",
        });
        expect(model.needsTotal).toBe(2);
        // The old fields stay for one release (default 130).
        expect(model.actions.map((a) => a.code)).toEqual([
            "COMMERCE_OPEN_ORDERS",
            "PAYMENTS_OVERDUE_INVOICES",
        ]);
    });

    it("keeps an order's money from someone who only moves it", async () => {
        const model = await service({ orders: [lateDelivery] }).build({
            ...OWNER,
            organizationRole: "MEMBER",
            organizationActions: new Set(["order:stage", "store:read"]),
        });
        const order = model.needs.find(
            (n) => n.code === "COMMERCE_OPEN_ORDERS",
        );
        expect(order).toMatchObject({ amountMinor: null, amountIn: null });
    });

    it("sends no rows and says which part it couldn't read", async () => {
        const model = await service({ failStock: true }).build(OWNER);
        expect(model.needs).toEqual([]);
        expect(model.unavailable).toEqual([
            { moduleKey: "COMMERCE", label: "Stock" },
        ]);
    });
});
