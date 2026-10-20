import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A list screen has one anatomy (owner, 11 Oct 2026). Four lists side by
 * side each drew their own toolbar order, search width, tabs or chips,
 * count style and table head; every list in the app was moved onto the
 * shared pieces, and these scans fail when a screen draws its own again:
 *
 *   [view tabs]            `TabStrip`, only for different views of a screen
 *   search · every filter a dropdown · [one attention toggle] ··· sort ·
 *   view switch · count    ONE row: `ListToolbar`, `ListFilter`
 *   the table              `DataView`, or `listTable` and `ListTableHead`
 *
 * There is no row of chips under the toolbar: a status or kind filter is
 * one more dropdown in it.
 *
 * A real exception goes on the list beside its rule, with its reason: the
 * list is the record of what is not on the shared piece.
 * `docs/patterns/frontend-design-system.md` → "A list screen's anatomy".
 */

const APP = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".turbo", ".open-next"]);

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (
            name.endsWith(".tsx") &&
            !/\.(test|spec)\.tsx$/.test(name) &&
            !name.endsWith(".test-kit.tsx")
        ) {
            out.push(full);
        }
    }
    return out;
}

const FILES = ["app", "components"]
    .flatMap((d) => sources(path.join(APP, d)))
    .map((file) => ({
        rel: path.relative(APP, file).split(path.sep).join("/"),
        // Comments describe the old looks; only code is held to the rule.
        code: readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, ""),
    }));

type Allow = Record<string, string>;

/** Files, outside `allow`, that `test` picks out. */
function offenders(
    test: (code: string) => boolean,
    allow: Allow = {},
): string[] {
    return FILES.filter((f) => !(f.rel in allow) && test(f.code)).map(
        (f) => f.rel,
    );
}

/** An allow-list entry that no longer needs its exception should leave. */
function stale(test: (code: string) => boolean, allow: Allow): string[] {
    return Object.keys(allow).filter((rel) => {
        const file = FILES.find((f) => f.rel === rel);
        return !file || !test(file.code);
    });
}

/** Both at once: nothing new breaks the rule, and no exception is stale. */
function hold(why: string, test: (code: string) => boolean, allow: Allow = {}) {
    for (const reason of Object.values(allow)) {
        // An exception without a reason is a rule nobody can review.
        expect(reason.length).toBeGreaterThan(20);
    }
    expect(offenders(test, allow), why).toEqual([]);
    expect(stale(test, allow), "no longer needs its exception").toEqual([]);
}

/** A class string that is a list's head row drawn by hand. */
const HAND_HEAD =
    /(?:["'`\s])label\s[^"'`]*\bborder-b\b|\bborder-b\b[^"'`]*\slabel(?:["'`\s])|^\s*"label[^"]*\bbg-muted\b/m;
const SHARED_TABLE = /\blistTable\.|<ListTableHead\b|<ListCard\b|<DataView\b/;

describe("a list draws the one table", () => {
    it("no head row drawn by hand: the tinted band is listTable's", () => {
        hold(
            "draw the head with ListTableHead or listTable.head (@/components/shared/list-toolbar)",
            (code) => HAND_HEAD.test(code) && !SHARED_TABLE.test(code),
            {
                "components/commerce/orders/order-row.tsx":
                    "the Orders grid: already the band, the 14px gutter and the wash, with a selection column and a step bar of its own (marked data-list-head)",
                "components/crm/enquiry-card.tsx":
                    "a card's title strip over one enquiry's answers, not a list's column names",
                "components/invoices/invoice-paper.tsx":
                    "the invoice as it prints: the paper's own ruled table, never a screen's list",
            },
        );
    });

    it("no <table> by hand: a list is DataView or the listTable classes", () => {
        hold(
            "use DataView, or ListTable with listTable's row classes",
            (code) => /<(?:table|thead)[\s>]/.test(code),
            {
                "components/commerce/orders/order-tickets.tsx":
                    "kitchen tickets as they print on paper: a ruled table per ticket, not a list on a screen",
                "components/commerce/product-page/orders-tab.tsx":
                    "a real <table> for its caption and column headers, drawn with listTable's band and rows",
                "components/insights/busiest-grid.tsx":
                    "Insights' busiest grid as a table (Show as a table): a real <table> so each number is read with its day and time, drawn with listTable's band and rows",
            },
        );
        // The one hand-written table that is a list still takes the look.
        const ordersTab = FILES.find(
            (f) => f.rel === "components/commerce/product-page/orders-tab.tsx",
        );
        expect(ordersTab?.code).toMatch(/listTable\.head/);
        expect(ordersTab?.code).toMatch(/listTable\.row/);
    });

    it("no padded wrapper round a table's rows: the gutter is each row's own", () => {
        // A `px-*` on the box that holds the head and the rows is what
        // insets the row rules from the card's edges (Stock, 10 Oct).
        hold("move the side padding onto the head and each row", (code) =>
            /<(?:div|ul)\s[^>]*className=(?:"[^"]*\bpx-\d[^"]*"|\{cn\([^)]*"[^"]*\bpx-\d)[^>]*>\s*<ListTableHead\b/.test(
                code,
            ),
        );
    });
});

describe("a list draws the one toolbar", () => {
    it("the search sits in the toolbar, at the component's one width", () => {
        hold("pass ListSearch no width: it has one", (code) =>
            /<ListSearch\b(?:(?!\/>)[\s\S])*?className=(?:"[^"]*|\{[^}]*)(?:\bw-|max-w-|min-w-|flex-)/.test(
                code,
            ),
        );
        hold(
            "put ListSearch in ListToolbar's `search` slot (or DataView's `toolbarSearch`)",
            (code) =>
                /<ListSearch\b/.test(code) && !/<ListToolbar\b/.test(code),
            {
                "components/commerce/orders/order-search.tsx":
                    "the Orders search field itself; orders-screen draws it in ListToolbar's search slot",
                "components/invoices/invoice-search.tsx":
                    "the Invoices search field itself; invoices-screen draws it in ListToolbar's search slot",
                "components/stores/catalogue/catalogue-toolbar.tsx":
                    "the Products search field itself; catalogue-screen hands it to DataView's toolbarSearch",
                "components/commerce/product-editor-v2/find-row.tsx":
                    "the product editor's search over a long variants list, inside a section card that has no list toolbar",
            },
        );
    });

    it("no search box of a list's own: a list searches with ListSearch", () => {
        hold(
            "use ListSearch (@saroh/ui/list-search)",
            (code) =>
                /<(?:Input|input)\b[^>]*?(?:type="search"|placeholder="Search [^"]*")/.test(
                    code,
                ),
            {
                "components/commerce/new-order/lines-step.tsx":
                    "New order's product picker, inside the sheet: it finds a product to add as a line",
                "components/qr/qr-target-picker.tsx":
                    "the QR maker's picker for what a code points at, inside its panel",
                "components/commerce/collections/products-picker.tsx":
                    "a picker inside a sheet: it searches the catalogue to add products, with its own results list",
                "components/customers/customer-picker.tsx":
                    "a picker inside a form: it finds one customer to choose, not a list to browse",
                "components/bookings/calendar/header/people-sheet.tsx":
                    "Whose bookings, in header C's picker: it finds one person to show, not a list to browse",
                "components/bookings/sheets/customer-step.tsx":
                    "the booking sheets' customer step (U3): it finds one customer to book, not a list to browse",
            },
        );
    });

    it("a toolbar's dropdown is ListFilter: no hand-sized select beside a search", () => {
        // `size="sm"` and a `w-auto min-w-[…]` of a screen's own is how two
        // filters on one row got two different chevron gaps.
        hold(
            "use ListFilter (or listFilterClass on a select that must stay an OptionSelect)",
            (code) =>
                /<(?:ListToolbar|ListSearch|DataView)\b/.test(code) &&
                /<OptionSelect\b(?:(?!\/>)[\s\S])*?(?:size="sm"|className="[^"]*\b(?:h-\[|h-\d|min-w-\[))/.test(
                    code,
                ),
        );
    });

    it("nothing in a list toolbar is held to its own width on a phone", () => {
        // A row of four buttons in a `shrink-0` box ran 2px past a 412px
        // screen on CI's fonts only. The slots wrap; nothing in them may
        // refuse to shrink.
        hold(
            "let the toolbar's slots wrap: drop shrink-0 from what a slot holds",
            (code) => {
                const slots = code.match(
                    /<ListToolbar\b[\s\S]*?\n\s{0,16}\/>/g,
                );
                return (slots ?? []).some((s) =>
                    /(?<![:\w-])shrink-0\b/.test(s),
                );
            },
        );
    });
});

describe("tabs are views; a status filter is a dropdown in the row", () => {
    /**
     * Every screen that draws tabs, and what its tabs are. A tab opens a
     * different view or sub-page of the screen (other columns, another
     * panel). Narrowing ONE list by status or kind is a `ListFilter`.
     * A new `TabStrip` goes here with what its views are.
     */
    const VIEWS: Allow = {
        "components/class-packs/class-packs-tabs.tsx":
            "Packs and Who holds one: two pages with different columns",
        "components/class-packs/pack-detail/pack-detail.tsx":
            "a pack's sections: Overview, Who has it, Used, Sales, Activity",
        "components/commerce/product-page/tabs.tsx":
            "a product's sections: Overview, Stock, Photos, Reviews and the rest",
        "components/commerce/product-settings/product-settings.tsx":
            "Product settings' sub-pages: Categories, Options, Fields and the rest",
        "components/commerce/stock/stock-screen.tsx":
            "Levels, Log and Checks: three views of stock with different columns",
        "components/customers/detail/header.tsx":
            "a person's sections: Overview, Orders, Bookings and the rest",
        "components/invoices/share-sheet.tsx":
            "Share's ways: WhatsApp, Email, Link and PDF, each its own panel (INVShareA)",
        "components/insights/insights-tabs.tsx":
            "Insights' answers: Overview, Money, What sells, Where customers come from",
        "components/leads/leads-tabs.tsx":
            "Leads and Follow-ups: the leads, and the tasks set on them",
        "components/organizations/organization-settings-form.tsx":
            "Settings › Business's sections on a phone",
        "components/organizations/team-screen.tsx":
            "People and Roles: who is here, and what each role can do",
        "components/sites/editor-chrome.tsx": "the site editor's panels",
        "components/sites/website-header.tsx":
            "Website's sub-pages: Pages, Posts, Forms, Review, Settings",
        "components/stores/products-tabs.tsx":
            "All, Collections, Stock and Reviews: the catalogue, then three other panels",
        "components/stores/storefronts-screen.tsx":
            "a location's settings sections",
        "components/subscriptions/plan-detail/detail-screen.tsx":
            "a plan's sections: Overview, Subscribers, History",
        "components/subscriptions/subscriptions-screen.tsx":
            "Subscribers and Plans: who is subscribed, and what is on sale",
    };
    const drawsTabs = (code: string) => /<TabStrip\b/.test(code);

    it("every tab strip is a set of views, named here", () => {
        hold(
            "tabs are for views; add the screen to VIEWS with what its views are, or use ListFilter for a status filter",
            drawsTabs,
            VIEWS,
        );
    });

    it("no tab is a status: All, Open, Live, Paid and the like are a dropdown", () => {
        // A tab's label is a view's name. A status word as a tab label is
        // a filter of one list.
        const STATUS =
            /(?:label|title):\s*"(?:Open|Closed|Live|Draft|Drafts|Active|Paused|Ended|Scheduled|Archived|Cancelled|Refunded|Paid|Unpaid|Overdue|Won|Lost|Payment failed)"/;
        hold(
            "draw status filters with ListFilter",
            (code) => drawsTabs(code) && STATUS.test(code),
        );
    });

    it("DataView's named subsets have one drawing, and no screen asks for another", () => {
        hold(
            "DataView draws `filters` as one dropdown: there is no filterStyle",
            (code) => /\bfilterStyle\s*=/.test(code),
        );
    });

    it("no row of chips for a filter: every filter is a dropdown in the one row", () => {
        // A list screen is one that draws the toolbar, its dropdown or
        // DataView. On it, a status or kind filter is never a chip.
        const listScreen = (code: string) =>
            /<(?:ListToolbar|ListFilter|LinkFilter|DataView)\b|listFilterClass/.test(
                code,
            );
        hold(
            "make the filter a ListFilter in the toolbar's row",
            (code) =>
                // The chip row itself, and its slots, stay gone.
                /\bFilterChips\b|\btoolbarChips\b/.test(code) ||
                // A link or a button dressed as a filter chip.
                /aria-current=\{[^}]*\}\s*className=\{chipClass\(/.test(code) ||
                (listScreen(code) &&
                    /<(?:Chip|ChipGroup)\b|chipClass\(/.test(code)),
            {
                "components/bookings/bookings-view.tsx":
                    "All bookings (U11): its six views are chips with counts in the toolbar's one row, as the boards the owner signed off on 19 Oct draw them (BKMAllBookings, BKDAllBookings; DEC-170)",
            },
        );
    });

    it("at most three dropdowns in a row: the rest go behind one Filters button", () => {
        // Seven dropdowns wrapped Orders' toolbar onto two lines and left
        // the count on a line of its own. Three, a sort, and MoreFilters.
        hold(
            "keep the three most used in `filters` and put the rest in MoreFilters",
            (code) =>
                (code.match(/<(?:ListFilter|StorefrontFilter)\b/g)?.length ??
                    0) > 4,
        );
    });

    it("a paged list ends with ListPaging: no Previous and Next drawn by hand", () => {
        hold(
            "use ListPaging (@/components/shared/list-toolbar)",
            (code) =>
                />\s*Previous\s*</.test(code) && !/<ListPaging\b/.test(code),
            {
                "components/customers/list/unlinked-sheet.tsx":
                    'a sheet\'s foot, not a list page: small steps beside "Page 2 of 3" while linking customers',
                "components/invoices/details/invoice-details-sheet.tsx":
                    "a record's sheet: Previous and Next walk to the invoice either side, not pages of a list",
            },
        );
    });

    it("at most one attention toggle on a list, and only for what needs the merchant now", () => {
        // The one chip a toolbar may hold: "Needs you 4", "Needs
        // attention". A one-press shortcut, so there is one per list.
        const toggles = (code: string) =>
            code.match(/<AttentionToggle\b/g)?.length ?? 0;
        hold(
            "a list has one attention toggle: make the other a ListFilter",
            (code) => toggles(code) > 1,
        );
        hold(
            'an attention toggle is for "Needs …": anything else is a ListFilter',
            (code) =>
                toggles(code) === 1 &&
                !/<AttentionToggle\b[\s\S]*?label="Needs (?:you|attention)"/.test(
                    code,
                ),
        );
    });

    it('an unnarrowed filter says "All {plural}": never a bare "All", never "Any …"', () => {
        // "All locations" beside "Any category" beside a bare "All" read
        // as three kinds of control. One way, in the thing's own plural.
        hold(
            'name the unnarrowed option "All {things}"',
            (code) =>
                /<(?:ListFilter|LinkFilter)\b|listFilterClass/.test(code) &&
                /label:\s*"(?:Any [a-z][^"]*|All|Everything)"|any="Any /.test(
                    code,
                ),
        );
    });

    it('a search\'s placeholder fits the field: "Search {things}", the rest is its description', () => {
        // At the one width, with the "/" hint showing, about 30
        // characters fit: "…by name, phone or ema" was cut off.
        hold(
            'shorten the placeholder to "Search {things}" and say the rest in `describe`',
            (code) =>
                /<ListSearch\b(?:(?!\/>)[\s\S])*?placeholder="[^"]{29,}"/.test(
                    code,
                ) || /searchPlaceholder="[^"]{29,}"/.test(code),
        );
    });
});

describe("one count style", () => {
    it("no count joined to a filter or a tab by a dot", () => {
        // "Needs you · 4", "Open · 2": the count is the option's quiet
        // number (`count`), or the tab's badge.
        hold(
            "pass the number as `count`",
            (code) =>
                /label:\s*`[A-Z][^`$]* · \$\{[^}]*(?:\.length\b|\b(?:count|needsYou|n)\b|[a-z]Count\b)[^}]*\}`/.test(
                    code,
                ) ||
                /\?\s*`[A-Z][a-z ]+ · \$\{[^}]*(?:\.length\b|\b(?:count|needsYou)\b|[a-z]Count\b)[^}]*\}`\s*:\s*"[A-Z][a-z ]+"/.test(
                    code,
                ),
            {
                "components/sites/editor/top-bar-actions.tsx":
                    "a menu row in the site editor's bar, outside the workspace's lists",
            },
        );
    });

    it("an attention count on a tab says what it means", () => {
        // Dark or red only for "needs you now", and then named, since
        // colour alone tells nobody what a number is for.
        hold(
            'give the tab `countSays` ("need you"), or leave the tone out',
            (code) =>
                code.includes("countTone") &&
                /"(?:strong|danger)"/.test(code) &&
                !code.includes("countSays"),
            {
                "components/class-packs/pack-detail/pack-detail.tsx":
                    'its attention badge is words that say it ("2 running out"), not a bare number',
                "components/commerce/product-page/tabs.tsx":
                    'its attention badges are words that say it ("2 short", "Couldn\'t load")',
            },
        );
    });
});
