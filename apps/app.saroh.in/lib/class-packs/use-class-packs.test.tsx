// @vitest-environment jsdom
/**
 * Class packs on React Query (DEC-259), in the browser: a pack write
 * (sold, extended, archived, published) reads what is on screen once — the
 * pack's page, or a customer's page where the sell and extend dialogs also
 * open — and marks the rest of Class packs, Invoices (a sale makes one)
 * and Bookings (packs pay for them) stale for their next visit.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { customerRead } from "@/lib/customers/queries";
import { useCustomer } from "@/lib/customers/use-customers";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

import { packPurchasesRead, packRead, packsListRead } from "./queries";
import type { ClassPackSave } from "./use-class-packs";
import { useClassPackSave, usePack } from "./use-class-packs";

const ORG = "org_1";
const SEEN = [
    packsListRead.options(ORG, {}).queryKey,
    packPurchasesRead.options(ORG, {}).queryKey,
    domainKey("invoices", ORG, "list", {}),
    domainKey("bookings", ORG, "list", {}),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));
const paths = () =>
    fetchMock.mock.calls.map(([url]) => (url as string).split("?")[0]);

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Already read on an earlier visit, past its fresh moment. */
function seeded(keys: readonly (readonly unknown[])[]) {
    const client = makeTestClient();
    for (const key of [...keys, ...SEEN]) {
        client.setQueryData(key, {}, { updatedAt: Date.now() - 60_000 });
    }
    return client;
}

function PackPage({ report }: { report: (save: ClassPackSave) => void }) {
    usePack({ packId: "pk_1" });
    report(useClassPackSave());
    return null;
}

function CustomerPage({ report }: { report: (save: ClassPackSave) => void }) {
    useCustomer({ customerId: "c_1" });
    report(useClassPackSave());
    return null;
}

describe("a pack write", () => {
    it("on a pack's page reads that page once and marks the rest stale", async () => {
        const client = seeded([
            packRead.options(ORG, { packId: "pk_1" }).queryKey,
        ]);
        let save!: ClassPackSave;
        const { unmount } = renderWithQuery(
            <PackPage report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();

        expect(save.orgId).toBe(ORG);
        await act(() => save.saved());
        await tick();
        expect(paths()).toEqual(["/api/class-packs/pk_1"]);
        for (const key of SEEN) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        unmount();
    });

    it("on a customer's page (sell, extend) reads the customer once", async () => {
        const client = seeded([
            customerRead.options(ORG, { customerId: "c_1" }).queryKey,
        ]);
        let save!: ClassPackSave;
        const { unmount } = renderWithQuery(
            <CustomerPage report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();

        await act(() => save.saved());
        await tick();
        expect(paths()).toEqual(["/api/customers/c_1"]);
        for (const key of SEEN) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        unmount();
    });
});
