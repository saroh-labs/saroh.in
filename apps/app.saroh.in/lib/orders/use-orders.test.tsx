// @vitest-environment jsdom
/**
 * Orders on React Query (DEC-259), in the browser: the first load reads
 * the page and the filter bar once each (nothing comes with the page's
 * HTML); a page already in the cache is mounted over without a read; a
 * tab change is a new list key while the
 * filter bar's read stays; a step that landed reads the list once (the
 * filter bar's counts, Home, Products and Invoices only marked stale); a
 * refused one shows the refusal and reads nothing.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { showError, moveStage } = vi.hoisted(() => ({
    showError: vi.fn(),
    moveStage: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError,
    showInfo: vi.fn(),
    showUndo: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    unstable_rethrow: () => undefined,
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/orders/actions", () => ({
    moveStage: (...args: unknown[]) => moveStage(...args) as unknown,
    undoStage: vi.fn(),
}));

import { useOrderStep } from "@/components/commerce/orders/use-order-step";
import { readOrdersQuery } from "@/lib/orders/list-query";
import type { OrdersListView } from "@/lib/orders/queries";
import {
    ordersAsk,
    ordersListRead,
    ordersOptionsRead,
} from "@/lib/orders/queries";
import { useOrdersList, useOrdersOptions } from "@/lib/orders/use-orders";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const PAGE = {
    rows: [],
    counts: { all: 0, open: 0, refunded: 0 },
    moment: null,
    share: null,
} as unknown as OrdersListView;
const OPTIONS = { filters: null, openByStore: null };
const ALL = ordersAsk(readOrdersQuery({}));
const OPEN = ordersAsk(readOrdersQuery({ tab: "open" }));

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reads = (path: string) =>
    fetchMock.mock.calls.filter(
        ([url]) =>
            typeof url === "string" &&
            (url === path || url.startsWith(`${path}?`)),
    ).length;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    showError.mockReset();
    moveStage.mockReset();
    fetchMock = vi.fn<typeof fetch>((url) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    typeof url === "string" &&
                        url.startsWith("/api/orders/options")
                        ? OPTIONS
                        : PAGE,
                ),
                { status: 200 },
            ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser client that has already read the list (an earlier visit). */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(ordersListRead.options(ORG, ALL).queryKey, PAGE);
    server.setQueryData(ordersOptionsRead.options(ORG, {}).queryKey, OPTIONS);
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    // Home, Products and Invoices, seen earlier in this tab.
    client.setQueryData(domainKey("home", ORG, "home"), {});
    client.setQueryData(domainKey("products", ORG, "list", {}), {});
    client.setQueryData(domainKey("invoices", ORG, "list", {}), {});
    return client;
}

type Step = ReturnType<typeof useOrderStep>;

function Screen({
    ask,
    report,
}: {
    ask: typeof ALL;
    report: (step: Step) => void;
}) {
    useOrdersList(ask);
    useOrdersOptions({});
    report(useOrderStep());
    return null;
}

describe("the list's reads", () => {
    it("first load reads the page and the filter bar once each, in the browser", async () => {
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client: makeTestClient(), orgId: ORG },
        );
        await tick();
        expect(reads("/api/orders")).toBe(1);
        expect(reads("/api/orders/options")).toBe(1);
        unmount();
    });

    it("a page already read is mounted over without a read", async () => {
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client: hydrated(), orgId: ORG },
        );
        await tick();
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("a tab change reads that page, and not the filter bar again", async () => {
        expect(OPEN).toEqual({ tab: "open" });
        const client = hydrated();
        const view = renderWithQuery(
            <Screen ask={ALL} report={() => undefined} />,
            { client, orgId: ORG },
        );
        await tick();
        view.unmount();
        const again = renderWithQuery(
            <Screen ask={OPEN} report={() => undefined} />,
            { client, orgId: ORG },
        );
        await tick();
        expect(reads("/api/orders")).toBe(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orders?tab=open");
        expect(reads("/api/orders/options")).toBe(0);
        again.unmount();
    });
});

describe("a step from the list", () => {
    const order = {
        id: "o1",
        orderId: "1042",
        stage: "NEW",
        to: "PREPARING" as const,
    };

    it("goes as the tab's business, then reads the list once and marks the rest stale", async () => {
        moveStage.mockResolvedValue({
            ok: true,
            data: { eventId: "e1", undoable: false },
        });
        let step: Step | undefined;
        const client = hydrated();
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={(s) => (step = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        act(() => step?.take(order));
        await tick();
        expect(moveStage).toHaveBeenCalledWith("o1", { to: "PREPARING" }, ORG);
        expect(reads("/api/orders")).toBe(1);
        expect(reads("/api/orders/options")).toBe(0);
        const stale = (key: readonly unknown[]) =>
            client.getQueryCache().find({ queryKey: key })?.isStale();
        expect(stale(ordersOptionsRead.options(ORG, {}).queryKey)).toBe(true);
        expect(stale(domainKey("home", ORG, "home"))).toBe(true);
        expect(stale(domainKey("products", ORG, "list", {}))).toBe(true);
        expect(stale(domainKey("invoices", ORG, "list", {}))).toBe(true);
        unmount();
    });

    it("a refused step says so and reads nothing", async () => {
        moveStage.mockResolvedValue({ ok: false, error: "Already ready." });
        let step: Step | undefined;
        const { unmount } = renderWithQuery(
            <Screen ask={ALL} report={(s) => (step = s)} />,
            { client: hydrated(), orgId: ORG },
        );
        await tick();
        act(() => step?.take(order));
        await tick();
        expect(showError).toHaveBeenCalledWith("Already ready.");
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});
