// @vitest-environment jsdom
/**
 * The Invoices list (DEC-173, U8 #1120, INVListAC): the search goes into
 * the address, each figure of the strip is a filter, the cheques view
 * shows the cheques, and the states are told apart: no invoices yet, a
 * search that found none, totals that couldn't be read (the list still
 * loads) and a role without money (counts only). The overdue banner is
 * gone: the strip says it.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { ListQuery } from "@/lib/invoices/list-view";
import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceSummary } from "@/lib/invoices/summary";

import { InvoicesScreen } from "./invoices-screen";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/billing/invoices",
    useSearchParams: () => new URLSearchParams(search),
}));
// The quick look has its own tests: here it is only which invoice it opens
// on, which is the seam U9's details sheet takes over.
vi.mock("@/components/invoices/invoice-quick-look", () => ({
    InvoiceQuickLook: ({ invoice }: { invoice: { number: string } | null }) =>
        invoice ? (
            <div role="dialog" data-quick-look="">
                {invoice.number}
            </div>
        ) : null,
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
vi.mock("@/components/gst-rates/gst-rates-sheet", () => ({
    GstRatesSheet: () => null,
}));

const DAY = 86_400_000;
const NOW = Date.now();

function invoice(id: string, over: Partial<Invoice> = {}): Invoice {
    return {
        id,
        number: `RC/26-27/${id}`,
        status: "ISSUED",
        standing: "ISSUED",
        kind: "INVOICE",
        related: null,
        corrections: [],
        order: null,
        contact: {
            id: `c_${id}`,
            name: "Vivek Nair",
            email: "vivek@example.com",
        },
        billTo: { name: "Vivek Nair", email: "vivek@example.com" },
        currency: "INR",
        subtotal: "8400.00",
        tax: "0.00",
        total: "8400.00",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
        partlyPaid: false,
        chequeWaiting: false,
        issuedAt: new Date(NOW - 28 * DAY).toISOString(),
        dueAt: new Date(NOW + 5 * DAY).toISOString(),
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
        createdAt: new Date(NOW - 28 * DAY).toISOString(),
        updatedAt: new Date(NOW - 28 * DAY).toISOString(),
        summary: { description: "Sourdough loaf", quantity: 1, lineCount: 1 },
        ...over,
    };
}

const DUE = invoice("0105", {
    contact: { id: "c_p", name: "Priya Raman", email: "priya@example.com" },
    billTo: { name: "Priya Raman", email: "priya@example.com" },
});
const LATE = invoice("0106", {
    standing: "OVERDUE",
    // 12 days and some hours ago: "13 days late", counted in whole days.
    dueAt: new Date(NOW - 13 * DAY + 3_600_000).toISOString(),
});
const PAID = invoice("0101", {
    status: "PAID",
    standing: "PAID",
    paidAt: new Date(NOW - DAY).toISOString(),
    leftToPay: "0.00",
    paidSoFar: "8400.00",
    contact: { id: "c_a", name: "Arjun Mehta", email: "arjun@example.com" },
    billTo: { name: "Arjun Mehta", email: "arjun@example.com" },
});
const DRAFT = invoice("d1", {
    number: null,
    status: "DRAFT",
    standing: "DRAFT",
    issuedAt: null,
    billTo: null,
    contact: { id: "c_t", name: "Tara Pillai", email: "tara@example.com" },
});

const inr = (amountMinor: number) => [{ currency: "INR", amountMinor }];
const SUMMARY: InvoiceSummary = {
    zone: "Asia/Kolkata",
    monthStart: "2026-10-01",
    money: true,
    owed: { count: 2, totals: inr(1_680_000), filter: { view: "owed" } },
    overdue: { count: 1, totals: inr(840_000), filter: { view: "overdue" } },
    paidThisMonth: {
        count: 1,
        totals: inr(840_000),
        filter: { paidFrom: "2026-10-01" },
    },
    drafts: { count: 1, totals: inr(840_000), filter: { view: "draft" } },
    chequesWaiting: null,
};
const ALL: ListQuery = {
    tab: "all",
    owed: false,
    cheques: false,
    paidFrom: null,
    q: "",
};

const s = stage();
beforeEach(() => {
    search = "";
    s.mount();
});
afterEach(() => {
    s.unmount();
    vi.clearAllMocks();
});

function show(over: Partial<Parameters<typeof InvoicesScreen>[0]> = {}): void {
    s.render(
        <InvoicesScreen
            invoices={[DUE, LATE, PAID, DRAFT]}
            canWrite
            businessName="Rye & Co."
            tax={{ registered: true, gstin: "29AAGCR4375J1ZU" }}
            query={ALL}
            timeZone="Asia/Kolkata"
            summary={SUMMARY}
            {...over}
        />,
    );
}

const rows = () =>
    Array.from(
        document.querySelectorAll<HTMLElement>("[data-invoice-row]"),
    ).map((r) => r.dataset.invoiceRow);
const figure = (key: string) =>
    document.querySelector<HTMLButtonElement>(`[data-figure="${key}"]`);
const lastAddress = () => replace.mock.calls.at(-1)?.[0] as string | undefined;

describe("InvoicesScreen: the strip's figures are filters", () => {
    it("shows every invoice, with the money said once: no overdue banner", () => {
        show();
        expect(rows()).toEqual(["0105", "0106", "0101", "d1"]);
        expect(s.text()).not.toContain("Show them");
        expect(s.text()).not.toContain("owed to you ·");
    });

    it("Overdue lists only the late ones at once, marks itself on and keeps the address", () => {
        show();
        act(() => figure("overdue")?.click());
        expect(rows()).toEqual(["0106"]);
        expect(figure("overdue")?.getAttribute("aria-pressed")).toBe("true");
        expect(lastAddress()).toBe("/billing/invoices?tab=overdue");
    });

    it("Owed lists what is issued and unpaid, late ones included", () => {
        show();
        act(() => figure("owed")?.click());
        expect(rows()).toEqual(["0105", "0106"]);
        expect(lastAddress()).toBe("/billing/invoices?view=owed");
    });

    it("Drafts and Paid this month ask for their own filters", () => {
        show();
        act(() => figure("drafts")?.click());
        expect(rows()).toEqual(["d1"]);
        expect(lastAddress()).toBe("/billing/invoices?tab=draft");
        act(() => figure("paid")?.click());
        expect(lastAddress()).toBe("/billing/invoices?paidFrom=2026-10-01");
    });

    it("pressed again, a figure shows every invoice", () => {
        search = "tab=overdue";
        show({ query: { ...ALL, tab: "overdue" } });
        expect(figure("overdue")?.getAttribute("aria-pressed")).toBe("true");
        act(() => figure("overdue")?.click());
        expect(rows()).toEqual(["0105", "0106", "0101", "d1"]);
        expect(lastAddress()).toBe("/billing/invoices");
    });
});

describe("InvoicesScreen: search", () => {
    it("puts the term in the address once typing stops, keeping the filter", () => {
        search = "tab=due";
        show({ query: { ...ALL, tab: "due" } });
        const field = document.querySelector<HTMLInputElement>(
            'input[type="search"]',
        );
        expect(field?.placeholder).toBe("Search invoices");
        s.type(field, "0106");
        act(() => {
            field?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });
        expect(lastAddress()).toBe("/billing/invoices?tab=due&q=0106");
    });

    it("a search that found nothing says so, with Clear search, never 'No invoices yet'", () => {
        search = "q=zzz";
        show({ invoices: [], query: { ...ALL, q: "zzz" } });
        expect(s.text()).toContain("No invoices match “zzz”");
        expect(s.text()).not.toContain("No invoices yet");
        s.press("Clear search");
        expect(lastAddress()).toBe("/billing/invoices");
    });
});

describe("InvoicesScreen: states", () => {
    it("a business with no invoices yet is invited to write one", () => {
        show({ invoices: [] });
        expect(s.text()).toContain("No invoices yet");
        const links = Array.from(document.querySelectorAll("a")).filter(
            (a) => a.getAttribute("href") === "/billing/invoices/new",
        );
        // The header's and the empty state's.
        expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it("totals that couldn't be read say so, and the list still loads", () => {
        show({ summary: null });
        expect(s.text()).toContain("Couldn't load totals");
        expect(s.text()).not.toContain("₹0");
        expect(rows()).toEqual(["0105", "0106", "0101", "d1"]);
    });

    it("a filter that leaves nothing says what, with the way back", () => {
        search = "view=owed";
        show({ invoices: [PAID, DRAFT], query: { ...ALL, owed: true } });
        expect(s.text()).toContain("No invoices owed to you");
        s.press("Show all invoices");
        expect(lastAddress()).toBe("/billing/invoices");
    });

    it("a role without money sees counts in the strip, no amounts", () => {
        show({
            canWrite: false,
            summary: {
                ...SUMMARY,
                money: false,
                owed: { count: 2, filter: { view: "owed" } },
                overdue: { count: 1, filter: { view: "overdue" } },
                paidThisMonth: {
                    count: 1,
                    filter: { paidFrom: "2026-10-01" },
                },
                drafts: { count: 1, filter: { view: "draft" } },
            },
        });
        const strip = document.querySelector("[data-money-strip]");
        expect(strip?.textContent).not.toContain("₹");
        expect(figure("owed")?.textContent).toBe("Owed to you2invoices");
        // No New invoice for a role that can't write.
        expect(
            document.querySelector('a[href="/billing/invoices/new"]'),
        ).toBeNull();
    });
});

describe("InvoicesScreen: the cheques view", () => {
    const WAITING = invoice("0110", {
        status: "PAID",
        standing: "PAID",
        chequeWaiting: true,
        leftToPay: "0.00",
        paidSoFar: "8400.00",
        paidAt: new Date(NOW - DAY).toISOString(),
    });
    const WITH_CHEQUES: InvoiceSummary = {
        ...SUMMARY,
        chequesWaiting: {
            count: 1,
            totals: inr(840_000),
            filter: { view: "cheques" },
        },
    };

    it("draws the line while a cheque waits, and filters to it", () => {
        show({ invoices: [DUE, WAITING], summary: WITH_CHEQUES });
        const line = document.querySelector<HTMLButtonElement>(
            "[data-cheques-line]",
        );
        expect(line?.textContent).toBe("Cheques not in the bank · 1 · ₹8,400");
        act(() => line?.click());
        expect(rows()).toEqual(["0110"]);
        expect(lastAddress()).toBe("/billing/invoices?view=cheques");
    });

    it("Home's link opens the cheques, the line on, each row saying its cheque", () => {
        search = "view=cheques";
        show({
            invoices: [WAITING],
            summary: WITH_CHEQUES,
            query: { ...ALL, cheques: true },
        });
        expect(
            document
                .querySelector("[data-cheques-line]")
                ?.getAttribute("aria-pressed"),
        ).toBe("true");
        expect(rows()).toEqual(["0110"]);
        expect(s.text()).toContain("Paid · cheque not in the bank");
    });

    it("no line while none waits", () => {
        show();
        expect(document.querySelector("[data-cheques-line]")).toBeNull();
    });
});

describe("InvoicesScreen: rows", () => {
    it("the phone's row says which one and how late, in one short line", () => {
        show({ invoices: [LATE] });
        const row = document.querySelector('[data-invoice-row="0106"]');
        // "0106 · 13 days late" to the eye: the number's tail, then how
        // late; the whole number is said to a screen reader.
        const tail = row?.querySelector(".font-mono[aria-hidden]");
        expect(tail?.textContent).toBe("0106");
        expect(tail?.parentElement?.textContent).toBe(
            "0106RC/26-27/0106 · 13 days late, Written by hand",
        );
        // What it was for is still told to a screen reader on a phone.
        expect(row?.textContent).toContain("Written by hand");
    });

    it("a row opens the invoice's quick look (U9's sheet next)", () => {
        show({ invoices: [LATE] });
        const row = document.querySelector<HTMLButtonElement>(
            '[data-invoice-row="0106"]',
        );
        expect(row?.getAttribute("aria-haspopup")).toBe("dialog");
        act(() => row?.click());
        expect(row?.className).toContain("bg-muted");
        expect(document.querySelector("[data-quick-look]")?.textContent).toBe(
            "RC/26-27/0106",
        );
    });
});
