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
    // The site's menu (G17) asks where it is.
    usePathname: () => "/sites",
}));

const actions = vi.hoisted(() => ({
    getReviewState: vi.fn(),
    getSiteFlags: vi.fn(),
    listComments: vi.fn(),
    publishSite: vi.fn(),
    requestReview: vi.fn(),
    saveDraftSections: vi.fn(),
    updateSiteStyle: vi.fn(),
    updateSiteSettings: vi.fn(),
    updateSiteFooter: vi.fn(),
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
const toast = vi.hoisted(() => {
    let next = 0;
    return {
        showError: vi.fn(),
        showSuccess: vi.fn(),
        // G3: each Undo toast gets an id, so the editor can take it away.
        showUndo: vi.fn(() => `undo-${++next}`),
        dismissToast: vi.fn(),
    };
});
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
        canUpdateSite: true,
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

/** Press Undo on the n-th Undo toast the editor showed. */
function undoFrom(n: number) {
    const call = toast.showUndo.mock.calls[n] as unknown as
        [string, () => void] | undefined;
    if (!call) throw new Error(`No Undo toast ${n}`);
    call[1]();
}

/** The id the last Undo toast was given. */
function lastUndoId(): string {
    const last = toast.showUndo.mock.results.at(-1);
    if (!last) throw new Error("No Undo toast");
    return last.value as string;
}

/** The keys of the sections the n-th save sent. */
function sentKeys(n: number): (string | undefined)[] {
    const call = actions.saveDraftSections.mock.calls[n] as
        [string, string, Section[], number] | undefined;
    if (!call) throw new Error(`No save ${n}`);
    return call[2].map((section) => section.key);
}

/** The page frame on the canvas: the element the device width and zoom land on. */
function frame(): HTMLElement {
    const el = $$("div[style]").find((d) => d.style.transformOrigin);
    if (!el) throw new Error("No canvas frame");
    return el;
}

/** The inspector's text field with this label (G6). */
function field(label: string): HTMLInputElement {
    const el = Array.from(document.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    const input = el ? document.getElementById(el.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) {
        throw new Error(`No field ${label}`);
    }
    return input;
}

/** Type into a field the way a person does: React hears an input event. */
function type(input: HTMLInputElement, value: string) {
    act(() => {
        // The prototype's setter, so React's own value tracking sees a change.
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** The site's header link and footer on the canvas: what G17 draws. */
const canvasHome = () => $("header a[aria-label$='— home']");
const canvasFooter = () => $("footer");

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
    actions.updateSiteSettings.mockResolvedValue({
        ok: true,
        data: { id: "site" },
    });
    actions.updateSiteFooter.mockResolvedValue({
        ok: true,
        data: { id: "site" },
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
        // G2: the way out is the Website crumb, as the design draws it.
        const back = $(`a[href='/sites/${siteId}/pages']`);
        expect(back?.textContent).toBe("Website");
        expect(back?.getAttribute("aria-label")).toBe("Back to Website");
        expect(button(/^Page: Home\. Switch or manage pages$/)).toBeTruthy();
        expect($("[role=status]")?.textContent).toBe("Published");
        expect($("[role=group][aria-label='Preview width']")).not.toBeNull();
        for (const d of ["desktop", "tablet", "phone"]) {
            expect(button(`Show at ${d} width`)).toBeTruthy();
        }
        expect(button("Zoom").textContent).toContain("100%");
        expect(button("Preview")).toBeTruthy();
        // G2: Style is the rail's Brand tab, not a button in the bar.
        expect(() => button("Style")).toThrow();
        expect(button("Share for review").disabled).toBe(false);
        // Nothing waiting, and it still publishes: that makes a new version.
        expect(button("Publish").disabled).toBe(false);
        expect(button("Publish").title).toBe(
            "Nothing has changed since the last publish",
        );

        // The rail: Page · Add · Brand (G2), the block count and the locks.
        expect(
            $$("[role=tablist][aria-label='Editor panels'] [role=tab]").map(
                (t) => t.textContent,
            ),
        ).toEqual(["Page", "Add", "Brand"]);
        expect(button("Page").getAttribute("aria-selected")).toBe("true");
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
        // G2: the design's one word; the title says what it does.
        expect(button("Publish").title).toBe("Put this site live");
        expect($("[role=status]")?.textContent).toBe("Not published yet");
        expect(host.textContent).toContain("Nothing’s live yet");
        expect(host.textContent).toContain("Not published yet");
        expect(host.textContent).not.toContain("⌘-click");
    });

    it("says in the pill what is not published yet, and Publish puts it live", () => {
        render({
            initialPendingChanges: 2,
            initialPendingSiteChanges: ["footer"],
        });
        expect($("[role=status]")?.textContent).toBe(
            "Not published · 2 blocks, footer",
        );
        // The pill says it, so the line beside it does not say it twice.
        expect($("nav[aria-label=Breadcrumb] span[title]")).toBeNull();
        expect(button("Publish").title).toBe("Put live: 2 blocks, footer");
    });

    it("never says Published when the count of what's changed is missing", () => {
        render({
            initialPendingChanges: null,
            initialPendingSiteChanges: null,
        });
        expect($("[role=status]")?.textContent).toBe(
            "Couldn't check what's changed",
        );
        expect(button("Publish").title).toBe("Put this site live as it is now");
    });

    it("says what a save counted, and says so when a save comes back without a count", async () => {
        actions.saveDraftSections
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    revision: 2,
                    pendingSectionChanges: 1,
                    pendingSiteChanges: [],
                },
            })
            .mockResolvedValueOnce({ ok: true, data: { revision: 3 } });
        render();
        click(button(/Visible$/));
        await wait(1500);
        expect($("[role=status]")?.textContent).toBe("Not published · 1 block");
        click(button(/Hidden$/));
        await wait(1500);
        expect(actions.saveDraftSections).toHaveBeenCalledTimes(2);
        expect($("[role=status]")?.textContent).toBe(
            "Couldn't check what's changed",
        );
    });

    it("says what publishing would change beside the pill when a verdict outranks it", () => {
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
        // The design's pill for an approval that still covers the draft.
        expect($("[role=status]")?.textContent).toBe("Approved");
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

        // The header cannot move or go: its inspector says why instead,
        // beside the controls (G6).
        expect(() => button("Move block up")).toThrow();

        expect(button("Move up").disabled).toBe(true);
        expect(host.textContent).toContain(
            "On every page — can't be removed or moved",
        );
    });

    it("opens the style panel from the Brand tab and comes back from Page", () => {
        const { siteId } = render();
        click(button("Brand"));
        expect(button("Brand").getAttribute("aria-selected")).toBe("true");
        expect(host.textContent).toContain("plain system font");
        expect(() => button("Header")).toThrow();
        // Remembered, so a reload comes back to it as it did to Style.
        expect(prefs.getPlace(siteId, SECTIONS.length).rail).toBe("style");
        click(button("Page"));
        expect(button("Page").getAttribute("aria-selected")).toBe("true");
        expect(button("Header")).toBeTruthy();
    });

    it("shows the Add tab and adds a block after the selected one", () => {
        render();
        click(button("Add"));
        expect(button("Add").getAttribute("aria-selected")).toBe("true");
        const before = $$("[data-block-index]").length;
        // Any block with a single look goes straight in.
        const tile = Array.from(
            host.querySelectorAll<HTMLButtonElement>("aside button"),
        ).find((b) => b.textContent.includes("Contact"));
        if (!tile) throw new Error("No Contact tile");
        click(tile);
        // Back on the page's blocks, with the new one selected second.
        expect(button("Page").getAttribute("aria-selected")).toBe("true");
        expect(host.textContent).toContain("5 blocks");
        expect($$("[data-block-index]").length).toBe(before + 1);
        const rows = $$("aside li button[aria-current]");
        expect(rows).toHaveLength(1);
    });

    /*
     * G5 changed this: Preview was a full-screen overlay with its own copy
     * of the page ("Escape to return"). It is now the same canvas with the
     * editing tools put away, and the top bar stays.
     */
    it("Preview puts the editing tools away in place, and Escape returns", () => {
        render();
        const blocksBefore = $$("[data-block-index]").length;
        expect(blocksBefore).toBeGreaterThan(0);
        click(button("Preview"));

        // The same canvas, with no block outlines or labels on it.
        expect($("[data-previewing]")).not.toBeNull();
        expect($$("[data-block-index]")).toHaveLength(0);
        expect(() => button(/^Hero block, 1 of/)).toThrow();
        expect(() => button("Header, on every page")).toThrow();
        expect(host.textContent).toContain("Welcome in");
        // The rail and inspector are away, kept mounted, and the bar stays.
        const aside = $("aside");
        expect(aside?.closest("[hidden]")).not.toBeNull();
        expect(button("Editing").getAttribute("aria-pressed")).toBe("true");
        expect(button("Publish")).toBeTruthy();
        expect(host.textContent).toContain(
            "This is your site with the draft. Try it; nothing is live until you publish.",
        );
        // No window bar round the site.
        expect(host.textContent).not.toContain("flour.saroh.app/");

        act(() => {
            window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape" }),
            );
        });
        expect($("[data-previewing]")).toBeNull();
        expect($$("[data-block-index]")).toHaveLength(blocksBefore);
        expect($("aside")?.closest("[hidden]")).toBeNull();
        expect(button("Preview").getAttribute("aria-pressed")).toBe("false");
    });

    it("Back to editing leaves Preview, with the block still selected", () => {
        render();
        click(button("Our story"));
        click(button("Preview"));
        click(button(/^Back to editing/));
        expect($("[data-previewing]")).toBeNull();
        expect(button("Our story").getAttribute("aria-current")).toBe("true");
    });

    it("keeps the device and zoom in Preview", () => {
        render();
        click(button("Show at phone width"));
        click(button("Preview"));
        expect(frame().style.maxWidth).toBe("23.4375rem");
        expect(frame().style.transform).toBe("scale(1)");
        // Still switchable from the bar while previewing.
        click(button("Show at tablet width"));
        expect(frame().style.maxWidth).toBe("48rem");
        expect($("[data-previewing]")).not.toBeNull();
        expect(button("Zoom").textContent).toContain("100%");
    });

    it("opens a page linked from the site's menu in Preview, and stays in Preview", () => {
        const contact: SitePage = {
            id: "p-contact",
            path: "/contact",
            title: "Contact",
            isHome: false,
            hidden: false,
        };
        const props = render({
            pages: [...PAGES, contact],
            navigation: { items: [{ pageId: "p-contact" }] },
        });
        click(button("Preview"));
        const opened = vi.spyOn(window, "open").mockReturnValue(null);
        const link = $$("header a").find((a) => a.textContent === "Contact");
        if (!link) throw new Error("No Contact link in the menu");
        // A real click, which can be cancelled, as a browser's is.
        act(() => link.click());
        expect(opened).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith(
            `/sites/${props.siteId}?page=p-contact`,
        );

        // The route remounts the editor on that page (it is keyed on it).
        act(() => {
            root.render(
                <SiteEditor key="p-contact" {...props} pageId="p-contact" />,
            );
        });
        expect(button(/^Page: Contact\./)).toBeTruthy();
        expect($("[data-previewing]")).not.toBeNull();

        // Only that once: the next time this page opens, it opens editing.
        act(() => {
            root.render(
                <SiteEditor key="again" {...props} pageId="p-contact" />,
            );
        });
        expect($("[data-previewing]")).toBeNull();
        opened.mockRestore();
    });

    /** A page whose one block is a hero with a button to `href`. */
    function withButton(href: string): Partial<Props> {
        return {
            initialSections: [
                {
                    key: "s1",
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        heading: "Welcome in",
                        cta: { label: "Go", href, style: "primary" },
                    },
                },
            ],
        };
    }

    /** Click a link as a browser does: the click can be cancelled. */
    function pressLink(text: string) {
        const link = $$("a").find((a) => a.textContent.trim() === text);
        if (!link) throw new Error(`No link ${text}`);
        act(() => link.click());
    }

    it("sends a link to another site to a new tab in Preview", () => {
        render(withButton("https://example.com"));
        click(button("Preview"));
        const opened = vi.spyOn(window, "open").mockReturnValue(null);
        pressLink("Go");
        expect(opened).toHaveBeenCalledWith(
            "https://example.com",
            "_blank",
            "noopener",
        );
        expect(push).not.toHaveBeenCalled();
        opened.mockRestore();
    });

    it("opens a page a button links to in Preview, not a tab", () => {
        const { siteId } = render(withButton("/about"));
        click(button("Preview"));
        const opened = vi.spyOn(window, "open").mockReturnValue(null);
        pressLink("Go");
        expect(opened).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith(`/sites/${siteId}?page=p-about`);
        opened.mockRestore();
    });

    it("selects the block, and opens nothing, when a link is clicked while editing", () => {
        const { siteId } = render(withButton("/about"));
        const opened = vi.spyOn(window, "open").mockReturnValue(null);
        pressLink("Go");
        expect(opened).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalledWith(`/sites/${siteId}?page=p-about`);
        opened.mockRestore();
    });

    it("stays on the page, and says why, when a page is linked while a save is due", async () => {
        const { siteId } = render(withButton("/about"));
        // An edit that has not gone out yet: the autosave is still waiting.
        const heading = Array.from(
            document.querySelectorAll<HTMLInputElement>("input"),
        ).find((i) => i.value === "Welcome in");
        if (!heading) throw new Error("No heading field");
        type(heading, "Welcome back");
        click(button("Preview"));
        pressLink("Go");
        expect(push).not.toHaveBeenCalledWith(`/sites/${siteId}?page=p-about`);
        expect(toast.showError).toHaveBeenCalledWith(
            "Save this page before opening another.",
        );
        await wait(5000);
    });

    it("removes a block at once, and Undo puts it back in its place with its content", () => {
        render();
        click(button("Remove"));
        // G3: no question first; the block goes and Undo is offered.
        expect(
            document.querySelector("[role=alertdialog],[role=dialog]"),
        ).toBeNull();
        expect(host.textContent).toContain("3 blocks");
        expect(() => button("Welcome in")).toThrow();
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Hero taken off this page",
            expect.any(Function),
            { duration: 10_000 },
        );

        act(() => undoFrom(0));
        expect(host.textContent).toContain("4 blocks");
        // First again, selected, and with what was written in it.
        expect(button("Welcome in").getAttribute("aria-current")).toBe("true");
        const rows = $$("aside li button").map((b) => b.textContent);
        expect(rows.findIndex((t) => t.includes("Welcome in"))).toBeLessThan(
            rows.findIndex((t) => t.includes("Our story")),
        );
        expect(toast.dismissToast).toHaveBeenCalledWith(lastUndoId());
    });

    it("undoes only the second of two removes, and takes the first toast away", () => {
        render();
        click(button("Remove"));
        const first = lastUndoId();
        click(button("Our story"));
        click(button("Remove"));
        expect(host.textContent).toContain("2 blocks");
        // The first Undo's window closed when the second action came.
        expect(toast.dismissToast).toHaveBeenCalledWith(first);

        act(() => undoFrom(0));
        expect(host.textContent).toContain("2 blocks");
        act(() => undoFrom(1));
        expect(host.textContent).toContain("3 blocks");
        expect(button("Our story")).toBeTruthy();
        expect(() => button("Welcome in")).toThrow();
    });

    it("saves the restored draft when autosave ran during the toast", async () => {
        render();
        click(button("Remove"));
        await wait(1500);
        expect(sentKeys(0)).toEqual(["s2"]);

        act(() => undoFrom(0));
        await wait(1500);
        expect(actions.saveDraftSections).toHaveBeenCalledTimes(2);
        expect(sentKeys(1)).toEqual(["s1", "s2"]);
    });

    it("shows the save-failed notice when saving the undone draft fails", async () => {
        render();
        click(button("Remove"));
        await wait(1500);
        actions.saveDraftSections.mockResolvedValue({
            ok: false,
            error: "Saroh couldn't save that.",
        });
        act(() => undoFrom(0));
        await wait(1500);
        expect(toast.showError).toHaveBeenCalledWith(
            "Saroh couldn't save that.",
        );
        expect(host.textContent).toContain("Not saved");
    });

    it("moves and hides at once, each with its Undo", () => {
        render();
        click(button("Move block down"));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Hero moved down",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => undoFrom(0));
        // Back on top, and the one selected.
        expect(button("Move block up").disabled).toBe(true);
        expect(button("Welcome in").getAttribute("aria-current")).toBe("true");

        click(button(/Visible$/));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Hero is hidden on this page",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => undoFrom(1));
        expect(button(/Visible$/)).toBeTruthy();
    });

    it("closes the Undo when the page is edited again after the action", () => {
        render();
        click(button("Our story"));
        click(button("Remove"));
        const removed = lastUndoId();
        click(button("Welcome in"));
        click(button(/Visible$/));
        // The remove's Undo would have thrown the hide away with it.
        expect(toast.dismissToast).toHaveBeenCalledWith(removed);
        act(() => undoFrom(0));
        expect(host.textContent).toContain("3 blocks");
    });

    it("takes the Undo toast away when the editor is left", () => {
        render();
        click(button("Remove"));
        const removed = lastUndoId();
        act(() => root.unmount());
        expect(toast.dismissToast).toHaveBeenCalledWith(removed);
        // afterEach unmounts again.
        root = createRoot(host);
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
        // G2: the pill carries what the save counted.
        expect($("[role=status]")?.textContent).toBe("Not published · 1 block");
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

    it("names what goes live in the check, and reads Published after", async () => {
        render({
            initialPendingChanges: 1,
            initialPendingSiteChanges: ["footer"],
        });
        expect($("[role=status]")?.textContent).toBe(
            "Not published · 1 block, footer",
        );
        await press(button("Publish"));
        expect(document.body.textContent).toContain(
            "Publishing puts live: 1 section and the footer.",
        );
        const go = Array.from(
            document.querySelectorAll<HTMLButtonElement>("button"),
        ).filter((b) => b.textContent.startsWith("Publish"));
        await press(go[go.length - 1]);
        await wait(0);
        expect(actions.publishSite).toHaveBeenCalledTimes(1);
        expect($("[role=status]")?.textContent).toBe("Published");
    });

    it("publishes while a page is out for review, and records the bypass", async () => {
        const inReview = { ...REVIEW, pending: true, outstanding: true };
        actions.publishSite.mockResolvedValue({
            ok: true,
            data: { bypassed: true },
        });
        render({ initialReview: inReview, initialPendingChanges: 1 });
        expect($("[role=status]")?.textContent).toBe("In review");
        // The pill says In review, so the line says what would go live.
        expect(
            $("nav[aria-label=Breadcrumb] span[title]")?.textContent,
        ).toContain("1 section changed");
        expect(button("Publish").disabled).toBe(false);
        await press(button("Publish"));
        await press(button("Publish without approval"));
        expect(actions.publishSite).toHaveBeenCalledTimes(1);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Flour & Ferment is live at flour.saroh.app. Recorded as published without approval.",
        );
    });

    it("publishes through the check and says where the site is live", async () => {
        const { siteId } = render();
        await press(button("Publish"));
        expect(actions.getSiteFlags).toHaveBeenCalledWith(siteId);
        // Nothing waiting: the check says so, and still publishes.
        expect(document.body.textContent).toContain(
            "Nothing has changed since the last publish.",
        );
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

/*
 * Header and footer text in the inspector (round 2, G6). The canvas draws
 * them with the live site's own header and footer (G17), so what is typed
 * here is what the site will show.
 */
describe("SiteEditor header and footer text (G6)", () => {
    it("edits the site name from the header; the canvas and bar follow, and it saves as a site change", async () => {
        const { siteId } = render();
        click(button("Header"));
        expect(host.textContent).toContain(
            "On every page of this site. Its text is edited here",
        );
        type(field("Site name"), "Rye & Co.");

        expect(canvasHome()?.getAttribute("aria-label")).toBe(
            "Rye & Co. — home",
        );
        expect($("nav[aria-label=Breadcrumb]")?.textContent).toContain(
            "Rye & Co.",
        );
        // Publish waits for it, as it does for the look.
        expect(button("Publish").disabled).toBe(true);

        await wait(700);
        await wait(0);
        expect(actions.updateSiteSettings).toHaveBeenCalledWith(siteId, {
            name: "Rye & Co.",
        });
        expect(button("Publish").disabled).toBe(false);
        expect($("[role=status]")?.textContent).toBe(
            "Not published · site name",
        );

        // And the live message names the site as it is now.
        await press(button("Publish"));
        const go = Array.from(
            document.querySelectorAll<HTMLButtonElement>("button"),
        ).filter((b) => b.textContent.startsWith("Publish"));
        await press(go[go.length - 1]);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Rye & Co. is live at flour.saroh.app.",
        );
    });

    it("never saves a blank name, and says why", async () => {
        render();
        click(button("Header"));
        type(field("Site name"), "   ");

        expect(host.textContent).toContain("Give your site a name.");
        expect(field("Site name").getAttribute("aria-invalid")).toBe("true");
        // The canvas keeps the last name that could be saved.
        expect(canvasHome()?.getAttribute("aria-label")).toBe(
            "Flour & Ferment — home",
        );
        await wait(1500);
        expect(actions.updateSiteSettings).not.toHaveBeenCalled();
    });

    it("edits the footer line; the canvas draws it before Runs on Saroh, and it saves as the footer", async () => {
        const { siteId } = render();
        // Nothing written yet: the site's name stands in, as G17 draws it.
        expect(canvasFooter()?.textContent).toBe(
            "Flour & Ferment · Runs on Saroh",
        );
        click(button("Footer"));
        expect(host.textContent).toContain(
            "Nothing is written at the foot of this site yet",
        );
        type(field("Footer line"), "Hill Road, Bandra");

        expect(canvasFooter()?.textContent).toBe(
            "Hill Road, Bandra · Runs on Saroh",
        );
        expect(host.textContent).toContain("“Runs on Saroh” follows it.");

        await wait(700);
        await wait(0);
        expect(actions.updateSiteFooter).toHaveBeenCalledWith(siteId, {
            format: "html",
            value: "<p>Hill Road, Bandra</p>",
        });
        expect($("[role=status]")?.textContent).toBe("Not published · footer");
    });

    it("saves an emptied footer as none, and the canvas falls back to the name", async () => {
        const { siteId } = render({
            footerPreview: { format: "html", value: "<p>Old line</p>" },
        });
        expect(canvasFooter()?.textContent).toBe("Old line · Runs on Saroh");
        click(button("Footer"));
        expect(field("Footer line").value).toBe("Old line");
        type(field("Footer line"), "");

        expect(canvasFooter()?.textContent).toBe(
            "Flour & Ferment · Runs on Saroh",
        );
        await wait(700);
        await wait(0);
        expect(actions.updateSiteFooter).toHaveBeenCalledWith(siteId, null);
    });

    it("leaves a footer richer than one line to Website settings", () => {
        const { siteId } = render({
            footerPreview: {
                format: "html",
                value: "<p>One</p><p>Two</p>",
            },
        });
        click(button("Footer"));
        expect(() => field("Footer line")).toThrow();
        expect(host.textContent).toContain(
            "Your footer is more than one line of plain text",
        );
        expect($(`a[href='/sites/${siteId}/settings']`)?.textContent).toBe(
            "Open Website settings",
        );
    });

    it("shows both read-only, with who can change them, without site:update", async () => {
        render({
            canUpdateSite: false,
            footerPreview: { format: "html", value: "<p>Old line</p>" },
        });
        click(button("Header"));
        expect(field("Site name").disabled).toBe(true);
        expect(host.textContent).toContain(
            "Your role can change this page's blocks but not the site's name or footer. An owner or admin can change what your role reaches in Team.",
        );
        click(button("Footer"));
        expect(field("Footer line").disabled).toBe(true);
        expect(field("Footer line").value).toBe("Old line");
        await wait(1500);
        expect(actions.updateSiteSettings).not.toHaveBeenCalled();
        expect(actions.updateSiteFooter).not.toHaveBeenCalled();
    });

    it("says so when the footer does not save, and does not retry it", async () => {
        actions.updateSiteFooter.mockResolvedValue({
            ok: false,
            error: "Could not save the footer.",
        });
        render();
        click(button("Footer"));
        type(field("Footer line"), "Hill Road");
        await wait(700);
        await wait(0);
        expect(toast.showError).toHaveBeenCalledWith(
            "Could not save the footer.",
        );
        await wait(1500);
        expect(actions.updateSiteFooter).toHaveBeenCalledTimes(1);
        // Still unsaved, so Publish still waits.
        expect(button("Publish").disabled).toBe(true);
    });
});
