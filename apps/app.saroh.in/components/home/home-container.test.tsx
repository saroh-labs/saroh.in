// @vitest-environment jsdom
/**
 * Home on React Query, first paint (owner, 25 Nov): the header is drawn at
 * once with New working; the greeting, the date line and the work below
 * are Home's loader shapes until Home is read, then Home in their place.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/components/ask-ai/ask-ai-page", () => ({ AskAiPageIs: () => null }));
// The parts are props-in and tested on their own.
vi.mock("@/components/home/dashboard/home-dashboard", () => ({
    HomeDashboard: () => <p>the dashboard</p>,
}));

import { HomeContainer } from "@/components/home/home-container";
import { homeNewFor } from "@/components/shared/navigation/quick-actions";
import { renderWithQuery } from "@/lib/query/test-utils";

const HOME = {
    view: "business",
    hasAnyModule: true,
    lastDay: null,
    tiles: null,
    moment: null,
    news: null,
};

let release: () => void;

beforeEach(() => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            await gate;
            return new Response(JSON.stringify(HOME), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("Home before its read", () => {
    it("draws the header and New at once, the work as skeletons, then Home", async () => {
        const { host, unmount } = renderWithQuery(
            <HomeContainer
                name="Mohit Mehta"
                businessName="Rye & Co."
                kind="BUSINESS"
                newMenu={{
                    items: [
                        {
                            key: "order",
                            href: "/commerce/orders?new=1",
                            label: "Order",
                            hint: null,
                        },
                    ] as never,
                    roleLine: null,
                }}
                modules={null}
                setupShown={false}
                insights={false}
            />,
        );
        await tick();
        const newButton = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.includes("New"),
        );
        expect(newButton?.disabled).toBe(false);
        expect(host.querySelector('[data-shape="home"]')).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("the dashboard");

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="home"]')).toBeNull();
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        expect(host.textContent).toContain("the dashboard");
        expect(host.querySelector("h1")?.textContent).toContain("Hello, Mohit");
        unmount();
    });

    it("lists the role's New rows on first paint and keeps the menu open when Home lands", async () => {
        // An Owner on a business that sells and books: from the page's gate
        // props, never from Home's read (empty cache, read held).
        const menu = homeNewFor({
            moduleKeys: ["COMMERCE", "APPOINTMENTS", "PAYMENTS"],
            actions: ["order:create", "booking:write", "invoice:write"],
        });
        const { host, unmount } = renderWithQuery(
            <HomeContainer
                name="Mohit Mehta"
                businessName="Northwind"
                kind="BUSINESS"
                newMenu={menu}
                modules={null}
                setupShown={false}
                insights={false}
            />,
        );
        const labels = () =>
            Array.from(
                document.body.querySelectorAll("[role=menu] [role=menuitem]"),
            ).map(
                (row) => row.querySelector("span.font-semibold")?.textContent,
            );
        const trigger = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "New",
        );
        if (!trigger) throw new Error("No New button");
        trigger.focus();
        await act(async () => {
            trigger.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
            await new Promise((r) => setTimeout(r, 20));
        });
        const every = ["Take an order", "Book someone", "Send an invoice"];
        expect(labels()).toEqual(every);

        // Home lands while the menu is open: the header is the same one, so
        // the menu stays open with its rows (it closed, empty, on CI).
        release();
        await tick(50);
        expect(host.textContent).toContain("the dashboard");
        expect(labels()).toEqual(every);
        unmount();
    });
});
