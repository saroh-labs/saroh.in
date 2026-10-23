// @vitest-environment jsdom
/**
 * The command menu (10 Oct 2026): it finds every kind of thing the API
 * searches, says so when the search itself didn't answer (never "Nothing
 * matches"), starts the daily jobs for whoever may, and opens on the last
 * five things this person opened.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn<(href: string) => void>();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
}));

import { readRecents, rememberRecent } from "@/lib/search/recents";
import type { SearchHit } from "@/lib/search/service";

import { CommandMenu, openCommandMenu, SEARCH_FAILED } from "./command-menu";

const OWNER_ACTIONS = [
    "order:create",
    "booking:write",
    "store:write",
    "contact:write",
    "discount:write",
    "service:write",
    "invoice:write",
    "notification:read",
    "org:read",
];
const MODULES = ["COMMERCE", "APPOINTMENTS", "PAYMENTS", "WEBSITE"];

const HITS: SearchHit[] = [
    {
        kind: "contact",
        id: "c_1",
        title: "Asha Rao",
        subtitle: "asha@example.com",
        href: "/contacts/c_1",
    },
    {
        kind: "order",
        id: "o_1",
        title: "ORD-012",
        subtitle: "Asha Rao · pending",
        href: "/commerce/orders/o_1?storefront=s_1",
    },
    {
        kind: "booking",
        id: "b_1",
        title: "Asha Rao, Check-up",
        subtitle: "12 Oct, 9:30 am",
        href: "/bookings/b_1",
    },
    {
        kind: "product",
        id: "p_1",
        title: "Asha's sourdough",
        subtitle: "live",
        href: "/commerce/products/p_1",
    },
    {
        kind: "invoice",
        id: "i_1",
        title: "INV-0042",
        subtitle: "Asha Rao · issued",
        href: "/billing/invoices/i_1",
    },
    {
        kind: "service",
        id: "s_1",
        title: "Asha's facial",
        subtitle: "45 min",
        href: "/services/s_1",
    },
    {
        kind: "subscription",
        id: "u_1",
        title: "Asha Rao",
        subtitle: "Bread box · active",
        href: "/billing/subscriptions/u_1",
    },
];

let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

function mount(over: Partial<Parameters<typeof CommandMenu>[0]> = {}): void {
    act(() =>
        root.render(
            <CommandMenu
                moduleKeys={MODULES}
                role="OWNER"
                actions={OWNER_ACTIONS}
                recentsScope="org_1"
                {...over}
            />,
        ),
    );
    act(() => openCommandMenu());
}

const input = () => {
    const el = document.querySelector<HTMLInputElement>("input");
    if (!el) throw new Error("the menu isn't open");
    return el;
};

function type(text: string) {
    const value = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    );
    act(() => {
        value?.set?.call(input(), text);
        input().dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** Past the debounce, and the reply. */
async function searched() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
    });
}

const groups = () =>
    Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(
        (h) => h.textContent,
    );
const items = () =>
    Array.from(document.querySelectorAll("[cmdk-item]")).map((i) =>
        i.textContent.trim(),
    );
const item = (text: string) => {
    const el = Array.from(document.querySelectorAll("[cmdk-item]")).find((i) =>
        i.textContent.includes(text),
    );
    if (!el) throw new Error(`no "${text}" in the menu`);
    return el;
};
const choose = (text: string) =>
    act(() => {
        item(text).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
const said = () => document.body.textContent;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // cmdk measures and scrolls its list; jsdom has neither.
    const nothing = () => undefined;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe = nothing;
        unobserve = nothing;
        disconnect = nothing;
    };
    Element.prototype.scrollIntoView = () => undefined;
    vi.useFakeTimers();
    window.localStorage.clear();
    push.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json(200, { query: "", hits: [] }));
    vi.stubGlobal("fetch", fetchMock);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("search finds everything", () => {
    it("draws a group for each kind of thing found, people first", async () => {
        fetchMock.mockResolvedValue(json(200, { query: "asha", hits: HITS }));
        mount();
        type("asha");
        await searched();

        expect(fetchMock).toHaveBeenCalledWith("/api/search?q=asha");
        expect(groups().slice(0, 7)).toEqual([
            "Customers and contacts",
            "Orders",
            "Bookings",
            "Products",
            "Invoices",
            "Services",
            "Subscriptions",
        ]);
        expect(said()).toContain("ORD-012");
        expect(said()).toContain("12 Oct, 9:30 am");
        expect(said()).toContain("INV-0042");
    });

    it("a hit opens where the API says it lives", async () => {
        fetchMock.mockResolvedValue(json(200, { query: "asha", hits: HITS }));
        mount();
        type("asha");
        await searched();
        choose("INV-0042");
        expect(push).toHaveBeenCalledWith("/billing/invoices/i_1");
    });

    it("says what it searches, in the merchant's words", () => {
        mount();
        expect(input().getAttribute("placeholder")).toBe(
            "Search customers, orders, bookings, products…",
        );
    });
});

describe("a search that doesn't answer", () => {
    it.each([
        [
            "the app's own route failing",
            () => Promise.resolve(json(503, { hits: [], failed: true })),
        ],
        [
            "the browser being offline",
            () => Promise.reject(new TypeError("Failed to fetch")),
        ],
        [
            "an answer that says it failed",
            () => Promise.resolve(json(200, { hits: [], failed: true })),
        ],
    ])("says so, never Nothing matches: %s", async (_, answer) => {
        fetchMock.mockImplementation(answer);
        mount();
        type("zzqx");
        await searched();

        expect(SEARCH_FAILED).toBe("Search isn't answering. Try again.");
        expect(said()).toContain(SEARCH_FAILED);
        expect(said()).not.toMatch(/Nothing matches|No .* match/i);
        expect(document.querySelector('[role="status"]')?.textContent).toBe(
            SEARCH_FAILED,
        );
    });

    it("says it even when a page or an action matches what was typed", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        mount();
        type("order");
        await searched();
        expect(items()).toContain("New order");
        expect(said()).toContain(SEARCH_FAILED);
    });

    it("Try again asks again, and shows what comes back", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        mount();
        type("asha");
        await searched();
        expect(said()).toContain(SEARCH_FAILED);

        fetchMock.mockResolvedValue(json(200, { query: "asha", hits: HITS }));
        choose("Try again");
        await searched();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(said()).not.toContain(SEARCH_FAILED);
        expect(said()).toContain("ORD-012");
    });

    it("a search that found nothing still says nothing matches", async () => {
        mount();
        type("zzqx");
        await searched();
        expect(said()).not.toContain(SEARCH_FAILED);
        expect(said()).toMatch(/zzqx/);
    });

    it("the failure isn't carried to the next thing typed", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        mount();
        type("asha");
        await searched();
        fetchMock.mockResolvedValue(json(200, { query: "bread", hits: [] }));
        type("bread");
        expect(said()).not.toContain(SEARCH_FAILED);
    });
});

describe("the daily starts", () => {
    it("are offered to someone who may make each", () => {
        mount();
        expect(items()).toEqual(
            expect.arrayContaining([
                "New order",
                "New booking",
                "New product",
                "New customer",
                "New discount code",
            ]),
        );
    });

    it("start where the job starts", () => {
        mount();
        choose("New order");
        expect(push).toHaveBeenCalledWith("/commerce/orders?new=1");
    });

    it("a Member is offered none of them", () => {
        mount({
            role: "MEMBER",
            actions: [
                "org:read",
                "booking:read",
                "contact:read",
                "order:stage",
            ],
        });
        for (const label of [
            "New order",
            "New booking",
            "New product",
            "New customer",
            "New discount code",
        ]) {
            expect(items()).not.toContain(label);
        }
    });

    it("someone who only books is offered New booking alone", () => {
        mount({
            role: "MEMBER",
            actions: ["org:read", "booking:read", "booking:write"],
        });
        expect(items()).toContain("New booking");
        expect(items()).not.toContain("New order");
    });

    it("a module that is off takes its starts with it", () => {
        mount({ moduleKeys: ["APPOINTMENTS"] });
        expect(items()).toContain("New booking");
        expect(items()).toContain("New customer");
        expect(items()).not.toContain("New order");
        expect(items()).not.toContain("New product");
    });
});

describe("recents", () => {
    it("opening a thing from search remembers it, ids and labels only", async () => {
        fetchMock.mockResolvedValue(json(200, { query: "asha", hits: HITS }));
        mount();
        type("asha");
        await searched();
        choose("ORD-012");

        expect(readRecents("org_1")).toEqual([
            {
                kind: "order",
                id: "o_1",
                title: "ORD-012",
                href: "/commerce/orders/o_1?storefront=s_1",
            },
        ]);
        // Never the line beside it (an email, a status).
        expect(
            window.localStorage.getItem("saroh-recent-v1:org_1"),
        ).not.toMatch(/asha@example|pending/);
    });

    it("on open with nothing typed, shows the last five opened, newest first", () => {
        for (let i = 1; i <= 7; i++) {
            rememberRecent("org_1", {
                kind: "order",
                id: `o_${i}`,
                title: `ORD-00${i}`,
                href: `/commerce/orders/o_${i}`,
            });
        }
        mount();
        expect(groups()[0]).toBe("Recent");
        const recent = items().filter((t) => t.startsWith("ORD-"));
        expect(recent).toEqual([
            "ORD-007",
            "ORD-006",
            "ORD-005",
            "ORD-004",
            "ORD-003",
        ]);
        choose("ORD-006");
        expect(push).toHaveBeenCalledWith("/commerce/orders/o_6");
    });

    it("step aside once something is typed", () => {
        rememberRecent("org_1", {
            kind: "order",
            id: "o_1",
            title: "ORD-001",
            href: "/commerce/orders/o_1",
        });
        mount();
        type("bo");
        expect(groups()).not.toContain("Recent");
    });

    it("another business has its own", () => {
        rememberRecent("org_2", {
            kind: "order",
            id: "o_9",
            title: "ORD-009",
            href: "/commerce/orders/o_9",
        });
        mount();
        expect(groups()).not.toContain("Recent");
    });

    it("a first day has none, and the menu is as it was", () => {
        mount();
        expect(groups()).not.toContain("Recent");
        expect(items()).toContain("New order");
    });
});
