import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/stock/screen-actions", () => ({
    loadLevelsPage: vi.fn(),
    loadLogPage: vi.fn(),
}));
vi.mock("@/lib/orders/list-actions", () => ({ findOrderProducts: vi.fn() }));

import { ClassPacksTabs } from "@/components/class-packs/class-packs-tabs";
import {
    OrderFilters,
    OrderToggles,
} from "@/components/commerce/orders/order-filters";
import { OrderGridHead } from "@/components/commerce/orders/order-row";
import { OrderStatusChips } from "@/components/commerce/orders/order-tabs";
import { LevelsPanel } from "@/components/commerce/stock/levels-panel";
import { Chips } from "@/components/customers/detail/parts";
import { Filters } from "@/components/customers/list/filters";
import { Rows } from "@/components/customers/list/rows";
import { INVOICE_GRID, InvoiceRow } from "@/components/invoices/invoice-row";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { listTable } from "@/components/shared/list-toolbar";
import { SetupChecklist } from "@/components/shared/setup-checklist";
import { ViewerDate } from "@/components/shared/viewer-date";
import {
    CatalogueFilters,
    CatalogueSearch,
    CatalogueStatusChips,
} from "@/components/stores/catalogue/catalogue-toolbar";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import { StorefrontList } from "@/components/stores/storefront-list";
import {
    SUBSCRIPTION_COLS,
    SUBSCRIPTION_ROW,
} from "@/components/subscriptions/subscription-row";
import type { CustomersPage } from "@/lib/customers/list";
import { readListQuery as readCustomersQuery } from "@/lib/customers/list";
import { FACT_DOT, joinFacts } from "@/lib/format/join";
import { readOrdersQuery } from "@/lib/orders/list-query";
import { readListQuery as readProductsQuery } from "@/lib/products/list-query";
import type { StockLevels } from "@/lib/stock/service";

/**
 * Each kind of list screen, moved onto the one anatomy (owner, 11 Oct
 * 2026): the toolbar's order, chips against tabs, the one count style, the
 * one table and a time that never wraps. One screen of each kind is drawn
 * here; `list-screens.test.ts` reads the rest of the app for the same.
 */

const html = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const noop = () => undefined;

/** Where each needle starts, in order: fails naming what is out of place. */
function inOrder(markup: string, ...needles: string[]) {
    const at = needles.map((n) => markup.indexOf(n));
    expect(
        at.every((i) => i >= 0),
        `missing: ${needles.filter((_, i) => at[i] < 0).join(", ")}`,
    ).toBe(true);
    expect(at, needles.join(" → ")).toEqual([...at].sort((a, b) => a - b));
}

const SEARCH = 'data-slot="list-search"';
const FILTERS = 'data-slot="list-filters"';
const END = 'data-slot="list-end"';
const CHIPS = 'data-slot="list-chips"';

describe("a server-read list: Customers", () => {
    const page: CustomersPage = {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        everyone: 12,
        counts: { all: 12, returning: 9, subscribers: 0 },
        unlinkedPaying: 0,
        storefronts: [
            { id: "s1", name: "Hill Road" },
            { id: "s2", name: "Online" },
        ],
        sees: { orders: true, spent: true, subscriptions: false },
        sort: "last",
        chip: "returning",
    };
    const out = html(
        <Filters query={readCustomersQuery({})} page={page} go={noop} />,
    );

    it("search, then the location filter, then the sort on the right, then the chips", () => {
        inOrder(out, SEARCH, FILTERS, END, CHIPS);
        // The location is a filter; the sort is pushed to the right.
        expect(out).toMatch(
            new RegExp(
                `${FILTERS}[\\s\\S]*aria-label="Location"[\\s\\S]*${END}`,
            ),
        );
        expect(out).toMatch(new RegExp(`${END}[\\s\\S]*aria-label="Sort"`));
    });

    it("draws both dropdowns as the one control, with no size of its own", () => {
        const boxes = out.match(/<button[^>]*role="combobox"[^>]*>/g) ?? [];
        expect(boxes).toHaveLength(2);
        const [location, sort] = boxes.map((b) =>
            (/class="([^"]*)"/.exec(b)?.[1] ?? "")
                .split(" ")
                .filter((c) => !c.startsWith("data-") && c !== "")
                .sort()
                .join(" "),
        );
        // The same classes, so the same height and the same chevron gap.
        expect(location).toBe(sort);
        expect(location.split(" ")).toEqual(
            expect.arrayContaining(["w-auto", "gap-2", "h-[38px]"]),
        );
        expect(location).not.toMatch(/\bh-8\b|min-w-\[150px\]/);
    });

    it("searches at the one width", () => {
        expect(out).toContain("sm:max-w-[320px]");
        expect(out).not.toContain("sm:max-w-[420px]");
        expect(out).toContain(
            'aria-label="Search customers by name, phone or email"',
        );
    });

    it("draws the chips as a radio group, each count a quiet number, zero included", () => {
        expect(out).toMatch(/role="radiogroup"[^>]*aria-label="Show"/);
        expect(out).toMatch(
            /aria-checked="true"[^>]*>Returning <span data-chip-count=""[^>]*>9</,
        );
        expect(out).toMatch(/>Subscribers <span data-chip-count=""[^>]*>0</);
        expect(out).not.toMatch(/aria-pressed|role="tab"| · \d/);
    });
});

describe("a server-read list with a filter bar: Orders", () => {
    const query = readOrdersQuery({ tab: "open", late: "true" });
    const chips = html(
        <OrderStatusChips
            query={query}
            counts={{ all: 532, open: 3, refunded: 0 }}
            go={noop}
        >
            <OrderToggles query={query} go={noop} />
        </OrderStatusChips>,
    );

    it("All, Open and Refunded are status chips with the API's counts, not tabs", () => {
        expect(chips).toMatch(
            /role="radiogroup"[^>]*aria-label="Order status"/,
        );
        expect(chips).toMatch(/>All <span data-chip-count=""[^>]*>532</);
        expect(chips).toMatch(
            /aria-checked="true"[^>]*>Open <span data-chip-count=""[^>]*>3</,
        );
        expect(chips).toMatch(/>Refunded <span data-chip-count=""[^>]*>0</);
        expect(chips).not.toMatch(/data-tab-strip|data-count-badge|role="tab"/);
    });

    it("the on/off filters follow the status chips in the same row, and say whether they are on", () => {
        inOrder(chips, 'role="radiogroup"', 'aria-label="Only show"');
        expect(chips).toMatch(/aria-pressed="true"[^>]*>Late</);
        expect(chips).toMatch(/aria-pressed="false"[^>]*>Needs attention</);
        // On a phone they are in the Filters sheet, not on the page.
        expect(chips).toMatch(
            /aria-label="Only show"[^>]*class="[^"]*max-\[759px\]:hidden/,
        );
        expect(chips).toContain("Clear filters");
    });

    it("the desk's filter menus are the one dropdown: no height, radius or type of their own", () => {
        const menus = html(
            <OrderFilters query={query} options={null} go={noop} />,
        );
        expect(menus).toMatch(/role="group"[^>]*aria-label="Filter orders"/);
        const boxes =
            menus.match(
                /<button[^>]*role="combobox"[^>]*aria-label="(?:Date|Payment)"[^>]*>/g,
            ) ??
            menus.match(/<button[^>]*aria-label="(?:Date|Payment)"[^>]*>/g) ??
            [];
        expect(boxes.length).toBeGreaterThanOrEqual(2);
        for (const box of boxes) {
            expect(box).toContain("w-auto");
            expect(box).toContain("h-[38px]");
            expect(box).not.toMatch(
                /h-\[34px\]|rounded-\[9px\]|text-\[12\.5px\]/,
            );
        }
        // The toggles moved to the chip row.
        expect(menus).not.toContain("aria-pressed");
    });

    it("the grid's head is the tinted band", () => {
        const head = html(<OrderGridHead money />);
        expect(head).toMatch(/data-list-head=""[^>]*class="[^"]*\blabel\b/);
        expect(head).toContain("bg-muted");
        expect(head).toContain("border-b");
    });
});

describe("a list read a page at a time, with views above it: Stock › Levels", () => {
    const levels: StockLevels = {
        storefronts: [
            { id: "s1", name: "Hill Road" },
            { id: "s2", name: "Online" },
        ],
        rows: [
            {
                productId: "p1",
                productName: "Sourdough loaf",
                variantId: null,
                variantTitle: null,
                sku: null,
                cells: [],
                lastChange: null,
            },
        ],
        untracked: [],
        nextCursor: null,
        timezone: "Asia/Kolkata",
    } as unknown as StockLevels;
    const out = html(
        <LevelsPanel
            levels={levels}
            allStorefronts={levels.storefronts}
            needsYou={4}
            show="needs"
            q=""
            href={() => "/commerce/stock"}
            counting={false}
            values={{}}
            onValue={noop}
            pageSize={50}
        />,
    );

    it("search first, then the chips, then the table", () => {
        inOrder(out, SEARCH, CHIPS, "data-list-table");
        expect(out).toContain('aria-label="Search stock by product or SKU"');
    });

    it('writes "Needs you 4", never "Needs you · 4"', () => {
        expect(out).toMatch(
            /aria-checked="true"[^>]*>Needs you <span data-chip-count=""[^>]*>4</,
        );
        expect(out).not.toContain("Needs you ·");
        // A location's chip is a record's own name: masked in a recording.
        expect(out).toMatch(/data-ph-mask=""[^>]*>Hill Road</);
        expect(out).toMatch(/data-ph-unmask=""[^>]*>All</);
    });

    it("draws the head as the tinted band, and rules its rows edge to edge", () => {
        expect(out).toMatch(
            /data-list-head=""[^>]*class="[^"]*\blabel\b[^"]*\bbg-muted\b/,
        );
        // The gutter is the head's and each row's, never a wrapper's: a
        // padded wrapper is what stopped the rules short of the card.
        const table = out.slice(out.indexOf("data-list-table"));
        const wrapper = /<div class="([^"]*)" style="--levels-cols/.exec(table);
        expect(wrapper?.[1]).not.toMatch(/(^| )px-/);
        expect(table).toMatch(/role="listitem"[^>]*class="[^"]*px-\[14px\]/);
        expect(table).toMatch(/role="listitem"[^>]*class="[^"]*border-b/);
        // The head's fixed words may be read in a session recording. A
        // location's name in it is the business's own, and is masked.
        expect(table).toMatch(/data-list-head=""[^>]*data-ph-unmask=""/);
        expect(table).toMatch(/<span data-ph-mask=""[^>]*>Hill Road<\/span>/);
        expect(table).toMatch(/<span data-ph-mask=""[^>]*>Online<\/span>/);
    });
});

describe("a list filtered on the server through DataView: Products", () => {
    const query = readProductsQuery({ status: "DRAFT" });
    const go = noop;

    it("status is the chip row, with no count where none is known", () => {
        const out = html(<CatalogueStatusChips query={query} go={go} />);
        expect(out).toMatch(/role="radiogroup"[^>]*aria-label="Status"/);
        for (const name of ["All", "Live", "Draft", "Archived"]) {
            expect(out).toContain(`>${name}</button>`);
        }
        expect(out).toMatch(/aria-checked="true"[^>]*>Draft</);
        expect(out).not.toContain("data-chip-count");
    });

    it("location, category and collection are each the one dropdown", () => {
        const out = html(
            <CatalogueFilters
                query={query}
                go={go}
                storefronts={{
                    everywhere: 12,
                    byStorefront: [
                        { id: "s1", name: "Hill Road", count: 9 },
                        { id: "s2", name: "Online", count: 7 },
                    ],
                }}
                choices={{
                    categories: [{ id: "c1", name: "Bread" }],
                    collections: [],
                }}
            />,
        );
        for (const name of ["Location", "Category", "Collection"]) {
            expect(out).toMatch(
                new RegExp(`role="combobox"[^>]*aria-label="${name}"`),
            );
        }
        expect(out.match(/data-list-filter=""/g)).toHaveLength(3);
        // No "Filter · 2" menu button with a count joined by a dot.
        expect(out).not.toMatch(/Filter ·|aria-haspopup="menu"/);
    });

    it("a list of choices that couldn't be read says so, with Try again, in the filter's place", () => {
        const out = html(
            <CatalogueFilters
                query={query}
                go={go}
                storefronts={{ everywhere: 3, byStorefront: [] }}
                choices={{ categories: null, collections: [] }}
            />,
        );
        expect(out).toContain("Couldn't load categories");
        expect(out).toContain("Try again");
        expect(out).toMatch(/role="combobox"[^>]*aria-label="Collection"/);
    });

    it("the search is the one field", () => {
        const out = html(<CatalogueSearch query={query} go={go} />);
        expect(out).toContain('aria-label="Search products"');
        expect(out).toContain("sm:max-w-[320px]");
    });
});

describe("the location filter, wherever a business-wide list offers it", () => {
    const out = html(
        <StorefrontFilter
            stores={[
                { id: "s1", name: "Hill Road" },
                { id: "s2", name: "Online" },
            ]}
            countFor={() => 3}
            total={6}
            value="s2"
            onChange={noop}
            noun={{ one: "open order", other: "open orders" }}
            note="A filter, not a scope."
        />,
    );

    it("is the toolbar's dropdown, named Location, masked in a recording", () => {
        expect(out).toMatch(/role="combobox"[^>]*aria-label="Location"/);
        expect(out).toMatch(/data-list-filter=""[^>]*data-ph-mask=""/);
        // Not a menu button of its own any more.
        expect(out).not.toContain('aria-haspopup="menu"');
        expect(out).not.toContain("Location filter:");
    });
});

describe("views are tabs: Class packs", () => {
    it("Packs and Who holds one are links on the tab strip, not a segmented switch", () => {
        const out = html(<ClassPacksTabs current="holders" />);
        expect(out).toContain("data-tab-strip");
        expect(out).toContain('<nav aria-label="Class packs"');
        const link = (name: string) =>
            new RegExp(`<a[^>]*>${name}</a>`).exec(out)?.[0] ?? "";
        expect(link("Who holds one")).toContain('aria-current="page"');
        expect(link("Who holds one")).toContain(
            'href="/class-packs/purchases"',
        );
        expect(link("Packs")).toContain('href="/class-packs"');
        expect(link("Packs")).not.toContain("aria-current");
        expect(out).not.toContain("data-segmented");
    });
});

describe("a record's tab that narrows one list: Customer Detail", () => {
    const out = html(
        <Chips
            label="Which orders"
            value="open"
            onChange={noop}
            chips={[
                { key: "all", label: "All", count: 7 },
                { key: "open", label: "Open", count: 2 },
                { key: "past", label: "Past" },
            ]}
        />,
    );

    it("is the chip row, with the count after the label", () => {
        expect(out).toMatch(/role="radiogroup"[^>]*aria-label="Which orders"/);
        expect(out).toMatch(
            /aria-checked="true"[^>]*>Open <span data-chip-count=""[^>]*>2</,
        );
        expect(out).toMatch(/>All <span data-chip-count=""[^>]*>7</);
        expect(out).toContain(">Past</button>");
        expect(out).not.toMatch(/All · 7|Open · 2|aria-pressed/);
    });
});

describe("a hand-built table takes the one look", () => {
    it("Customers: the head band, and rows ruled edge to edge that press as a whole", () => {
        const page = {
            rows: [
                {
                    contactId: "c1",
                    name: "Asha Rao",
                    email: "asha.rao@example.com",
                    phone: null,
                    signsIn: false,
                    possibleDuplicate: false,
                    offers: false,
                    addedByHand: false,
                    attention: [],
                    hiddenSensitiveCount: 0,
                    orders: {
                        count: 3,
                        open: 0,
                        lastAt: null,
                        lastStorefront: null,
                    },
                    spent: [],
                },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
            everyone: 1,
            counts: { all: 1 },
            unlinkedPaying: 0,
            sees: { orders: true, spent: true, subscriptions: false },
            sort: "last",
            chip: "all",
        } as unknown as CustomersPage;
        const out = html(<Rows page={page} empty={null} />);
        expect(out).toMatch(
            /data-list-table=""[^>]*class="[^"]*overflow-hidden/,
        );
        expect(out).toMatch(
            /data-list-head=""[^>]*class="[^"]*\blabel\b[^"]*\bbg-muted\b/,
        );
        const tag = /<a[^>]*href="\/contacts\/c1"[^>]*>/.exec(out)?.[0] ?? "";
        const row = /class="([^"]*)"/.exec(tag);
        expect(row?.[1].split(" ")).toEqual(
            expect.arrayContaining([
                "border-b",
                "last:border-b-0",
                "px-[14px]",
                "py-[11px]",
                "hover:bg-foreground/[0.035]",
                "active:bg-foreground/[0.07]",
                "focus-visible:ring-2",
            ]),
        );
        // Figures: right-aligned, tabular.
        expect(out).toMatch(
            /class="[^"]*text-right[^"]*tabular-nums[^"]*"[^>]*>3</,
        );
    });

    it("Invoices and Subscriptions: one card, a head band over the rows' own columns", () => {
        // The head and every row share the columns, so they line up.
        expect(INVOICE_GRID).toContain("md:grid-cols-[");
        expect(SUBSCRIPTION_ROW).toContain("flex");
        expect(SUBSCRIPTION_COLS.price.split(" ")).toEqual(
            expect.arrayContaining(["text-right", "tabular-nums"]),
        );
        const row = html(
            <InvoiceRow
                invoice={
                    {
                        id: "i1",
                        number: "INV-0020",
                        status: "ISSUED",
                        standing: "ISSUED",
                        kind: "INVOICE",
                        related: null,
                        corrections: [],
                        order: null,
                        contact: {
                            id: "c1",
                            name: "Asha Rao",
                            email: "asha.rao@example.com",
                        },
                        billTo: {
                            name: "Asha Rao",
                            email: "asha.rao@example.com",
                        },
                        currency: "INR",
                        subtotal: "1200.00",
                        tax: "0.00",
                        total: "1200.00",
                        issuedAt: "2026-09-10T00:00:00.000Z",
                        dueAt: "2026-09-24T00:00:00.000Z",
                        paidAt: null,
                        voidedAt: null,
                        voidReason: null,
                        payment: null,
                        source: "MANUAL",
                        subscriptionId: null,
                        periodStart: null,
                        periodEnd: null,
                        courseEnrollmentId: null,
                        packPurchaseId: null,
                        reissuedFromId: null,
                        reissuedAsId: null,
                        issuedAutomatically: false,
                        lines: [],
                    } as never
                }
                selected
                onOpen={noop}
            />,
        );
        const cls = /<button[^>]*class="([^"]*)"/.exec(row)?.[1].split(" ");
        // A row inside the card: no border or corners of its own.
        expect(cls).toEqual(
            expect.arrayContaining(["px-[14px]", "py-[11px]", "w-full"]),
        );
        expect(cls).not.toContain("border");
        expect(cls?.some((c) => c.startsWith("rounded"))).toBe(false);
        // The open row: a fill and an Ink edge.
        expect(cls).toContain("bg-muted");
        expect(listTable.rule.split(" ")).toEqual(
            expect.arrayContaining(["border-b", "last:border-b-0"]),
        );
    });

    it("ListCard (Providers, Notifications, Website pages): the same band and gutter", () => {
        const out = html(
            <ListCard main="Page" end="Updated">
                <li>
                    <ListRow title="Home" end="Today" />
                </li>
            </ListCard>,
        );
        expect(out).toMatch(
            /data-list-head=""[^>]*class="[^"]*\blabel\b[^"]*\bbg-muted\b[^"]*px-\[14px\]/,
        );
        expect(out).toMatch(/class="[^"]*px-\[14px\] py-\[11px\]/);
        expect(out).not.toContain("px-[18px]");
    });

    it("the locations list: its heading is the band", () => {
        const out = html(
            <StorefrontList
                storefronts={
                    [
                        {
                            id: "s1",
                            name: "Hill Road",
                            kind: "SHOP",
                            orderCount: 4,
                            paused: false,
                        },
                        {
                            id: "s2",
                            name: "Online",
                            kind: "ONLINE",
                            orderCount: 0,
                            paused: false,
                        },
                    ] as never
                }
                selectedId="s1"
                notTakingOrders={[]}
            />,
        );
        expect(out).toMatch(
            /class="[^"]*\blabel\b[^"]*\bbg-muted\b[^"]*"[^>]*>2 locations/,
        );
        // The app's own words for the two kinds of location.
        expect(out).toMatch(/Hill Road[\s\S]*Customers visit/);
        expect(out).toMatch(/Online[\s\S]*No counter/);
        // An online-only location is never called a place customers visit.
        const online = out.slice(out.indexOf(">Online<"));
        expect(online).not.toContain("Customers visit");
    });
});

describe("no separator leads or trails", () => {
    it("joins facts with a dot held to the words either side", () => {
        expect(joinFacts("2 of 4 done", "Sells in person only")).toBe(
            `2 of 4 done${FACT_DOT}Sells in person only`,
        );
        // No-break spaces: a wrapped line can't start or end with the dot.
        expect(FACT_DOT).toBe(" · ");
    });

    it.each([
        [["2 of 4 done", undefined], "2 of 4 done"],
        [[undefined, "Sells in person only"], "Sells in person only"],
        [["", "Sells in person only"], "Sells in person only"],
        [["2 of 4 done", null, false, "  "], "2 of 4 done"],
        [[null, undefined, ""], ""],
        [["a", "", "b", null, "c"], `a${FACT_DOT}b${FACT_DOT}c`],
    ] as const)("leaves out what is missing: %j", (facts, expected) => {
        const joined = joinFacts(...facts);
        expect(joined).toBe(expected);
        expect(joined.trim().startsWith("·")).toBe(false);
        expect(joined.trim().endsWith("·")).toBe(false);
        expect(joined).not.toMatch(/·\s*·/);
    });

    it('a location\'s readiness card joins its note to the count: no loose "· Sells in person only"', () => {
        const out = html(
            <SetupChecklist
                name="location"
                title="Get ready for the counter"
                doneTitle="Ready for the counter."
                note="Sells in person only"
                rows={[
                    {
                        key: "address",
                        label: "Address on receipts",
                        done: true,
                    },
                    {
                        key: "hours",
                        label: "Save its opening hours",
                        done: false,
                        action: { label: "Set hours", onPress: noop },
                    },
                ]}
            />,
        );
        // One run of words in one element, the dot between two of them.
        expect(out).toContain(
            `>1 of 2 done${FACT_DOT}Sells in person only</span>`,
        );
        // No element starts with the separator, so none can lead a line.
        expect(out).not.toMatch(/>\s*·/);
        expect(out).not.toMatch(/·\s*</);
    });

    it("says nothing extra when there is no note", () => {
        const out = html(
            <SetupChecklist
                name="location"
                title="Get ready for the counter"
                doneTitle="Ready for the counter."
                rows={[
                    {
                        key: "hours",
                        label: "Save its opening hours",
                        done: false,
                        action: { label: "Set hours", onPress: noop },
                    },
                ]}
            />,
        );
        expect(out).toContain(">0 of 1 done</span>");
        expect(out).not.toContain("·");
    });
});

describe("a time never wraps", () => {
    const iso = "2026-10-05T07:00:00.000Z";

    it.each(["time", "datetime", "moment", "recent"] as const)(
        "ViewerDate %s is one line",
        (variant) => {
            const out = html(
                <ViewerDate
                    iso={iso}
                    variant={variant}
                    timeZone="Asia/Kolkata"
                />,
            );
            expect(out).toMatch(/<time[^>]*class="[^"]*whitespace-nowrap/);
        },
    );

    it("keeps the caller's own classes beside it", () => {
        const out = html(
            <ViewerDate
                iso={iso}
                variant="recent"
                timeZone="Asia/Kolkata"
                className="text-muted-foreground"
            />,
        );
        expect(out).toMatch(
            /class="[^"]*whitespace-nowrap[^"]*text-muted-foreground/,
        );
    });

    it("leaves a plain date free to sit in a sentence", () => {
        const out = html(
            <ViewerDate iso={iso} variant="short" timeZone="Asia/Kolkata" />,
        );
        expect(out).not.toContain("whitespace-nowrap");
    });

    it("a table's time cell is one line, in a column wide enough for it", () => {
        expect(listTable.time).toContain("whitespace-nowrap");
        // "12:30 pm" is about 58px at 13.5px Geist: 68px holds it.
        const width = Number(/w-\[(\d+)px\]/.exec(listTable.timeCol)?.[1]);
        expect(width).toBeGreaterThanOrEqual(64);
    });
});
