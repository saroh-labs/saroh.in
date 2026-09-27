// @vitest-environment jsdom
/**
 * Characterization of the site editor's shell (#260, round 2 G1).
 *
 * Written BEFORE the editor was split into hooks and panels, and kept passing
 * through every move: it pins what the merchant sees and can press, not how the
 * component is put together. The four scenes still need a real browser; this
 * is only the guard rail for a behaviour-preserving refactor.
 *
 * `react-dom/client` + `act` directly, with no testing library: the app has no
 * component-test dependencies and this file should not be the reason it grows
 * some. Queries are by role and label, the same way the e2e specs find things.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteEditor } from "@/components/sites/site-editor";
import * as prefs from "@/lib/sites/editor-prefs";
import type {
    ReviewState,
    Section,
    SiteFlags,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyleOptions } from "@/lib/sites/style";

// `vi.mock` is hoisted above the imports, so the editor gets these.
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

const actions = vi.hoisted(() => ({
    getReviewState: vi.fn(),
    getSiteFlags: vi.fn(),
    listComments: vi.fn(),
    publishSite: vi.fn(),
    requestReview: vi.fn(),
    saveDraftSections: vi.fn(),
    updateSiteStyle: vi.fn(),
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePage: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => actions);
/*
 * Server-only: other panels' actions reach the API client, which reads server
 * environment variables at import. Nothing here may call it for real.
 */
vi.mock("@/lib/api/http", () => ({
    apiFetch: vi.fn(),
    getJson: vi.fn(),
    getList: vi.fn(),
    mutate: vi.fn(),
}));
vi.mock("@/lib/forms/actions", () => ({
    ensureFormForSection: vi.fn(),
}));
vi.mock("@/lib/services/actions", () => ({
    listServicesForPicker: vi.fn(() =>
        Promise.resolve({ ok: true, services: [] }),
    ),
}));
const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

/*
 * jsdom has no layout: ResizeObserver is missing, and every element is 0px
 * wide. The observer is captured so a test can give the canvas a width and
 * fire it, which is what the browser does on a window resize.
 */
const observers: ((entries: unknown[]) => void)[] = [];
class FakeResizeObserver {
    constructor(cb: (entries: unknown[]) => void) {
        observers.push(cb);
    }
    observe() {
        // Nothing to measure: a test fires the callback through `resize()`.
    }
    unobserve() {
        // As above.
    }
    disconnect() {
        // As above.
    }
}

const PAGES: SitePage[] = [
    { id: "p-home", path: "/", title: "Home", isHome: true, hidden: false },
    {
        id: "p-about",
        path: "/about",
        title: "About",
        isHome: false,
        hidden: false,
    },
];

function hero(key: string, heading: string): Section {
    return { key, type: "hero", contractVersion: 1, content: { heading } };
}

const SECTIONS: Section[] = [hero("s1", "Welcome in"), hero("s2", "Our story")];

const STYLE_OPTIONS: SiteStyleOptions = { rows: [], scalars: [] };
const NO_FLAGS: SiteFlags = { flags: [], awaitingNavigation: [] };
const REVIEW: ReviewState = {
    openNotes: 0,
    latestApproval: null,
    outstanding: false,
    pending: false,
    approvalIsStale: false,
};

let root: Root;
let host: HTMLDivElement;
let site = 0;

type Props = Parameters<typeof SiteEditor>[0];

function render(overrides: Partial<Props> = {}) {
    // A fresh site each time: the editor remembers its place per site id.
    site += 1;
    const props: Props = {
        siteId: `site-${site}`,
        pageId: "p-home",
        pages: PAGES,
        initialFlags: NO_FLAGS,
        initialComments: [],
        initialReview: REVIEW,
        neverPublished: false,
        unreadableSections: [],
        initialPendingChanges: 0,
        initialPendingSiteChanges: [],
        initialSections: SECTIONS,
        initialRevision: 1,
        siteName: "Flour & Ferment",
        navigation: null,
        footerPreview: null,
        address: "flour.saroh.app",
        initialStyle: { colours: {}, scalars: {} },
        styleOptions: STYLE_OPTIONS,
        ...overrides,
    };
    act(() => {
        root.render(<SiteEditor {...props} />);
    });
    return props;
}

const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));

function button(name: string | RegExp): HTMLButtonElement {
    const all = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button,[role=tab]"),
    );
    const hit = all.find((b) => {
        const label = b.getAttribute("aria-label") ?? b.textContent;
        return typeof name === "string"
            ? label.trim() === name
            : name.test(label.trim());
    });
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

/** Run pending timers and let the promises they start settle. */
async function wait(ms: number) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        await Promise.resolve();
    });
}

/** Press a button and let what it starts settle. */
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

/** The canvas: the scrolling column the page frame sits in. */
function canvasOf(el: HTMLElement): HTMLElement {
    const parent = el.parentElement;
    if (!parent) throw new Error("No canvas");
    return parent;
}

/** Fire every observer, as a window resize would. */
function resize() {
    act(() => {
        for (const fire of observers) fire([]);
    });
}

/** The page frame on the canvas: the element the device width and zoom land on. */
function frame(): HTMLElement {
    const el = $$("div[style]").find((d) => d.style.transformOrigin);
    if (!el) throw new Error("No canvas frame");
    return el;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
        })),
    );
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
        setTimeout(cb, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    Element.prototype.scrollIntoView = vi.fn();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    observers.length = 0;
    prefs.setChrome(prefs.CHROME_DEFAULT);

    actions.getSiteFlags.mockResolvedValue(NO_FLAGS);
    actions.listComments.mockResolvedValue([]);
    actions.getReviewState.mockResolvedValue(REVIEW);
    actions.requestReview.mockResolvedValue({ ok: true, data: {} });
    actions.saveDraftSections.mockResolvedValue({
        ok: true,
        data: { revision: 2, pendingSectionChanges: 1, pendingSiteChanges: [] },
    });
    actions.publishSite.mockResolvedValue({
        ok: true,
        data: { bypassed: false },
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("SiteEditor shell", () => {
    it("draws the bar, the rail, the canvas and the inspector", () => {
        const { siteId } = render();

        // The bar: breadcrumb, page switcher, status and every action.
        const crumbs = $("nav[aria-label=Breadcrumb]");
        expect(crumbs?.textContent).toContain("Flour & Ferment");
        expect($(`a[href='/sites/${siteId}/pages']`)).not.toBeNull();
        expect(button(/^Page: Home\. Switch or manage pages$/)).toBeTruthy();
        expect($("[role=status]")?.textContent).toBe("Published");
        expect($("[role=group][aria-label='Preview width']")).not.toBeNull();
        for (const d of ["desktop", "tablet", "phone"]) {
            expect(button(`Show at ${d} width`)).toBeTruthy();
        }
        expect(button("Zoom").textContent).toContain("100%");
        expect(button("Preview")).toBeTruthy();
        expect(button("Style").getAttribute("aria-pressed")).toBe("false");
        expect(button("Share for review").disabled).toBe(false);
        expect(button("Publish").disabled).toBe(false);
        expect(button("Publish").title).toBe("Make these changes live");

        // The rail: its two tabs, the block count and header/footer locks.
        expect(button("This page").getAttribute("aria-selected")).toBe("true");
        expect(button("Add block")).toBeTruthy();
        expect(host.textContent).toContain("4 blocks");
        expect(button("Header")).toBeTruthy();
        expect(button("Footer")).toBeTruthy();
        expect($$("[aria-label='On every page']")).toHaveLength(2);
        expect(button("Welcome in").getAttribute("aria-current")).toBe("true");
        expect(button("Our story").getAttribute("aria-current")).toBeNull();

        // Resize handles for both side columns.
        expect($("[aria-label='Resize the block list']")).not.toBeNull();
        expect($("[aria-label='Resize the inspector']")).not.toBeNull();

        // The canvas: the address bar and the page.
        expect(host.textContent).toContain("flour.saroh.app/");
        expect(host.textContent).toContain(
            "⌘-click a link to open it on your site",
        );
        expect(frame().style.maxWidth).toBe("100%");
        expect(frame().style.transform).toBe("scale(1)");

        // The inspector: Block and Feedback tabs, the selected block's controls.
        expect($("aside[aria-label=Inspector]")).not.toBeNull();
        expect(button("Block").getAttribute("aria-selected")).toBe("true");
        expect(button(/^Feedback/)).toBeTruthy();
        expect(button("Move block up").disabled).toBe(true);
        expect(button("Move block down").disabled).toBe(false);
        expect(button("Remove")).toBeTruthy();
    });

    it("names a site that has never been published", () => {
        render({
            neverPublished: true,
            initialPendingChanges: null,
            initialPendingSiteChanges: null,
            address: null,
        });
        expect(button("Publish site")).toBeTruthy();
        expect($("[role=status]")?.textContent).toBe("Not published yet");
        expect(host.textContent).toContain("Nothing’s live yet");
        expect(host.textContent).toContain("Not published yet");
        expect(host.textContent).not.toContain("⌘-click");
    });

    it("says what publishing would change beside the pill", () => {
        render({
            initialPendingChanges: 2,
            initialPendingSiteChanges: ["style"],
            initialReview: {
                ...REVIEW,
                openNotes: 3,
                latestApproval: {
                    outcome: "APPROVED",
                    at: "2026-09-01T10:00:00.000Z",
                    by: "Asha",
                },
            },
        });
        const line = $("nav[aria-label=Breadcrumb] span[title]");
        expect(line?.textContent).toMatch(
            /^2 sections and .+ changed · Approved by Asha · 3 open notes$/,
        );
        expect(line?.title).toContain("changed since the last publish");
        expect(line?.title).toContain("Approved by Asha · ");
    });

    it("switches the preview width and remembers it", () => {
        render();
        click(button("Show at phone width"));
        expect(button("Show at phone width").getAttribute("aria-pressed")).toBe(
            "true",
        );
        expect(
            button("Show at desktop width").getAttribute("aria-pressed"),
        ).toBe("false");
        expect(frame().style.maxWidth).toBe("23.4375rem");
        // The cross-fade dips while the width animates, then clears.
        expect(frame().className).toContain("opacity-70");
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(frame().className).toContain("opacity-100");
        expect(prefs.getChrome().device).toBe("phone");

        click(button("Show at tablet width"));
        expect(frame().style.maxWidth).toBe("48rem");
    });

    /*
     * The zoom readout starts at 100% and the frame is unscaled. Choosing
     * another step goes through a Radix Select, which jsdom drives badly
     * (every later test stalls for seconds), so the steps and "Fit" are
     * pinned as maths in `editor/use-editor-viewport.test.ts` instead.
     */
    it("reads the zoom out of the readout, and the canvas width does not scale an unzoomed frame", () => {
        render();
        expect(button("Zoom").textContent).toContain("100%");
        expect(frame().style.transform).toBe("scale(1)");
        click(button("Show at phone width"));
        const canvas = canvasOf(frame());
        Object.defineProperty(canvas, "clientWidth", {
            configurable: true,
            value: 300,
        });
        resize();
        // Only "Fit" follows the canvas; 100% stays 100% however narrow.
        expect(frame().style.transform).toBe("scale(1)");
    });

    it("selects a block from the rail and the header from its locked row", () => {
        render();

        click(button("Our story"));

        expect(button("Our story").getAttribute("aria-current")).toBe("true");

        expect(button("Move block down").disabled).toBe(true);

        click(button("Header"));

        expect(button("Header").getAttribute("aria-current")).toBe("true");

        expect(button("Our story").getAttribute("aria-current")).toBeNull();

        // The header cannot move or go: its inspector says why instead.
        expect(() => button("Move block up")).toThrow();

        expect(button(/^Move — /)).toBeTruthy();
    });

    it("opens the style panel from the bar and comes back", () => {
        render();
        click(button("Style"));
        expect(button("Style").getAttribute("aria-pressed")).toBe("true");
        expect(() => button("This page")).toThrow();
        click(button("Style"));
        expect(button("This page")).toBeTruthy();
    });

    it("shows the Add block tab and adds a block after the selected one", () => {
        render();
        click(button("Add block"));
        expect(button("Add block").getAttribute("aria-selected")).toBe("true");
        const before = $$("[data-block-index]").length;
        // Any block with a single look goes straight in.
        const tile = Array.from(
            host.querySelectorAll<HTMLButtonElement>("aside button"),
        ).find((b) => b.textContent.includes("Contact"));
        if (!tile) throw new Error("No Contact tile");
        click(tile);
        // Back on the page's blocks, with the new one selected second.
        expect(button("This page").getAttribute("aria-selected")).toBe("true");
        expect(host.textContent).toContain("5 blocks");
        expect($$("[data-block-index]").length).toBe(before + 1);
        const rows = $$("aside li button[aria-current]");
        expect(rows).toHaveLength(1);
    });

    it("full-screen preview hides the editor and Escape returns", () => {
        render();
        click(button("Preview"));
        expect(button("Escape to return")).toBeTruthy();
        act(() => {
            window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape" }),
            );
        });
        expect(() => button("Escape to return")).toThrow();
    });

    it("asks before removing a block, and names it", () => {
        render();
        click(button("Remove"));
        const dialog = document.querySelector(
            "[role=alertdialog],[role=dialog]",
        );
        expect(dialog?.textContent).toContain('Remove "Welcome in"?');
        click(button("Remove section"));
        expect(toast.showSuccess).toHaveBeenCalledWith("Removed Welcome in.");
        expect(host.textContent).toContain("3 blocks");
    });

    it("autosaves an edit after a pause, and publish waits for it", async () => {
        render();
        click(button(/Visible$/));
        expect(button(/Hidden$/)).toBeTruthy();
        expect(button("Publish").disabled).toBe(true);
        expect($("[role=status]")?.textContent).not.toBe("Published");

        await wait(1500);
        expect(actions.saveDraftSections).toHaveBeenCalledTimes(1);
        const [, pageId, sent, revision] = actions.saveDraftSections.mock
            .calls[0] as [string, string, Section[], number];
        expect(pageId).toBe("p-home");
        expect(revision).toBe(1);
        expect(sent[0].hidden).toBe(true);
        // An autosave does not announce itself.
        expect(toast.showSuccess).not.toHaveBeenCalled();
        expect(button("Publish").disabled).toBe(false);
        expect($("nav[aria-label=Breadcrumb] span[title]")?.textContent).toBe(
            "1 section changed",
        );
    });

    it("stops saving and offers a reload when someone else saved", async () => {
        actions.saveDraftSections.mockResolvedValue({
            ok: false,
            conflict: true,
            error: "Someone else saved.",
        });
        render();
        click(button(/Visible$/));
        await wait(1500);
        expect(toast.showError).toHaveBeenCalledWith("Someone else saved.");
        expect($("[role=alert]")?.textContent).toContain(
            "Someone else saved this page while you were editing.",
        );
        expect(button("Reload the latest")).toBeTruthy();
        click(button(/Hidden$/));
        await wait(5000);
        expect(actions.saveDraftSections).toHaveBeenCalledTimes(1);
    });

    it("publishes through the check and says where the site is live", async () => {
        const { siteId } = render();
        await press(button("Publish"));
        expect(actions.getSiteFlags).toHaveBeenCalledWith(siteId);
        const go = Array.from(
            document.querySelectorAll<HTMLButtonElement>("button"),
        ).filter((b) => b.textContent.startsWith("Publish"));
        // The bar's button and the check's own.
        expect(go.length).toBeGreaterThan(1);
        await press(go[go.length - 1]);
        expect(actions.publishSite).toHaveBeenCalledTimes(1);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Flour & Ferment is live at flour.saroh.app.",
        );
        expect(actions.getReviewState).toHaveBeenCalled();
    });

    it("asks for a review and reads the state back", async () => {
        actions.getReviewState.mockResolvedValue({ ...REVIEW, pending: true });
        render();
        await press(button("Share for review"));
        expect(actions.requestReview).toHaveBeenCalledTimes(1);
        expect(button("In review").disabled).toBe(true);
    });

    it("opens a block's notes in the inspector", () => {
        render({
            initialComments: [
                {
                    id: "c1",
                    pageId: "p-home",
                    sectionKey: "s2",
                    body: "Tighten this",
                    resolvedAt: null,
                    orphaned: false,
                } as unknown as Props["initialComments"][number],
            ],
            initialReview: { ...REVIEW, openNotes: 1 },
        });
        // The rail marks the noted block; the tab counts the selected block's notes.
        expect(
            $$("aside li span[title]").some((s) =>
                s.title.includes("A reviewer has left a note"),
            ),
        ).toBe(true);
        expect(button(/^Feedback/).textContent).toContain("Feedback");
        click(button(/^Feedback/));
        expect(button("This block")).toBeTruthy();
        expect(button(/^Whole site/).textContent).toContain("1");
    });
});
