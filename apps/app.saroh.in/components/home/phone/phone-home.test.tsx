// @vitest-environment jsdom
/**
 * The simplified phone Home (DEC-171, plan U17, boards `HPHome`,
 * `HPSheets`, `HPMore`, `HPStates`): each state for an owner and for a
 * role without money, and the sheets each line opens. What is pinned is
 * what the page says and what opens; how it looks at 390 and 320 is the
 * browser's (`e2e/tests/home-phone.spec.ts`) and the side-by-side check
 * with the boards.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pinClock } from "@/lib/format/test-clock";
import type {
    HomeGoing,
    HomeModel,
    HomeNeedGroup,
    HomeTiles,
} from "@/lib/home/service";
import type { ReadyChecklist } from "@/lib/settings/ready";

import { HomeDashboard } from "@/components/home/dashboard/home-dashboard";
import { PhoneHome } from "./phone-home";

vi.mock("@/lib/api/http", () => ({}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));

const undos: (() => void)[] = [];
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (_: string, undo: () => void) => {
        undos.push(undo);
        return "t";
    },
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));

const recordBookingOutcome = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("@/lib/services/actions", () => ({
    recordBookingOutcome: (...args: unknown[]) =>
        recordBookingOutcome(...(args as [])),
}));

pinClock("2026-10-19T06:10:00.000Z");

const LAST_DAY = {
    zone: "Asia/Kolkata",
    date: "2026-10-19",
    partOfDay: "afternoon" as const,
    since: "2026-10-18T06:10:00.000Z",
    fresh: false,
    items: [
        {
            kind: "ORDERS" as const,
            count: 3,
            amountMinor: null,
            currency: null,
            href: "/commerce/orders?since=a",
        },
        {
            kind: "BOOKINGS" as const,
            count: 2,
            amountMinor: null,
            currency: null,
            href: "/bookings?since=a",
        },
    ],
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
        laterToday: 4,
        href: "/calendar",
    },
    toPack: {
        count: 7,
        dueToday: 0,
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
        href: "/billing/invoices?paid=today",
    },
    came: {
        came: 3,
        due: 4,
        total: 6,
        next: null,
        href: "/bookings?came=1",
    },
};

function row(id: string, title: string, over: object = {}) {
    return {
        id,
        code: "COMMERCE_OPEN_ORDERS",
        severity: "OVERDUE" as const,
        title,
        sub: null,
        amountMinor: null,
        currency: null,
        amountIn: null,
        tag: null,
        tone: "info" as const,
        href: `/commerce/orders/${id}`,
        ...over,
    };
}

function group(
    kind: HomeNeedGroup["kind"],
    over: Partial<HomeNeedGroup> = {},
): HomeNeedGroup {
    return {
        kind,
        count: 1,
        late: 0,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: `/${kind.toLowerCase()}`,
        codes: [],
        ...over,
    };
}

const ORDERS = group("ORDERS", {
    count: 7,
    late: 3,
    rows: [row("o1", "Send order #1057 to Aditya Shetty")],
    more: 6,
    href: "/commerce/orders",
});
const BILLS = group("BILLS", {
    count: 10,
    late: 10,
    all: 16,
    totals: [{ currency: "INR", amountMinor: 3_297_000 }],
    more: 10,
    href: "/billing/invoices?view=overdue",
});
const BUSY = [
    ORDERS,
    BILLS,
    group("AWAITING_PAYMENT", { count: 2 }),
    group("ENQUIRIES", { count: 3 }),
    group("PAYMENTS", { count: 2 }),
    group("REVIEWS"),
    group("STOCK", { count: 2, codes: ["COMMERCE_STOCK_LOW"] }),
];

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
                    id: "b1",
                    kind: "BOOKING",
                    startAt: "2026-10-19T06:00:00.000Z",
                    time: "11:30",
                    what: "Cake tasting",
                    who: "Kavya Iyer",
                    person: "Kavya Iyer",
                    outcome: null,
                    outcomeTime: null,
                    stage: null,
                    flags: [],
                    href: "/bookings/b1",
                    markable: true,
                },
            ],
        },
        lastDay: LAST_DAY,
        week: null,
        tiles: TILES,
        needGroups: BUSY,
        needGroupsTotal: 24,
        going: GOING,
        ...over,
    };
}

function checklist(done: number, total: number): ReadyChecklist {
    const steps = Array.from({ length: total }, (_, i) => ({
        key: `step${i}` as ReadyChecklist["steps"][number]["key"],
        label:
            i === done
                ? "Choose where your online shop sells from"
                : `Step ${i}`,
        why: "Until then your shop page isn't live.",
        cta: i === done ? "Choose location" : "Do it",
        href: `/settings/step${i}`,
        broken: false,
        done: i < done,
    }));
    return {
        steps,
        left: steps.filter((s) => !s.done),
        done,
        total,
        outside: [],
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    undos.length = 0;
    recordBookingOutcome.mockClear();
    refresh.mockClear();
    window.localStorage.clear();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 20));

function draw(
    model: HomeModel,
    opts: { insights?: boolean; setup?: ReadyChecklist } = {},
) {
    act(() =>
        root.render(
            <PhoneHome
                home={model}
                setup={
                    opts.setup ? { list: opts.setup, businessId: "biz" } : null
                }
                now={new Date()}
                insights={opts.insights ?? true}
            />,
        ),
    );
    return host;
}

const text = () => host.textContent;
const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
const lines = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("[data-phone-line]"));

async function press(el: HTMLElement | null | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await settle();
    });
}

describe("the phone Home, busy day (HPHome)", () => {
    it("draws three figures, the Next line, five lines and Show 2 more", () => {
        draw(home());
        const figures = Array.from(
            host.querySelectorAll<HTMLAnchorElement>("[data-figure]"),
        ).map((a) => [a.textContent, a.getAttribute("href")]);
        expect(figures).toEqual([
            ["₹8,240in today", "/billing/invoices?paid=today"],
            ["6bookings", "/calendar"],
            ["7to pack", "/commerce/orders"],
        ]);
        expect(host.querySelector("[data-phone-next]")?.textContent).toContain(
            "Next: 11:30 am Sourdough basics",
        );
        expect(lines().map((l) => l.dataset.phoneLine)).toEqual([
            "ORDERS",
            "BILLS",
            "AWAITING_PAYMENT",
            "PAYMENTS",
            "ENQUIRIES",
        ]);
        expect(lines()[0]?.textContent).toContain("Pack or hand over 7 orders");
        expect(lines()[0]?.textContent).toContain("3 late");
        expect(lines()[1]?.textContent).toContain("₹32,970 unpaid · 16 bills");
        expect(host.querySelector("[data-needs-count]")?.textContent).toBe(
            "24",
        );
        expect(text()).toContain("Show 2 more · review, low stock");
        expect(text()).toContain(
            "Last 7 days: ₹48,250, up 12% on the 7 days before.",
        );
        const insights = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent === "Insights",
        );
        expect(insights?.getAttribute("href")).toBe("/analytics?period=4w");
    });

    it("every line and the Next line is at least 44px tall", () => {
        draw(home());
        for (const el of [
            ...lines(),
            host.querySelector("[data-phone-next]"),
        ]) {
            expect(el?.className).toMatch(/min-h-(\[54px\]|14)/);
        }
    });

    it("Show 2 more reveals the folded groups", async () => {
        draw(home());
        const more = Array.from(host.querySelectorAll("button")).find((b) =>
            b.textContent.startsWith("Show 2 more"),
        );
        await press(more);
        expect(lines().map((l) => l.dataset.phoneLine)).toContain("STOCK");
        expect(text()).toContain("Reply to 1 review");
        expect(text()).not.toContain("Show 2 more");
    });
});

describe("a group's sheet (HPSheets)", () => {
    it("opens the orders group with its rows, on its way and Open all orders, and closing gives focus back", async () => {
        draw(home());
        const line = lines()[0];
        await press(line);
        const open = sheet();
        expect(open?.textContent).toContain("Needs you");
        expect(open?.textContent).toContain("Pack or hand over 7 orders");
        expect(open?.textContent).toContain(
            "Send order #1057 to Aditya Shetty",
        );
        expect(open?.textContent).toContain("6 more orders");
        expect(open?.textContent).toContain("and 1 order on its way");
        const all = Array.from(open?.querySelectorAll("a") ?? []).find(
            (a) => a.textContent === "Open all orders",
        );
        expect(all?.getAttribute("href")).toBe("/commerce/orders");
        // Escape closes it and focus is back on the line.
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await settle();
        });
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(line);
    });

    it("opens bills with how many are overdue and See bills", async () => {
        draw(home());
        await press(lines()[1]);
        expect(sheet()?.textContent).toContain("10 overdue, oldest first.");
        expect(sheet()?.textContent).toContain("See bills");
    });

    it("keeps each row's inline action in the sheet", async () => {
        draw(
            home({
                needGroups: [
                    {
                        ...ORDERS,
                        rows: [
                            row("o1", "Send order #1057 to Aditya Shetty", {
                                inline: {
                                    kind: "MARK_SENT",
                                    label: "Mark sent",
                                    confirm: "Mark #1057 as sent?",
                                    yes: "Mark sent",
                                    done: "Marked sent",
                                    sends: false,
                                    undoable: true,
                                    target: "o1",
                                    person: "Aditya",
                                    stage: "DISPATCHED",
                                },
                            }),
                        ],
                    },
                ],
                needGroupsTotal: 7,
            }),
        );
        await press(lines()[0]);
        expect(
            Array.from(sheet()?.querySelectorAll("button") ?? []).map(
                (b) => b.textContent,
            ),
        ).toContain("Mark sent");
    });
});

describe("the day sheet (HPMore)", () => {
    it("opens Since yesterday, the day's rows and Open the calendar", async () => {
        draw(home());
        await press(host.querySelector<HTMLElement>("[data-phone-next]"));
        const open = sheet();
        expect(open?.textContent).toContain("Today, Mon 19 Oct");
        expect(open?.textContent).toContain("Since yesterday");
        const links = Array.from(open?.querySelectorAll("a") ?? []).map((a) =>
            a.getAttribute("href"),
        );
        expect(links).toContain("/commerce/orders?since=a");
        expect(links).toContain("/bookings?since=a");
        expect(links).toContain("/calendar");
        expect(open?.textContent).toContain("Cake tasting");
    });

    it("holds Mark arrived for Undo, even past closing the sheet", async () => {
        draw(home());
        const next = host.querySelector<HTMLElement>("[data-phone-next]");
        await press(next);
        const arrive = Array.from(
            sheet()?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent === "Mark arrived");
        await press(arrive);
        expect(sheet()?.textContent).toContain("Came at");
        expect(recordBookingOutcome).not.toHaveBeenCalled();
        // Closing the sheet keeps it held, not sent.
        await press(
            sheet()?.querySelector<HTMLElement>('button[aria-label="Close"]'),
        );
        expect(recordBookingOutcome).not.toHaveBeenCalled();
        // Undo puts the row back.
        await act(async () => {
            undos.at(-1)?.();
            await settle();
        });
        await press(next);
        expect(sheet()?.textContent).not.toContain("Came at");
        expect(recordBookingOutcome).not.toHaveBeenCalled();
    });

    it("keeps the last 24 hours on Home when there is no day to open", () => {
        draw(home({ tiles: { toPack: TILES.toPack }, today: null }));
        expect(host.querySelector("[data-phone-next]")).toBeNull();
        expect(host.querySelector("[data-since-yesterday]")).not.toBeNull();
    });
});

describe("the phone Home's states", () => {
    it("a quiet day says nothing is booked and nothing needs you", () => {
        draw(
            home({
                tiles: {
                    ...TILES,
                    bookingsToday: {
                        count: 0,
                        next: {
                            startAt: "2026-10-21T04:30:00.000Z",
                            date: "2026-10-21",
                            time: "10:00",
                            what: "Sourdough basics",
                        },
                        laterToday: 0,
                        href: "/calendar",
                    },
                },
                today: {
                    zone: "Asia/Kolkata",
                    date: "2026-10-19",
                    bookings: true,
                    items: [],
                },
                needGroups: [],
                needGroupsTotal: 0,
            }),
        );
        expect(text()).toContain("Nothing booked today");
        expect(text()).toContain("10:00 am Sourdough basics");
        expect(text()).toContain("Nothing needs you right now.");
        expect(host.querySelector("[data-needs-count]")).toBeNull();
    });

    it("a Member sees Bookings, Came and To pack, no money anywhere, How it's going in counts", () => {
        const { moneyIn: _m, ...tiles } = TILES;
        const { sales: _s, ...going } = GOING;
        draw(
            home({
                tiles,
                going,
                needGroups: [
                    ORDERS,
                    group("AWAITING_PAYMENT", { count: 2 }),
                    group("ENQUIRIES", { count: 3 }),
                    group("REVIEWS"),
                ],
                needGroupsTotal: 13,
            }),
            { insights: false },
        );
        const labels = Array.from(host.querySelectorAll("[data-figure]")).map(
            (a) => a.getAttribute("data-figure"),
        );
        expect(labels).toEqual(["bookings", "came", "toPack"]);
        expect(text()).toContain("3 of 6");
        expect(text()).not.toContain("₹");
        expect(text()).toContain(
            "Last 7 days: 22 bookings and 41 orders, both up on the 7 days before.",
        );
        expect(text()).not.toContain("Insights");
        expect(lines()).toHaveLength(4);
    });

    it("one part that couldn't load is one line with Try again, and the count says so", async () => {
        draw(
            home({
                needGroups: [ORDERS],
                needGroupsTotal: 13,
                unavailable: [
                    { moduleKey: "PAYMENTS", label: "Overdue invoices" },
                ],
            }),
        );
        expect(host.querySelector("[data-needs-count]")?.textContent).toBe(
            "13 things we could check",
        );
        const couldnt = host.querySelector<HTMLElement>("[data-couldnt-check]");
        expect(couldnt?.textContent).toContain(
            "Couldn't check overdue invoices just now",
        );
        expect(couldnt?.textContent).toContain("Try again");
        await press(couldnt);
        expect(refresh).toHaveBeenCalled();
    });

    it("getting set up leads with the setup card and says what will show", async () => {
        draw(
            home({
                lastDay: { ...LAST_DAY, fresh: true, items: [] },
                needGroups: [],
                needGroupsTotal: 0,
                going: null,
            }),
            { setup: checklist(1, 4) },
        );
        expect(host.querySelector("[data-phone-figures]")).toBeNull();
        expect(host.querySelector("[data-phone-next]")).toBeNull();
        const card = host.querySelector("[data-phone-setup=card]");
        expect(card?.textContent).toContain("1 of 4 done");
        expect(card?.textContent).toContain(
            "next: choose where your online shop sells from",
        );
        expect(text()).toContain(
            "New orders, bookings and enquiries show here.",
        );
        const seeAll = Array.from(card?.querySelectorAll("button") ?? []).find(
            (b) => b.textContent.startsWith("See all 4 steps"),
        );
        await press(seeAll);
        expect(sheet()?.textContent).toContain("Finish setup");
        expect(sheet()?.textContent).toContain("Hide for now");
    });

    it("once most of setup is done it is one line that opens its sheet, and × hides it", async () => {
        draw(home(), { setup: checklist(5, 6) });
        const line = host.querySelector<HTMLElement>("[data-phone-setup-line]");
        expect(line?.textContent).toBe(
            "Finish setup: choose where your online shop sells from",
        );
        await press(line);
        expect(sheet()?.textContent).toContain("5 of 6 done");
        await press(
            sheet()?.querySelector<HTMLElement>('button[aria-label="Close"]'),
        );
        await press(
            host.querySelector<HTMLElement>(
                'button[aria-label="Hide setup for now"]',
            ),
        );
        expect(host.querySelector("[data-phone-setup]")).toBeNull();
        // Undo brings it back.
        await act(async () => {
            undos.at(-1)?.();
            await settle();
        });
        expect(host.querySelector("[data-phone-setup=line]")).not.toBeNull();
    });
});

describe("Home's two layouts", () => {
    it("names a failed part once at a desk, and on the phone only in its line", () => {
        act(() =>
            root.render(
                <HomeDashboard
                    home={home({
                        unavailable: [
                            {
                                moduleKey: "PAYMENTS",
                                label: "Overdue invoices",
                            },
                        ],
                    })}
                    modules={null}
                    businessName="Rye & Co."
                />,
            ),
        );
        const notice = Array.from(host.querySelectorAll("div")).find((d) =>
            d.className.includes("hidden sm:block"),
        );
        expect(notice?.textContent).toContain("Couldn't load");
        const phone = host.querySelector('[data-home-layout="phone"]');
        expect(phone?.textContent).not.toContain("Couldn't load");
        expect(phone?.textContent).toContain("Couldn't check overdue invoices");
    });
});

describe("cheques not in the bank on a phone (plan U18)", () => {
    const CHEQUES = {
        count: 2,
        totals: [{ currency: "INR", amountMinor: 1_400_000 }],
        href: "/billing/invoices?view=cheques",
    };
    const week = (chequesWaiting: unknown) =>
        ({
            zone: "Asia/Kolkata",
            startDate: "2026-10-19",
            ...(chequesWaiting === undefined ? {} : { chequesWaiting }),
        }) as HomeModel["week"];
    const cheques = () =>
        host.querySelector<HTMLAnchorElement>("[data-cheques-line] a");
    const order = () =>
        Array.from(
            host.querySelectorAll<HTMLElement>("[data-phone-needs] ul > li"),
        ).map((li) =>
            li.dataset.chequesLine === ""
                ? "CHEQUES"
                : (li.querySelector<HTMLElement>("[data-phone-line]")?.dataset
                      .phoneLine ?? "?"),
        );

    it("is one of the five lines, under bills, counted as one thing, opening the cheques list", () => {
        draw(home({ week: week(CHEQUES) }));
        expect(cheques()?.textContent).toContain(
            "2 cheques not in the bank · ₹14,000",
        );
        expect(cheques()?.getAttribute("href")).toBe(
            "/billing/invoices?view=cheques",
        );
        expect(order()).toEqual([
            "ORDERS",
            "BILLS",
            "CHEQUES",
            "AWAITING_PAYMENT",
            "PAYMENTS",
            "?",
        ]);
        expect(host.querySelector("[data-needs-count]")?.textContent).toBe(
            "25",
        );
        expect(text()).toContain("Show 3 more · enquiries, review, low stock");
        expect(cheques()?.className).toMatch(/min-h-\[54px\]/);
    });

    it("is the money line when there are no unpaid bills", () => {
        draw(
            home({
                week: week(CHEQUES),
                needGroups: [ORDERS, group("REVIEWS")],
                needGroupsTotal: 8,
            }),
        );
        expect(order()).toEqual(["ORDERS", "CHEQUES", "REVIEWS"]);
    });

    it("says every currency once", () => {
        draw(
            home({
                week: week({
                    ...CHEQUES,
                    totals: [
                        { currency: "INR", amountMinor: 1_400_000 },
                        { currency: "USD", amountMinor: 12_000 },
                    ],
                }),
            }),
        );
        expect(cheques()?.textContent).toMatch(
            /^2 cheques not in the bank · ₹14,000 \+ .*120/,
        );
    });

    it("draws nothing while none waits", () => {
        draw(home({ week: week(null) }));
        expect(cheques()).toBeNull();
        expect(host.querySelector("[data-needs-count]")?.textContent).toBe(
            "24",
        );
    });

    it("draws nothing without money access: no figure is sent", () => {
        draw(home({ week: week(undefined) }));
        expect(cheques()).toBeNull();
        draw(home({ week: null }));
        expect(cheques()).toBeNull();
        expect(text()).not.toContain("cheque");
    });
});
