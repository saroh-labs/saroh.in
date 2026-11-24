// @vitest-environment jsdom
/**
 * Invoices on React Query (DEC-259), in the browser: the first load reads
 * the list, the strip and the invoice once each (nothing comes with the
 * page's HTML); what was already read is mounted over without a read; a status or source pick reads nothing, a
 * search is a new list key; a payment that landed reads the list, the strip
 * and the invoice open once each, Home only marked stale; a refused one
 * reads nothing. Outside Invoices (a customer's page) a write names no
 * business and the page is read again, as before.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { InvoicesListView } from "@/lib/invoices/queries";
import {
    invoiceRead,
    invoicesAsk,
    invoicesListRead,
    invoicesSummaryRead,
} from "@/lib/invoices/queries";
import type { InvoiceSummary } from "@/lib/invoices/summary";
import type { InvoiceSave } from "@/lib/invoices/use-invoices";
import {
    InvoiceSaveProvider,
    useInvoice,
    useInvoiceSave,
    useInvoicesList,
    useInvoicesSummary,
} from "@/lib/invoices/use-invoices";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const LIST: InvoicesListView = {
    invoices: [],
    truncated: false,
    paid: null,
    scope: null,
};
const SUMMARY = {
    owed: { total: "0.00", count: 0 },
} as unknown as InvoiceSummary;
const DETAILS = { invoice: { id: "inv_1" } };
const ALL = invoicesAsk({});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reads = (path: string) =>
    fetchMock.mock.calls.filter(
        ([url]) =>
            typeof url === "string" &&
            (url === path || url.startsWith(`${path}?`)),
    ).length;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    refresh.mockReset();
    fetchMock = vi.fn<typeof fetch>((url) => {
        const path = typeof url === "string" ? url : "";
        const body = path.startsWith("/api/invoices/summary")
            ? SUMMARY
            : path.startsWith("/api/invoices/inv_1")
              ? DETAILS
              : LIST;
        return Promise.resolve(
            new Response(JSON.stringify(body), { status: 200 }),
        );
    });
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser client that has already read them (an earlier visit). */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(invoicesListRead.options(ORG, ALL).queryKey, LIST);
    server.setQueryData(invoicesSummaryRead.options(ORG, {}).queryKey, SUMMARY);
    server.setQueryData(
        invoiceRead.options(ORG, { invoiceId: "inv_1" }).queryKey,
        DETAILS as never,
    );
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    // Home, seen earlier in this tab.
    client.setQueryData(domainKey("home", ORG, "home"), {});
    return client;
}

/** The list with an invoice's side sheet open, as the screen mounts them. */
function Screen({
    ask,
    report,
}: {
    ask: typeof ALL;
    report: (save: InvoiceSave) => void;
}) {
    useInvoicesList(ask);
    useInvoicesSummary();
    useInvoice({ invoiceId: "inv_1" });
    report(useInvoiceSave());
    return null;
}

function Save({ report }: { report: (save: InvoiceSave) => void }) {
    report(useInvoiceSave());
    return null;
}

describe("the list's key", () => {
    it("is what the API is asked: a status or a source reads nothing new", () => {
        expect(ALL).toEqual({});
        expect(invoicesAsk({ tab: "paid", source: "orders" })).toEqual({});
        expect(invoicesAsk({ view: "owed" })).toEqual({});
        expect(invoicesAsk({ view: "cheques" })).toEqual({ view: "cheques" });
        expect(
            invoicesAsk({ q: " 0106 ", date: "custom", from: "2026-11-01" }),
        ).toEqual({ q: "0106", date: "custom", from: "2026-11-01" });
        // A pack wins over a course, as the page reads them.
        expect(invoicesAsk({ pack: "p1", course: "c1" })).toEqual({
            pack: "p1",
        });
    });
});

describe("the list's reads", () => {
    it("first load reads the list, the strip and the invoice once each", async () => {
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client: makeTestClient(), orgId: ORG },
        );
        await tick();
        expect(reads("/api/invoices")).toBe(1);
        expect(reads("/api/invoices/summary")).toBe(1);
        expect(reads("/api/invoices/inv_1")).toBe(1);
        unmount();
    });

    it("what was already read is mounted over without a read", async () => {
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client: hydrated(), orgId: ORG },
        );
        await tick();
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("a search reads that list, and not the strip again", async () => {
        const client = hydrated();
        const view = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client, orgId: ORG },
        );
        await tick();
        view.unmount();
        const again = renderWithQuery(
            <Screen
                ask={invoicesAsk({ q: "0106" })}
                report={() => undefined}
            />,
            { client, orgId: ORG },
        );
        await tick();
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "/api/invoices?q=0106",
        ]);
        again.unmount();
    });
});

describe("a save on Invoices", () => {
    it("names the tab's business, reads the list, strip and invoice once each, marks Home stale", async () => {
        let save: InvoiceSave | undefined;
        const client = hydrated();
        const { unmount } = renderWithQuery(
            <InvoiceSaveProvider>
                <Screen ask={ALL} report={(s) => (save = s)} />
            </InvoiceSaveProvider>,
            { client, orgId: ORG },
        );
        await tick();
        expect(save?.orgId).toBe(ORG);
        await act(() => save?.saved());
        expect(reads("/api/invoices")).toBe(1);
        expect(reads("/api/invoices/summary")).toBe(1);
        expect(reads("/api/invoices/inv_1")).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(
            client
                .getQueryCache()
                .find({ queryKey: domainKey("home", ORG, "home") })
                ?.isStale(),
        ).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
        unmount();
    });
});

describe("a save outside Invoices (a customer's page)", () => {
    it("names no business and reads the page again", async () => {
        let save: InvoiceSave | undefined;
        const { unmount } = renderWithQuery(
            <Save report={(s) => (save = s)} />,
            { client: hydrated(), orgId: ORG },
        );
        expect(save?.orgId).toBeUndefined();
        await act(() => save?.saved());
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});
