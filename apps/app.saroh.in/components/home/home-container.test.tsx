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
            (b) => /New/.test(b.textContent ?? ""),
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
});
