// @vitest-environment jsdom
/**
 * Customers on React Query (DEC-259), in the browser: a customer's page is
 * mounted over the prefetch without a read; a save that landed reads that
 * page once and nothing else, marking the list, orders, bookings, invoices
 * and Home stale for their next visit; a payment recorded on their Invoices
 * tab does the same (`InvoiceSaveFor`), naming the tab's business.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { CustomerView } from "@/lib/customers/queries";
import {
    customerRead,
    customersAsk,
    customersListRead,
} from "@/lib/customers/queries";
import type { CustomerSave } from "@/lib/customers/use-customers";
import { useCustomer, useCustomerSave } from "@/lib/customers/use-customers";
import type { InvoiceSave } from "@/lib/invoices/use-invoices";
import { InvoiceSaveFor, useInvoiceSave } from "@/lib/invoices/use-invoices";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const VIEW = {
    detail: { contact: { id: "c1", name: "Asha Rao" } },
    thread: null,
    suggestions: [],
    dataRequest: null,
} as unknown as CustomerView;
const LIST_ASK = customersAsk({
    q: "",
    chip: "all",
    sort: null,
    store: null,
    page: 1,
    size: 50,
});
const SEEN = [
    customersListRead.options(ORG, LIST_ASK).queryKey,
    domainKey("orders", ORG, "list", {}),
    domainKey("bookings", ORG, "all", {}),
    domainKey("invoices", ORG, "list", {}),
    domainKey("home", ORG, "home"),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    refresh.mockReset();
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(VIEW), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** The page's prefetch, and the screens this tab saw earlier. */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(
        customerRead.options(ORG, { customerId: "c1" }).queryKey,
        VIEW,
    );
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    for (const key of SEEN) client.setQueryData(key, {});
    return client;
}

function Page({
    report,
}: {
    report: (save: CustomerSave, invoice: InvoiceSave) => void;
}) {
    useCustomer({ customerId: "c1" });
    const save = useCustomerSave();
    return (
        <InvoiceSaveFor saved={save.saved}>
            <Invoice report={(invoice) => report(save, invoice)} />
        </InvoiceSaveFor>
    );
}

function Invoice({ report }: { report: (invoice: InvoiceSave) => void }) {
    report(useInvoiceSave());
    return null;
}

describe("the list's key", () => {
    it("names only what the address says, the page size always", () => {
        expect(LIST_ASK).toEqual({ size: "50" });
        expect(
            customersAsk({
                q: "asha",
                chip: "all",
                sort: "spent",
                store: "st_1",
                page: 2,
                size: 25,
            }),
        ).toEqual({
            q: "asha",
            sort: "spent",
            store: "st_1",
            page: "2",
            size: "25",
        });
    });
});

describe("a save on a customer's page", () => {
    it("reads the page once, nothing else, and marks what names them stale", async () => {
        let save: CustomerSave | undefined;
        let invoice: InvoiceSave | undefined;
        const client = hydrated();
        const { unmount } = renderWithQuery(
            <Page
                report={(s, i) => {
                    save = s;
                    invoice = i;
                }}
            />,
            { client, orgId: ORG },
        );
        await tick();
        // Mounted over the prefetch: no read of its own.
        expect(fetchMock).not.toHaveBeenCalled();
        expect(save?.orgId).toBe(ORG);

        await act(() => save?.saved());
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "/api/customers/c1",
        ]);
        for (const key of SEEN) {
            expect(
                client.getQueryCache().find({ queryKey: key })?.isStale(),
            ).toBe(true);
        }

        // A payment on their Invoices tab: as the tab's business, the
        // page read again, never a page refresh.
        expect(invoice?.orgId).toBe(ORG);
        await act(() => invoice?.saved());
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(refresh).not.toHaveBeenCalled();
        unmount();
    });
});
