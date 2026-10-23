import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { pinClock } from "@/lib/format/test-clock";
import type {
    HomeGoing,
    HomeModel,
    HomeNeedGroup,
    HomeTiles,
} from "@/lib/home/service";

import { HomeDashboard } from "./home-dashboard";

/**
 * Home A at a desk (DEC-171, plan U6): each state board, for an owner and
 * for a role without money. What is pinned is what the page says and
 * which parts it draws; how it looks at 1440, 390 and 320 is the browser's
 * (`e2e/tests/home-today.spec.ts`) and the side-by-side check with the
 * boards.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));

pinClock("2026-10-19T09:00:00.000Z");

const LAST_DAY = {
    zone: "Asia/Kolkata",
    date: "2026-10-19",
    partOfDay: "afternoon" as const,
    since: "2026-10-18T09:00:00.000Z",
    fresh: false,
    items: [],
};

const TILES: HomeTiles = {
    bookingsToday: {
        count: 6,
        next: {
            startAt: "2026-10-19T06:00:00.000Z",
            date: "2026-10-19",
            time: "11:30",
            what: "Sourdough basics",
        },
        laterToday: 3,
        href: "/calendar",
    },
    toPack: {
        count: 7,
        dueToday: 3,
        late: 3,
        inProgress: 1,
        href: "/commerce/orders",
    },
    moneyIn: {
        totals: [
            {
                currency: "INR",
                amountMinor: 824_000,
                lastWeekMinor: 700_000,
                change: { kind: "UP", percent: 18 },
            },
        ],
        payments: 14,
        href: "/billing/invoices?since=x",
    },
    came: {
        came: 3,
        due: 4,
        total: 6,
        next: { time: "12:00", person: "Kavya Iyer", startAt: "x" },
        href: "/bookings",
    },
};

const ORDERS: HomeNeedGroup = {
    kind: "ORDERS",
    count: 7,
    late: 3,
    totals: null,
    oldest: {
        id: "o1",
        title: "#1057",
        who: "Aditya Shetty",
        at: "2026-09-23T10:00:00.000Z",
        amountMinor: 102_000,
        currency: "INR",
    },
    rows: [
        {
            id: "o1",
            code: "COMMERCE_OPEN_ORDERS",
            severity: "OVERDUE",
            title: "Send order #1057 to Aditya Shetty",
            sub: "Placed 23 Sep",
            amountMinor: 102_000,
            currency: "INR",
            amountIn: "sub",
            tag: "Late · 26 days",
            tone: "bad",
            href: "/commerce/orders/o1",
        },
    ],
    more: 6,
    href: "/commerce/orders",
    codes: ["COMMERCE_OPEN_ORDERS"],
};

const BILLS: HomeNeedGroup = {
    kind: "BILLS",
    count: 10,
    late: 10,
    all: 16,
    totals: [{ currency: "INR", amountMinor: 3_297_000 }],
    oldest: null,
    rows: [],
    more: 10,
    href: "/billing/invoices?view=overdue",
    codes: ["PAYMENTS_OVERDUE_INVOICES"],
};

const GOING: HomeGoing = {
    zone: "Asia/Kolkata",
    from: "2026-10-13",
    to: "2026-10-19",
    beforeFrom: "2026-10-06",
    beforeTo: "2026-10-12",
    sales: [
        {
            currency: "INR",
            amountMinor: 4_825_000,
            beforeMinor: 4_308_000,
            change: { kind: "UP", percent: 12 },
            href: "/billing/invoices",
        },
    ],
    bookings: { count: 22, before: 18, href: "/bookings" },
    orders: { count: 41, before: 35, href: "/commerce/orders" },
};

function home(over: Partial<HomeModel> = {}): HomeModel {
    return {
        view: "business",
        staff: null,
        actions: [],
        hasAnyModule: true,
        upcoming: [],
        unavailable: [],
        needs: [],
        needsTotal: 0,
        ordersInProgress: 1,
        today: {
            zone: "Asia/Kolkata",
            date: "2026-10-19",
            bookings: true,
            items: [
                {
                    id: "c1",
                    kind: "CLASS",
                    startAt: "2026-10-19T06:00:00.000Z",
                    time: "11:30",
                    what: "Sourdough basics",
                    who: "8 booked · with Asha",
                    person: null,
                    outcome: null,
                    outcomeTime: null,
                    stage: null,
                    flags: [],
                    href: "/bookings/c1",
                    markable: true,
                },
                {
                    id: "p1",
                    kind: "PICKUP",
                    startAt: "2026-10-19T09:30:00.000Z",
                    time: "15:00",
                    what: "Order #1084 pick-up",
                    who: "Neha Joshi",
                    person: null,
                    outcome: null,
                    outcomeTime: null,
                    stage: null,
                    flags: [],
                    href: "/commerce/orders/p1",
                    markable: false,
                },
            ],
        },
        lastDay: LAST_DAY,
        week: null,
        tiles: TILES,
        needGroups: [ORDERS, BILLS],
        needGroupsTotal: 17,
        going: GOING,
        ...over,
    };
}

const render = (
    model: HomeModel,
    props: { insights?: boolean } = { insights: true },
) =>
    renderToStaticMarkup(
        <HomeDashboard
            home={model}
            modules={null}
            businessName="Rye & Co."
            insights={props.insights}
        />,
    );

/** The desk's half of the page: everything from 640px. */
function desk(html: string): string {
    const start = html.indexOf('data-home-layout="desk"');
    const end = html.indexOf('data-home-layout="phone"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return html.slice(start, end);
}

function phone(html: string): string {
    return html.slice(html.indexOf('data-home-layout="phone"'));
}

describe("Home A at a desk", () => {
    it("draws the busy day: tiles, Needs you grouped, Today, How it's going (HAPageD)", () => {
        const html = desk(render(home()));
        expect(html).toContain("Today at a glance");
        for (const label of [
            "Bookings today",
            "To pack or hand over",
            "Money in today",
            "Came",
        ]) {
            expect(html).toContain(label);
        }
        expect(html).toContain("Needs you");
        expect(html).toContain("17 things");
        expect(html).toContain("and 1 order on its way");
        expect(html).toContain("7 orders to send or hand over");
        expect(html).toContain("₹32,970 unpaid on 16 bills");
        expect(html).toContain("Open orders");
        expect(html).toContain("See bills");
        // Groups are closed until opened, each a disclosure.
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain("1 booking, 1 pick-up");
        expect(html).toContain("Open the calendar");
        expect(html).toContain("How it&#x27;s going");
        expect(html).toContain(
            "The last 7 days, 13 to 19 Oct, compared with the 7 days before",
        );
        expect(html).toContain("See how the month went");
        expect(html).toContain('href="/analytics?period=4w"');
    });

    it("hands below 640px to the simplified phone Home (U17)", () => {
        const html = phone(render(home()));
        expect(html).toContain("data-phone-home");
        expect(html).toContain("data-phone-figures");
        // The desk's tiles and groups are the desk's alone.
        expect(html).not.toContain("To pack or hand over");
        expect(html).not.toContain("data-need-group");
        expect(html).toContain("Needs you");
        expect(html).not.toContain("This week");
    });

    it("gives a role without money three tiles and no amounts (HAMemberD)", () => {
        const { moneyIn: _money, ...tiles } = TILES;
        const html = desk(
            render(
                home({
                    tiles,
                    needGroups: [
                        {
                            ...ORDERS,
                            oldest: {
                                id: "o1",
                                title: "#1057",
                                who: "Aditya Shetty",
                                at: "2026-09-23T10:00:00.000Z",
                                amountMinor: null,
                                currency: null,
                            },
                            rows: [
                                {
                                    ...ORDERS.rows[0],
                                    amountMinor: null,
                                    currency: null,
                                    amountIn: null,
                                },
                            ],
                        },
                    ],
                    needGroupsTotal: 7,
                    going: {
                        ...GOING,
                        sales: undefined,
                    },
                }),
                { insights: false },
            ),
        );
        expect(html).not.toContain("Money in today");
        expect(html).not.toContain("₹");
        expect(html).toContain("Bookings today");
        expect(html).toContain("Came");
        expect(html).not.toContain("See how the month went");
        expect(html).toContain("4 more than the 7 days before");
    });

    it("says a quiet day in words (HAQuietD)", () => {
        const html = desk(
            render(
                home({
                    needGroups: [],
                    needGroupsTotal: 0,
                    ordersInProgress: 0,
                    today: {
                        zone: "Asia/Kolkata",
                        date: "2026-10-19",
                        bookings: true,
                        items: [],
                    },
                    tiles: {
                        bookingsToday: {
                            count: 0,
                            next: {
                                startAt: "x",
                                date: "2026-10-21",
                                time: "10:00",
                                what: "Sourdough basics",
                            },
                            laterToday: 0,
                            href: "/calendar",
                        },
                    },
                }),
            ),
        );
        expect(html).toContain("Nothing needs you.");
        expect(html).toContain(
            "Next booking: Wednesday 21 Oct at 10:00 am, Sourdough basics.",
        );
        expect(html).toContain("Nothing booked today.");
        expect(html).toContain("None");
    });

    it("names a part that couldn't load once, and the rest still shows (HAFailedD)", () => {
        const { moneyIn: _money, ...tiles } = TILES;
        const page = render(
            home({
                tiles,
                needGroups: [ORDERS],
                needGroupsTotal: 7,
                unavailable: [
                    { moduleKey: "PAYMENTS", label: "Overdue invoices" },
                    { moduleKey: "PAYMENTS", label: "Money in today" },
                ],
            }),
        );
        // One message, above both layouts, with Try again.
        expect(page.match(/Couldn&#x27;t load/g)).toHaveLength(1);
        expect(page).toContain("Overdue invoices and Money in today");
        expect(page).toContain("Try again");
        const html = desk(page);
        expect(html).toContain("7 things we could check");
        expect(html).toContain("Couldn&#x27;t check payments");
        expect(html).toContain("7 orders to send or hand over");
    });

    it("leaves How it's going out while the business has nothing yet (HAGettingSetUpD)", () => {
        const html = desk(
            render(
                home({
                    lastDay: { ...LAST_DAY, fresh: true },
                    needGroups: [],
                    needGroupsTotal: 0,
                    ordersInProgress: 0,
                }),
            ),
        );
        expect(html).toContain("Nothing needs you yet.");
        expect(html).not.toContain("How it&#x27;s going");
    });

    it("falls back to the flat list from an API before Home A", () => {
        const html = desk(
            render(home({ needGroups: null, tiles: null, going: null })),
        );
        expect(html).toContain("Needs you");
        expect(html).not.toContain("Today at a glance");
        expect(html).not.toContain("How it&#x27;s going");
    });

    it("keeps the first run as it was (HAFirstRunD)", () => {
        const html = render(home({ hasAnyModule: false }));
        expect(html).not.toContain('data-home-layout="desk"');
        expect(html).not.toContain("Today at a glance");
    });

    it("keeps business data masked in a recording", () => {
        const html = desk(render(home()));
        // Fixed words may be read; figures and names never carry the mark.
        expect(html).not.toMatch(/data-ph-unmask=""[^>]*>₹/);
        expect(html).not.toMatch(/data-ph-unmask=""[^>]*>Aditya/);
    });
});
