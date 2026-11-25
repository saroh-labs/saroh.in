// @vitest-environment jsdom
/**
 * `useLiveRefresh` on a page moved to React Query (DEC-259): the refresh
 * invalidates the page's domains for the open business instead of reading
 * the page again (a chrome page: `router.refresh()` as well, for its
 * chrome; its rows are read in the browser all the same), under the
 * same guards plus a read or a save still on its way. Pages off the
 * registry keep today's path (`use-live-refresh.test.tsx`).
 */
import type * as ChromeRefresh from "@/lib/query/chrome-refresh";
import type * as LiveRoutes from "@/lib/query/live-routes";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type * as ReactModule from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
    const routes: Record<string, readonly string[]> = {};
    const chrome: string[] = [];
    return {
        refresh: vi.fn(),
        nav: { pathname: "/" },
        transition: { pending: false },
        routes,
        chrome,
    };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => h.nav.pathname,
}));
vi.mock("react", async (original) => {
    const actual = await original<typeof ReactModule>();
    return {
        ...actual,
        useTransition: () =>
            [h.transition.pending, (run: () => void) => run()] as const,
    };
});
vi.mock("@/lib/query/live-routes", async (original) => {
    const actual = await original<typeof LiveRoutes>();
    return {
        ...actual,
        liveDomains: (p: string, r?: Record<string, readonly string[]>) =>
            actual.liveDomains(p, r ?? h.routes),
    };
});
vi.mock("@/lib/query/chrome-refresh", async (original) => {
    const actual = await original<typeof ChromeRefresh>();
    return {
        ...actual,
        isChromeRefresh: (p: string) => actual.isChromeRefresh(p, h.chrome),
    };
});

import { holdLiveRefresh } from "@/lib/live/refresh";
import {
    CHROME_REFRESH_CAP,
    CHROME_REFRESH_ROUTES,
} from "@/lib/query/chrome-refresh";
import { domainKey } from "@/lib/query/keys";
import { LIVE_QUERY_ROUTES, liveDomains } from "@/lib/query/live-routes";
import { OrgProvider } from "@/lib/query/org";
import { makeTestClient } from "@/lib/query/test-utils";

import { useLiveRefresh } from "./use-live-refresh";

/** A read the test answers by hand, so it can be left on its way. */
function deferredReads() {
    const calls: { key: readonly unknown[]; resolve: () => void }[] = [];
    const fn = ({ queryKey }: { queryKey: readonly unknown[] }) =>
        new Promise<string>((resolve) =>
            calls.push({ key: queryKey, resolve: () => resolve("ok") }),
        );
    const count = (domain: string, org: string) =>
        calls.filter((c) => c.key[0] === domain && c.key[1] === org).length;
    const settle = async () => {
        await act(() => {
            for (const c of calls) c.resolve();
            return Promise.resolve();
        });
    };
    return { calls, fn, count, settle };
}

let reads: ReturnType<typeof deferredReads>;

function Page({ orgId }: { orgId: string }) {
    useLiveRefresh();
    useQuery({
        queryKey: domainKey("home", orgId, "summary"),
        queryFn: reads.fn,
    });
    useQuery({
        queryKey: domainKey("orders", orgId, "list"),
        queryFn: reads.fn,
    });
    return null;
}

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let visibility: DocumentVisibilityState = "visible";
let online = true;

function mount(orgId = "org_1") {
    act(() =>
        root.render(
            <QueryClientProvider client={client}>
                <OrgProvider orgId={orgId}>
                    <Page orgId={orgId} />
                </OrgProvider>
            </QueryClientProvider>,
        ),
    );
}

function comeBack() {
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

/** Past the 2 s gap between two refreshes. */
function later() {
    vi.setSystemTime(Date.now() + 3_000);
}

/** Mounted, first reads answered, past the gap: ready for a trigger. */
async function ready(orgId = "org_1") {
    mount(orgId);
    await reads.settle();
    later();
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T09:00:00.000Z"));
    h.refresh.mockReset();
    h.nav.pathname = "/";
    h.transition.pending = false;
    h.routes = { "/": ["home"] };
    h.chrome = ["/"];
    reads = deferredReads();
    client = makeTestClient();
    visibility = "visible";
    online = true;
    Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibility,
    });
    Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => online,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    client.clear();
    vi.useRealTimers();
});

describe("useLiveRefresh on a React Query page", () => {
    it("on a chrome page, reads its queries again and refreshes the page once for its chrome", async () => {
        await ready();
        comeBack();
        // Its render sends no rows (DEC-259): the browser reads them again.
        expect(reads.count("home", "org_1")).toBe(2);
        expect(reads.count("orders", "org_1")).toBe(1);
        expect(h.refresh).toHaveBeenCalledTimes(1);
    });

    it("on a page with no chrome entry, reads its queries again and not the page", async () => {
        h.chrome = [];
        await ready();
        comeBack();
        expect(reads.count("home", "org_1")).toBe(2);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("reads the shell's bell and badges again on every refresh, on any page", async () => {
        const live = domainKey("shell", "org_1", "live");
        client.setQueryData(live, { unread: 0, counts: {} });
        client.setQueryData(domainKey("shell", "org_1", "settings"), {});
        await ready();
        comeBack();
        expect(client.getQueryState(live)?.isInvalidated).toBe(true);
        // The settings are not on the live refresh.
        expect(
            client.getQueryState(domainKey("shell", "org_1", "settings"))
                ?.isInvalidated,
        ).toBe(false);
        // A page off React Query: the same, beside its `router.refresh()`.
        client.setQueryData(live, { unread: 1, counts: {} });
        h.nav.pathname = "/settings";
        mount();
        later();
        comeBack();
        expect(client.getQueryState(live)?.isInvalidated).toBe(true);
    });

    it("never touches another business's cached queries", async () => {
        client.setQueryData(domainKey("home", "org_2", "summary"), "theirs");
        await ready();
        comeBack();
        expect(
            client.getQueryState(domainKey("home", "org_2", "summary"))
                ?.isInvalidated,
        ).toBe(false);
    });

    it.each([
        [
            "a dialog is open",
            () => {
                const d = document.createElement("div");
                d.setAttribute("role", "dialog");
                document.body.appendChild(d);
            },
        ],
        [
            "a form was typed into",
            () => {
                const f = document.createElement("form");
                f.setAttribute("data-live-typed", "");
                document.body.appendChild(f);
            },
        ],
        ["a guarded form is dirty", () => holdLiveRefresh()],
        ["the tab is hidden", () => void (visibility = "hidden")],
        ["the browser is offline", () => void (online = false)],
        ["a refresh is on its way", () => void (h.transition.pending = true)],
    ])("does nothing while %s", async (_why, set) => {
        await ready();
        const release = set();
        mount(); // the hook reads a pending transition on render
        act(() => void document.dispatchEvent(new Event("visibilitychange")));
        act(() => void window.dispatchEvent(new Event("online")));
        expect(reads.count("home", "org_1")).toBe(1);
        expect(h.refresh).not.toHaveBeenCalled();
        if (typeof release === "function") (release as () => void)();
    });

    it("does nothing while the page's reads are still on their way", () => {
        mount();
        later();
        comeBack();
        expect(reads.count("home", "org_1")).toBe(1);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("does nothing while a save is on its way", async () => {
        await ready();
        // A save that hasn't answered yet.
        act(
            () =>
                void client
                    .getMutationCache()
                    .build(client, {
                        mutationFn: () => new Promise(() => undefined),
                    })
                    .execute(undefined),
        );
        comeBack();
        expect(reads.count("home", "org_1")).toBe(1);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("a second trigger during an in-flight invalidation does nothing", async () => {
        h.chrome = [];
        await ready();
        comeBack();
        expect(reads.count("home", "org_1")).toBe(2);
        later();
        comeBack();
        act(() => void window.dispatchEvent(new Event("online")));
        expect(reads.count("home", "org_1")).toBe(2);
        expect(h.refresh).not.toHaveBeenCalled();
        // Once it has landed, the next one goes.
        await reads.settle();
        later();
        comeBack();
        expect(reads.count("home", "org_1")).toBe(3);
    });

    it("a business switch mid-refresh leaves the new business alone", async () => {
        h.chrome = [];
        await ready("org_1");
        comeBack();
        expect(reads.count("home", "org_1")).toBe(2);
        // Switched while org_1's read is still on its way.
        act(() => client.clear());
        mount("org_2");
        await reads.settle();
        expect(reads.count("home", "org_2")).toBe(1);
        expect(
            client.getQueryState(domainKey("home", "org_2", "summary"))
                ?.isInvalidated,
        ).toBe(false);
        // The next refresh is the new business's.
        later();
        comeBack();
        expect(reads.count("home", "org_2")).toBe(2);
        expect(reads.count("home", "org_1")).toBe(2);
    });
});

describe("the registries", () => {
    it("hold the routes moved so far, and the chrome list keeps its cap", () => {
        expect(LIVE_QUERY_ROUTES).toEqual({
            "/": ["home"],
            "/bookings": ["bookings"],
            "/bookings/all": ["bookings"],
            "/bookings/[bookingId]": ["bookings"],
            "/commerce/products": ["products"],
            "/commerce/orders": ["orders"],
            "/commerce/orders/[orderId]": ["orders"],
            "/commerce/orders/tickets": ["orders"],
            "/notifications": ["notifications"],
        });
        expect(CHROME_REFRESH_ROUTES.length).toBeLessThanOrEqual(
            CHROME_REFRESH_CAP,
        );
    });

    it("match a route by its glob, one segment per [param]", () => {
        const routes = {
            "/commerce/orders": ["orders"],
            "/commerce/orders/[orderId]": ["orders", "customers"],
        };
        expect(liveDomains("/commerce/orders/", routes)).toEqual(["orders"]);
        expect(liveDomains("/commerce/orders/ord_1", routes)).toEqual([
            "orders",
            "customers",
        ]);
        expect(liveDomains("/commerce/orders/ord_1/edit", routes)).toBeNull();
        expect(liveDomains("/commerce", routes)).toBeNull();
        expect(liveDomains(null, routes)).toBeNull();
    });
});
