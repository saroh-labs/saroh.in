// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";

import { SiteSettings } from "../site-settings";

/**
 * Website › Settings in tabs (owner, 9 Oct): the open tab is in the
 * address, and a checklist step switches to its tab and opens its row.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
    // As Next does: the address's query, as it is now.
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/sites/actions", () => ({
    updateSiteFooter: vi.fn(),
    updateSiteNavigation: vi.fn(),
    updateSiteSettings: vi.fn(),
    setPublishNeedsApproval: vi.fn(),
}));
vi.mock("@/components/sites/custom-domain", () => ({
    CustomDomain: () => null,
}));
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: () => null,
}));

const site = {
    id: "site_rye",
    name: "Rye",
    can: { manageSettings: true, publish: true },
    currentPublication: null,
    footer: null,
    navigation: null,
    pages: [],
    pendingSectionChanges: 0,
    pendingSiteChanges: [],
    postsPrefix: null,
    sellsFrom: null,
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    socialImageWidth: null,
    socialImageHeight: null,
    socialImageBytes: null,
} as unknown as SiteDetail;

const address: SiteAddress = {
    host: "rye.saroh.app",
    url: "https://rye.saroh.app",
    platformHost: "rye.saroh.app",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/sites/site_rye/settings");
    // jsdom lays nothing out, and has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function render() {
    act(() => root.render(<SiteSettings site={site} address={address} />));
}

const selected = () =>
    host.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
const shown = () =>
    Array.from(
        host.querySelectorAll<HTMLElement>('[role="tabpanel"]:not([hidden])'),
        (p) => p.id,
    );

describe("the settings' tabs", () => {
    it("opens on Address, and on the tab the address names", () => {
        render();
        expect(selected()).toBe("Address");
        expect(shown()).toEqual(["settings-panel-address"]);
        act(() => root.unmount());

        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?section=tracking",
        );
        root = createRoot(host);
        render();
        expect(selected()).toBe("Tracking");
        expect(shown()).toEqual(["settings-panel-tracking"]);
    });

    it("puts the tab chosen in the address, one history entry each", () => {
        render();
        const before = window.history.length;
        const tab = Array.from(
            host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        ).find((t) => t.textContent === "Menu and footer");
        act(() => tab?.click());
        expect(selected()).toBe("Menu and footer");
        expect(window.location.search).toBe("?section=menu-and-footer");
        expect(window.history.length).toBe(before + 1);
    });

    it("moves with the arrow keys", () => {
        render();
        const strip = host.querySelector<HTMLElement>('[role="tablist"]');
        act(() => {
            strip?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(selected()).toBe("Search and sharing");
        expect(document.activeElement?.textContent).toBe("Search and sharing");
    });

    it("jumps from a checklist step to its tab, with its row open", async () => {
        render();
        const write = host.querySelector<HTMLAnchorElement>(
            '[data-step="description"] a',
        );
        expect(write?.textContent).toContain("Write");
        await act(async () => {
            write?.click();
            await new Promise((r) => requestAnimationFrame(r));
        });
        expect(selected()).toBe("Search and sharing");
        expect(window.location.search).toBe("?section=search-and-sharing");
        const field = host.querySelector(
            '#settings-description textarea[aria-label="Search description"]',
        );
        expect(field).not.toBe(null);
        expect(document.activeElement).toBe(field);
    });
});
