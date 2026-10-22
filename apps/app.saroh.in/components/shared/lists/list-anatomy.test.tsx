import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/orders/list-actions", () => ({ findOrderProducts: vi.fn() }));

import { ClassPacksTabs } from "@/components/class-packs/class-packs-tabs";
import {
    moreFiltersOn,
    OrderAttention,
    OrderDateFilter,
    OrderFilters,
    OrderMoreFilters,
} from "@/components/commerce/orders/order-filters";
import { OrderGridHead } from "@/components/commerce/orders/order-row";
import { OrderStatusFilter } from "@/components/commerce/orders/order-tabs";
import { LevelsPanel } from "@/components/commerce/stock/levels-panel";
import { Chips } from "@/components/customers/detail/parts";
import { Filters } from "@/components/customers/list/filters";
import { Rows } from "@/components/customers/list/rows";
import { INVOICE_GRID, InvoiceRow } from "@/components/invoices/invoice-row";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { SetupChecklist } from "@/components/shared/setup-checklist/setup-checklist";
import {
    CatalogueFilters,
    CatalogueMoreFilters,
    catalogueNarrowed,
    CatalogueSearch,
} from "@/components/stores/catalogue/catalogue-toolbar";
import { StorefrontFilter } from "@/components/stores/locations/storefront-filter";
import { StorefrontList } from "@/components/stores/locations/storefront-list";
import type { CustomersPage } from "@/lib/customers/list";
import { readListQuery as readCustomersQuery } from "@/lib/customers/list";
import { FACT_DOT, joinFacts } from "@/lib/format/join";
import { readOrdersQuery } from "@/lib/orders/list-query";
import { readListQuery as readProductsQuery } from "@/lib/products/list-query";
import type { StockLevels } from "@/lib/stock/service";
import { ListCard, ListRow } from "./list-card";
import { listTable } from "./list-toolbar";

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
const ATTENTION = 'data-slot="list-attention"';

/**
 * `html` with every match of `tag` taken out, again until none is left:
 * one pass can leave a tag that two halves make, which the code scanner
 * refuses (js/incomplete-multi-character-sanitization).
 */
function without(html: string, tag: RegExp): string {
    let out = html;
    for (let before = ""; before !== out;) {
        before = out;
        out = out.replace(tag, "");
    }
    return out;
}
/** Markup's words, with no tag left in them. */
const words = (html: string) => without(html, /<[^>]+>/g);

/** The box of the dropdown with this accessible name, as its tag. */
const box = (markup: string, label: string) =>
    new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(markup)?.[0] ??
    "";
/** What that box says: its chosen option, and a count if it shows one. */
const says = (markup: string, label: string) => {
    const from = markup.indexOf(box(markup, label));
    const to = markup.indexOf("</button>", from);
    return words(without(markup.slice(from, to), /<svg[\s\S]*?<\/svg>/g))
        .replace(/\s+/g, " ")
        .trim();
};

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
    const draw = (chip: CustomersPage["chip"]) =>
        html(
            <Filters
                query={readCustomersQuery({})}
                page={{ ...page, chip }}
                go={noop}
            />,
        );
    const out = draw("returning");

    it("is ONE row: search, who to show, the location, then the sort on the right", () => {
        inOrder(
            out,
            SEARCH,
            FILTERS,
            'aria-label="Show"',
            'aria-label="Location"',
            END,
            'aria-label="Sort"',
        );
        // No second row: nothing is drawn as a chip.
        expect(out).not.toMatch(
            /role="radio"|aria-pressed|data-slot="list-chips"/,
        );
    });

    it("draws every dropdown as the one control, with no size of its own", () => {
        // With nothing narrowed, the three are drawn alike.
        const plain = draw("all");
        const boxes = ["Show", "Location", "Sort"].map((n) =>
            (/class="([^"]*)"/.exec(box(plain, n))?.[1] ?? "")
                .split(" ")
                .sort()
                .join(" "),
        );
        // The same classes, so the same height and the same chevron gap.
        expect(new Set(boxes).size).toBe(1);
        expect(boxes[0].split(" ")).toEqual(
            expect.arrayContaining(["w-auto", "gap-2", "h-[38px]"]),
        );
        expect(boxes[0]).not.toMatch(/\bh-8\b|min-w-\[150px\]/);
    });

    it("the box says what it filters when nothing is narrowed, and the count once something is", () => {
        // Never a bare "All" beside "All locations".
        expect(says(draw("all"), "Show")).toBe("All customers");
        expect(says(out, "Show")).toBe("Returning 9");
        expect(says(out, "Location")).toBe("All locations");
        // Zero is a fact, and is said.
        expect(says(draw("subscribers"), "Show")).toBe("Subscribers 0");
    });

    it("a narrowed filter takes the selected look, and Clear filters ends the row. A sort never does", () => {
        expect(box(out, "Show")).toContain("border-foreground");
        expect(box(out, "Location")).not.toContain("border-foreground");
        expect(box(out, "Sort")).not.toContain("border-foreground");
        inOrder(out, 'aria-label="Location"', 'data-slot="list-clear"', END);
        expect(out).toContain("Clear filters");
        // Nothing narrowed: nothing to clear.
        expect(draw("all")).not.toContain("Clear filters");
        // A search with words in it counts as narrowed.
        const searched = html(
            <Filters
                query={readCustomersQuery({ q: "asha" })}
                page={{ ...page, chip: "all" }}
                go={noop}
            />,
        );
        expect(searched).toContain("Clear filters");
    });

    it("says how many are showing on the right, and under the row where there is no room", () => {
        const counted = html(
            <Filters
                query={readCustomersQuery({})}
                page={page}
                go={noop}
                count="Showing 1 to 50 of 120"
            />,
        );
        // Once, in one element the width places.
        expect(counted.match(/Showing 1 to 50 of 120/g)).toHaveLength(1);
        expect(counted).toMatch(
            /data-slot="list-count"[^>]*>Showing 1 to 50 of 120</,
        );
    });

    it("the placeholder fits the field: what it searches is its description", () => {
        expect(out).toContain('placeholder="Search customers"');
        expect(out).toContain('aria-label="Search customers"');
        expect(out).toContain('aria-description="By name, phone or email"');
        expect(out).toContain("sm:max-w-[320px]");
    });
});

describe("a server-read list with many filters: Orders", () => {
    const query = readOrdersQuery({ tab: "open", late: "true" });

    it("All orders, Open and Refunded are one dropdown with the API's counts", () => {
        const draw = (tab: string) =>
            html(
                <OrderStatusFilter
                    query={readOrdersQuery({ tab })}
                    counts={{ all: 532, open: 3, refunded: 0 }}
                    go={noop}
                />,
            );
        expect(says(draw("all"), "Order status")).toBe("All orders");
        expect(says(draw("open"), "Order status")).toBe("Open 3");
        expect(says(draw("refunded"), "Order status")).toBe("Refunded 0");
        expect(draw("open")).not.toMatch(
            /data-tab-strip|data-count-badge|role="tab"|role="radio"/,
        );
    });

    it("the row holds the three most used (status, date, location): the date is the one dropdown", () => {
        const date = html(
            <OrderDateFilter query={readOrdersQuery({})} go={noop} />,
        );
        expect(says(date, "Date")).toBe("All dates");
        const b = box(date, "Date");
        expect(b).toContain("w-auto");
        expect(b).toContain("h-[38px]");
        expect(b).not.toMatch(/h-\[34px\]|rounded-\[9px\]|text-\[12\.5px\]/);
        // Not narrowed: the plain edge. Narrowed: the selected look.
        expect(b).not.toContain("border-foreground");
        const narrowed = html(
            <OrderDateFilter
                query={readOrdersQuery({ date: "month" })}
                go={noop}
            />,
        );
        expect(box(narrowed, "Date")).toContain("border-foreground");
        expect(says(narrowed, "Date")).toBe("This month");
    });

    it('every other filter is behind Filters, each reading "All …" until narrowed, with the selected look once it is', () => {
        const more = (q: Record<string, string>) =>
            html(
                <OrderMoreFilters
                    query={readOrdersQuery(q)}
                    options={null}
                    go={noop}
                />,
            );
        const plain = more({});
        expect(says(plain, "Payment")).toBe("All payments");
        expect(plain).toContain("All products");
        expect(plain).not.toMatch(/>Any /);
        expect(box(plain, "Payment")).not.toContain("border-foreground");
        // Late is a dropdown here, not a second chip.
        expect(says(plain, "Late")).toBe("On time and late");
        expect(plain).not.toContain("aria-pressed");
        const late = more({ late: "true" });
        expect(says(late, "Late")).toBe("Late only");
        expect(box(late, "Late")).toContain("border-foreground");
        // The Filters button counts only what is behind it.
        expect(moreFiltersOn(readOrdersQuery({}))).toBe(0);
        // The date is in the row, so it is not one of them.
        expect(
            moreFiltersOn(readOrdersQuery({ late: "true", date: "month" })),
        ).toBe(1);
    });

    it("on a phone one sheet holds them all: the date, the rest and the one toggle", () => {
        const sheet = html(
            <OrderFilters query={query} options={null} go={noop} />,
        );
        expect(sheet).toMatch(/role="group"[^>]*aria-label="Filter orders"/);
        for (const name of ["Date", "Payment", "Late"]) {
            expect(box(sheet, name)).not.toBe("");
        }
        expect(sheet.match(/aria-pressed/g)).toHaveLength(1);
        const toggle = html(<OrderAttention query={query} go={noop} />);
        expect(toggle).toMatch(/aria-pressed="false"[^>]*>Needs attention</);
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
    const draw = (show: string, needsYou = 4) =>
        html(
            <LevelsPanel
                levels={levels}
                allStorefronts={levels.storefronts}
                needsYou={needsYou}
                show={show}
                q=""
                href={() => "/commerce/stock"}
                counting={false}
                values={{}}
                onValue={noop}
                paging={{ page: 1, size: 50 }}
            />,
        );
    const out = draw("needs");

    it("is one row: search, the location dropdown, the Needs you toggle, then the table", () => {
        inOrder(
            out,
            SEARCH,
            'aria-label="Location"',
            ATTENTION,
            "data-list-table",
        );
        expect(out).toContain('placeholder="Search stock"');
        expect(out).toContain('aria-description="By product or SKU"');
        expect(out).not.toMatch(/role="radio"|data-slot="list-chips"/);
    });

    it("splits the two ideas: which location is a dropdown, what needs you is the one toggle", () => {
        // Both write ?show=, so one clears the other.
        expect(says(out, "Location")).toBe("All locations");
        expect(out).toMatch(/data-attention-toggle=""[^>]*aria-pressed="true"/);
        const there = draw("s2");
        expect(says(there, "Location")).toBe("Online");
        expect(there).toMatch(
            /data-attention-toggle=""[^>]*aria-pressed="false"/,
        );
        expect(out.match(/data-attention-toggle/g)).toHaveLength(1);
    });

    it('writes "Needs you 4", never "Needs you · 4", in the attention tone while it waits', () => {
        const off = draw("all");
        const toggle =
            /<button[^>]*data-attention-toggle[\s\S]*?<\/button>/.exec(
                off,
            )?.[0];
        expect(words(toggle ?? "")).toBe("Needs you 4");
        expect(toggle).toMatch(/data-count-badge=""[^>]*data-tone="strong"/);
        expect(out).not.toContain("Needs you ·");
        // Nothing waiting: a plain chip, with zero said.
        const none = /<button[^>]*data-attention-toggle[\s\S]*?<\/button>/.exec(
            draw("all", 0),
        )?.[0];
        expect(words(none ?? "")).toBe("Needs you 0");
        expect(none).not.toContain("data-count-badge");
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
    const filters = (q = query) =>
        html(
            <CatalogueFilters
                query={q}
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

    it("the row holds three dropdowns: status, category, location. The collection is behind Filters", () => {
        const out = filters();
        inOrder(
            out,
            'aria-label="Status"',
            'aria-label="Category"',
            'aria-label="Location"',
        );
        expect(out.match(/data-list-filter=""/g)).toHaveLength(3);
        expect(out).not.toContain('aria-label="Collection"');
        const more = (collection?: string) =>
            html(
                <CatalogueMoreFilters
                    query={readProductsQuery(collection ? { collection } : {})}
                    go={go}
                    choices={{ categories: [], collections: [] }}
                />,
            );
        expect(more()).toMatch(/data-more-filters=""[^>]*aria-label="Filters"/);
        expect(more("c1")).toContain('aria-label="Filters, 1 on"');
        // Narrowed: the button takes the selected look.
        expect(
            /<button[^>]*data-more-filters[^>]*>/.exec(more("c1"))?.[0],
        ).toContain("border-foreground");
        // No row of chips, and no "Filter · 2" menu button.
        expect(out).not.toMatch(/role="radio"|Filter ·|aria-haspopup="menu"/);
    });

    it('every unnarrowed filter reads "All {plural}": one way, never "Any"', () => {
        const out = filters(readProductsQuery({}));
        expect(says(out, "Location")).toBe("All locations");
        expect(says(out, "Status")).toBe("All statuses");
        expect(says(out, "Category")).toBe("All categories");
        expect(out).not.toMatch(/>Any /);
        expect(says(filters(), "Status")).toBe("Draft");
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
        expect(out).toMatch(/role="combobox"[^>]*aria-label="Status"/);
    });

    it("knows when it is narrowed, a search with words in it included", () => {
        expect(catalogueNarrowed(readProductsQuery({}))).toBe(false);
        expect(catalogueNarrowed(readProductsQuery({ q: "rye" }))).toBe(true);
        expect(catalogueNarrowed(query)).toBe(true);
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
    const draw = (value: "all" | "open" | "past") =>
        html(
            <Chips
                label="Which orders"
                value={value}
                onChange={noop}
                chips={[
                    { key: "all", label: "All orders", count: 7 },
                    { key: "open", label: "Open", count: 2 },
                    { key: "past", label: "Past" },
                ]}
            />,
        );

    it("is the one dropdown, the count after the label once it is narrowed", () => {
        expect(draw("open")).toMatch(
            /role="combobox"[^>]*aria-label="Which orders"/,
        );
        expect(says(draw("all"), "Which orders")).toBe("All orders");
        expect(says(draw("open"), "Which orders")).toBe("Open 2");
        // A count nobody knows is left out.
        expect(says(draw("past"), "Which orders")).toBe("Past");
        expect(draw("open")).not.toMatch(/Open · 2|aria-pressed|role="radio"/);
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

    // Subscriptions drew a row of its own here until 12 Oct 2026: it is
    // the shared list now (`subscriptions-screen.test.tsx`).
    it("Invoices: one card, a head band over the rows' own columns", () => {
        // The head and every row share the columns, so they line up.
        expect(INVOICE_GRID).toContain("md:grid-cols-[");
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
