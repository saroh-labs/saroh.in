// @vitest-environment jsdom
/**
 * Invoices on React Query, first paint (owner, 25 Nov): the frame (title,
 * New invoice, search, status and Issued) is drawn at once and works before
 * any data; the count, the GST line, the strip and the rows are skeletons,
 * replaced in place as each read lands.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceSummary } from "@/lib/invoices/summary";

vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/billing/invoices",
    };
});
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/components/invoices/details/invoice-details-sheet", () => ({
    InvoiceDetailsSheet: () => null,
}));
vi.mock("@/components/invoices/bulk-remind/bulk-remind-sheet", () => ({
    BulkRemindSheet: () => null,
}));
vi.mock("./row-share", () => ({
    useRowShare: () => ({ open: vi.fn(), loading: null, overlays: null }),
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
vi.mock("@/components/gst-rates/gst-rates-sheet", () => ({
    GstRatesSheet: () => null,
}));

import { InvoicesContainer } from "@/components/invoices/list/invoices-container";
import { renderWithQuery } from "@/lib/query/test-utils";

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
let releaseList: () => void;
let releaseSummary: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(null, "", "/billing/invoices");
    reads.length = 0;
    const list = new Promise<void>((r) => (releaseList = r));
    const sum = new Promise<void>((r) => (releaseSummary = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            const body = url.startsWith("/api/invoices/summary")
                ? (await sum, SUMMARY)
                : (await list,
                  {
                      invoices: [invoice("0105")],
                      truncated: false,
                      paid: null,
                      scope: null,
                  });
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <InvoicesContainer
            canWrite
            tax={{ registered: true, gstin: "29AAGCR4375J1ZU" }}
            timeZone="Asia/Kolkata"
        />,
    );
}

describe("Invoices before its first read", () => {
    it("draws the frame and skeletons, then each region in its place", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Invoices");
        expect(
            host.querySelector('a[href="/billing/invoices/new"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('input[placeholder="Search invoices"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('[aria-label="Invoice status"]'),
        ).not.toBeNull();
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.querySelector('[data-shape="figures"]')).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.querySelector("[data-invoice-row]")).toBeNull();

        // The rows land first: the strip still waits for its own read.
        releaseList();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.querySelector("[data-invoice-row]")).not.toBeNull();
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        expect(host.querySelector('[data-shape="figures"]')).not.toBeNull();

        releaseSummary();
        await tick(50);
        expect(host.querySelector('[data-shape="figures"]')).toBeNull();
        expect(host.querySelector('[data-figure="owed"]')).not.toBeNull();
        unmount();
    });

    it("a search typed before the data keys the read", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { host, unmount } = open();
        await tick();
        const input = host.querySelector<HTMLInputElement>(
            'input[placeholder="Search invoices"]',
        )!;
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!.call(input, "priya");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        act(() => window.dispatchEvent(new PopStateEvent("popstate")));
        await tick();
        vi.useRealTimers();
        expect(window.location.search).toContain("q=priya");
        expect(
            reads.some(
                (u) => u.startsWith("/api/invoices?") && u.includes("q=priya"),
            ),
        ).toBe(true);
        releaseList();
        releaseSummary();
        unmount();
    });
});
