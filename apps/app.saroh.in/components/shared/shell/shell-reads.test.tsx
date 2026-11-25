// @vitest-environment jsdom
/**
 * The shell's chrome from its browser reads (owner, 25 Nov 2026): the
 * frame at once, skeleton pieces where the rows go until the settings land,
 * then the rows; the badges and the bell's count follow the live read.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/lib/query/test-utils";
import { shellLiveRead, shellSettingsRead } from "@/lib/shell/queries";

import { ShellSidebar, ShellTabBar } from "./shell-reads";

// Their own suites draw them; here they'd pull server actions into jsdom.
vi.mock("@/components/ask-ai/ask-ai-host", () => ({ AskAiHost: () => null }));
vi.mock("@/components/shared/navigation/command-menu", () => ({
    CommandMenu: () => null,
}));
vi.mock("./app-header", () => ({ AppHeader: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/commerce/orders",
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const SETTINGS = {
    moduleKeys: ["COMMERCE"],
    locked: [],
    sites: [],
    storefronts: null,
    stockTracked: false,
    paymentDue: null,
    planEnding: null,
    paused: null,
    accountManager: null,
    askAi: null,
    websiteArea: false,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.stubGlobal(
        "matchMedia",
        () =>
            ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }) as unknown as MediaQueryList,
    );
    // Reads that never land, unless the test fills the cache itself.
    fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const nav = {
    role: "OWNER" as const,
    roleKey: "OWNER",
    actions: null,
    kind: null,
};

describe("the shell's chrome", () => {
    it("draws its frame with skeleton rows until the settings land", () => {
        const { host, unmount } = renderWithQuery(
            <>
                <ShellSidebar {...nav} collapsed={false} />
                <ShellTabBar {...nav} />
            </>,
        );
        expect(
            host.querySelector('aside[aria-label="Main menu"]'),
        ).not.toBeNull();
        expect(host.querySelector('nav[aria-label="Main"]')).not.toBeNull();
        // No row is offered before the modules are known.
        expect(host.querySelectorAll("a[href]")).toHaveLength(0);
        // The two reads, once each, though four pieces asked.
        const asked = fetchMock.mock.calls.map((c) => String(c[0])).sort();
        expect(asked).toEqual(["/api/shell", "/api/shell/live"]);
        unmount();
    });

    it("draws the rows once the settings land, and the badges with the live read", async () => {
        const { host, client, unmount } = renderWithQuery(
            <ShellSidebar {...nav} collapsed={false} />,
        );
        await act(async () => {
            client.setQueryData(shellSettingsRead.key("org_1", {}), SETTINGS);
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(host.querySelectorAll("a[href]").length).toBeGreaterThan(0);
        // No badge before the live read.
        expect(host.textContent).not.toContain("2");
        await act(async () => {
            client.setQueryData(shellLiveRead.key("org_1", {}), {
                unread: 0,
                counts: { "/commerce/orders": 2 },
            });
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(host.textContent).toContain("2");
        unmount();
    });
});
