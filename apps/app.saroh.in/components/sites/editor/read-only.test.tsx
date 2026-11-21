// @vitest-environment jsdom
/**
 * The read-only editor (DEC-200): the guard #275 asked for.
 *
 * A Reviewer opens the real site editor with `readOnly`. #275 kept them on a
 * separate screen because every editor change would have to answer "and with
 * no write access?". This file answers it structurally: the editor is drawn
 * read-only in every place it can be (desk, narrow, phone, each tab, sheet
 * and menu), and EVERY enabled control found must be on the list below of
 * controls that only look, select, switch or write a note. A new control
 * that changes the draft, the site or its pages fails here until it reads
 * `useEditorReadOnly()` (or the list is changed on purpose, in review).
 *
 * Then a second guard: nothing a Reviewer can press sends a write.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as actions from "@/lib/sites/actions";
import * as prefs from "@/lib/sites/editor-prefs";
import type {
    ReviewState,
    Section,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyleOptions } from "@/lib/sites/style";
import type { TestRelease } from "@/lib/sites/test-releases";
import { showUndo } from "@saroh/ui/toast";

import { typeInto } from "./phone/text-sheet";
import { SiteEditor } from "./site-editor";
import { useEditorDraft } from "./use-editor-draft";

// The Website area's switch (KTD-E1): off unless a test turns it on.
const area = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/sites/website-area-switch", () => ({
    websiteAreaOn: () => area.on,
    websiteAreaOnFor: () => area.on,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/sites",
}));

/** Every write the editor can make, each a spy that must stay unpressed. */
const writes = vi.hoisted(() => ({
    publishSite: vi.fn(),
    requestReview: vi.fn(),
    withdrawReview: vi.fn(),
    saveDraftSections: vi.fn(),
    updateSiteStyle: vi.fn(),
    updateSiteSettings: vi.fn(),
    updateSiteFooter: vi.fn(),
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePage: vi.fn(),
    setCommentResolved: vi.fn(),
    createApproval: vi.fn(),
    createPreviewLink: vi.fn(),
    revokePreviewLink: vi.fn(),
    applyStarterContent: vi.fn(),
}));
const releaseWrites = vi.hoisted(() => ({
    createTestRelease: vi.fn(),
    updateTestRelease: vi.fn(),
    discardTestRelease: vi.fn(),
    goLiveWithRelease: vi.fn(),
    scheduleGoLive: vi.fn(),
    cancelScheduledGoLive: vi.fn(),
    createTestReleaseLink: vi.fn(),
    openTestRelease: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => ({
    ...writes,
    getReviewState: vi.fn(() => Promise.resolve(REVIEW)),
    getSiteFlags: vi.fn(() =>
        Promise.resolve({ flags: [], awaitingNavigation: [] }),
    ),
    listComments: vi.fn(() => Promise.resolve([])),
    listPreviewLinks: vi.fn(() => Promise.resolve([])),
    // Reading a page is what a Reviewer does (DEC-200, U9): not a write.
    recordPageView: vi.fn(() => Promise.resolve({ ok: false })),
}));
vi.mock("@/lib/sites/test-releases-actions", () => ({
    ...releaseWrites,
    listTestReleases: vi.fn(() => Promise.resolve({ ok: false })),
    readSiteLiveState: vi.fn(() => Promise.resolve({ ok: false })),
}));
// The same plain popover the editor's own test uses (see there for why).
vi.mock("@saroh/ui/popover", async () => {
    const React = await import("react");
    const Ctx = React.createContext({
        open: false,
        setOpen: (_: boolean) => undefined as void,
    });
    function Popover({
        open,
        onOpenChange,
        children,
    }: {
        open?: boolean;
        onOpenChange?: (next: boolean) => void;
        children: React.ReactNode;
    }) {
        const [own, setOwn] = React.useState(false);
        const value = open ?? own;
        const setOpen = (next: boolean) => {
            setOwn(next);
            onOpenChange?.(next);
        };
        return React.createElement(
            Ctx.Provider,
            { value: { open: value, setOpen } },
            children,
        );
    }
    function PopoverTrigger({ children }: { children: React.ReactElement }) {
        const { open, setOpen } = React.useContext(Ctx);
        return React.cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            { "aria-expanded": open, onClick: () => setOpen(!open) },
        );
    }
    function PopoverContent({ children }: { children: React.ReactNode }) {
        const { open } = React.useContext(Ctx);
        return open
            ? React.createElement("div", { role: "dialog" }, children)
            : null;
    }
    return { Popover, PopoverTrigger, PopoverContent };
});
vi.mock("@/lib/api/http", () => ({
    apiFetch: vi.fn(),
    getJson: vi.fn(),
    getList: vi.fn(),
    mutate: vi.fn(),
}));
vi.mock("@/lib/forms/actions", () => ({ ensureFormForSection: vi.fn() }));
// Rail › History's reads (U46b); its Undo is a write, a spy that must
// stay unpressed in every test here.
const revertChange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sites/change-revert-actions", () => ({ revertChange }));
vi.mock("@/lib/sites/changes-read", () => ({
    readSiteChanges: vi.fn(() =>
        Promise.resolve({
            siteId: "site",
            livePublishedAt: "2026-11-14T12:00:00.000Z",
            count: 1,
            units: [
                {
                    key: "section:p-home:s1",
                    kind: "section",
                    change: "changed",
                    label: "Changed · Top of the page",
                    where: "Home",
                    pageId: "p-home",
                    fingerprint: "f",
                    editedBy: null,
                    editedAt: null,
                    requires: [],
                    approval: {
                        state: "not-needed",
                        voided: false,
                        approvers: [],
                    },
                },
            ],
            groups: [
                {
                    userId: null,
                    name: null,
                    you: false,
                    units: ["section:p-home:s1"],
                },
            ],
            posts: [],
            approvalRequired: false,
        }),
    ),
}));
vi.mock("@/lib/sites/history-read", () => ({
    readVersions: vi.fn(() =>
        Promise.resolve([
            {
                id: "pub-1",
                publishedAt: "2026-11-14T12:00:00.000Z",
                publishedByUserId: null,
                publishedBy: "Sample Owner",
                templateId: "t",
                templateVersion: 1,
                isCurrent: true,
                bypass: null,
                reviewRoute: null,
            },
        ]),
    ),
    readVersion: vi.fn(() => Promise.resolve(null)),
    readChangesAgainst: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/services/actions", () => ({
    listServicesForPicker: vi.fn(() =>
        Promise.resolve({ ok: true, services: [] }),
    ),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(() => "undo"),
    dismissToast: vi.fn(),
}));

class FakeResizeObserver {
    observe() {
        // jsdom has no layout to measure.
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
const SECTIONS: Section[] = [
    {
        key: "s1",
        type: "hero",
        contractVersion: 1,
        content: { heading: "Welcome in" },
    },
    {
        key: "s2",
        type: "hero",
        contractVersion: 1,
        content: { heading: "Our story" },
        hidden: true,
    },
];
const STYLE_OPTIONS: SiteStyleOptions = {
    rows: [
        {
            key: "pageGround",
            label: "Background",
            swatches: [{ key: "paper", label: "Paper", hsl: "40 30% 96%" }],
        },
    ],
    scalars: [
        {
            key: "sectionPadding",
            label: "Space between blocks",
            min: 0,
            max: 10,
            step: 1,
            unit: "rem",
            default: 4,
        },
    ],
    fontPairs: [
        { key: "system", name: "Your visitor's system font" },
        { key: "newsreader", name: "Newsreader" },
    ],
};
const REVIEW: ReviewState = {
    openNotes: 1,
    latestApproval: null,
    outstanding: false,
    pending: true,
    approvalIsStale: false,
};
const NOTE = {
    id: "c1",
    pageId: "p-home",
    pageTitle: "Home",
    sectionKey: "s1",
    body: "Say the Saturday cut-off too.",
    author: { id: "u-rev", name: "Priya Example" },
    createdAt: "2026-10-28T10:00:00.000Z",
    resolvedAt: null,
    resolvedBy: null,
    orphaned: false,
} as unknown as SiteCommentView;
const SETTLED = {
    ...NOTE,
    id: "c2",
    body: "Fixed the phone number.",
    resolvedAt: "2026-10-28T12:00:00.000Z",
} as unknown as SiteCommentView;
const RELEASE: TestRelease = {
    id: "r1",
    number: 1,
    name: "Diwali menu",
    note: null,
    status: "ready",
    createdAt: "2026-10-27T10:00:00.000Z",
    createdBy: { name: "Asha Example" },
    draftChangedSince: false,
    standing: {
        outstanding: true,
        route: "review",
        approved: false,
        latest: null,
    },
    schedule: null,
    wentLiveAt: null,
    livePublicationId: null,
    discardedAt: null,
    lastGoLive: null,
    links: [],
};

/*
 * What a Reviewer may press: it looks, selects, switches or writes a note
 * (`site:comment`, theirs to make). Each line is a decision; adding one is a
 * claim that the control changes nothing a Reviewer may not change.
 */
const ALLOWED: RegExp[] = [
    // Seeing: theme, width, zoom, Preview.
    /^(Light|Dark)(, following your system)?\. Switch to (light|dark)\.$/,
    /^Show at (desktop|tablet|phone) width$/,
    /^Zoom$/,
    /^(Preview|Editing|Back to editing)(See the page as visitors will.*)?$/,
    // Where you are: pages, the rail's and inspector's tabs, the panels.
    /^Page: .+\. Choose another page to edit$/,
    /^(Page|Brand|Block|Blocks)$/,
    /^Feedback ?(\d+)?$/,
    /^FeedbackNotes from your team on this site\d*$/,
    /^(This block|Whole site) ?(\d+)?$/,
    /^More: preview, feedback/,
    /^Resize the (block list|inspector)$/,
    /^Close/,
    /^Make the sheet (taller|shorter)$/,
    // Selecting a block, the header or the footer, in the list or on the page.
    /^(Header|Footer)(, on every page.*)?$/,
    /^Top of the page section, \d+ of \d+(, selected)?$/,
    /^(Welcome in|Our story)$/,
    /^Top of the page(Welcome in|Our story)/,
    /^(Header|Footer)On every page/,
    /open on this block\. Read the feedback$/,
    // Reading notes: go to one, show the settled ones.
    /^Go to section$/,
    /^(Show|Hide) settled$/,
    /^(Show|Hide) \d+ settled notes?$/,
    // Writing a note is the Reviewer's job (`site:comment`), and changing
    // their own (DEC-200, U3).
    /^Add a note on .+$/,
    /^(Edit|Delete) your note$/,
    // The verdict, in the top bar (`site:approve`, DEC-200 U4); the spy
    // below proves none of these is pressed by the scenes here.
    /^(Ask for changes|Approve|Change your review)$/,
    // A phone's verdict (U5): Review opens the sheet; its two rows, the
    // reason and Send. The spy below proves Send is not pressed here.
    /^Review$/,
    /^(Approve|Ask for changes)(It’s ready to go live\.|Your \d+ open notes? go(es)? with it\.|Say what needs changing\.)$/,
    /^What needs changing\?$/,
    /^Send to .+$/,
    /^Feedback, \d+ open notes?$/,
    /^(See the notes|Show all|Try again)$/,
    // Test releases: the list, and each one's own review page (a link).
    /^Test releases( · )?\d*$/,
    /^Show (all \d+|fewer)$/,
    // The new desk shell (U46): the rail, the Pages tree, More and its
    // looking-only items.
    /^Pages$/,
    /^More: desk, tablet or phone width/,
    /^(Home\/|About\/about)$/,
    /^Our storyHidden$/,
    /^(Desk|Tablet|Phone|Fit|\d+%)$/,
    /^Page settings$/,
    /^Test links\d*$/,
    /^Theme: switch to (light|dark)$/,
    // The new inspector (U47): its tabs, and the whole site's notes.
    /^(Content|Style|Visibility)$/,
    /^All notes on this site$/,
    // The one phone editor (U49): the page picker, the Sections sheet's
    // rows and pinned header and footer, and a reader's way to Brand.
    /^Page: .+\. Choose another page or change its settings$/,
    /^(Welcome in|Our story)(Top of the page|Hidden when published)$/,
    /^Open the (header|footer)$/,
    /^(Sections on this page|Done)$/,
    // Preview at three sizes (U46f): which sizes, and scrolling together.
    /^(All three|Desktop|Tablet|Phone|Scroll together)$/,
    // Find (U46c): opening it, its box, and what a reader finds there:
    // the page's sections, the header and footer, the other pages.
    /^Find⌘K$/,
    /^Find or do anything$/,
    /^(Welcome in|Our story) section/,
    /^(Header|Footer)On every page/,
    /^About\/about/,
];

/** The page's options in the page picker: switching page writes nothing. */
const isPageOption = (el: Element) =>
    el.matches("[role=listbox][aria-label='Page to edit'] [role=option]");

const CONTROLS = [
    "button",
    "input",
    "textarea",
    "select",
    "[role=button]",
    "[role=tab]",
    "[role=option]",
    "[role=radio]",
    "[role=checkbox]",
    "[role=switch]",
    "[role=slider]",
    "[role=menuitem]",
    "[role=menuitemradio]",
    "[role=separator]",
    "[draggable=true]",
    "[contenteditable]",
].join(",");

function nameOf(el: Element): string {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent.trim();
    }
    return el.textContent.replace(/\s+/g, " ").trim();
}

function isEnabled(el: Element): boolean {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.closest("fieldset[disabled], [inert], [hidden]")) return false;
    // A radio group's hidden form input: its radio is what is pressed.
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
}

/** Every enabled control on screen that is not on the list, by name. */
function writeControls(): string[] {
    const docs: Document[] = [document];
    for (const frame of Array.from(document.querySelectorAll("iframe"))) {
        if (frame.contentDocument) docs.push(frame.contentDocument);
    }
    return (
        docs
            .flatMap((d) => Array.from(d.querySelectorAll(CONTROLS)))
            .filter(isEnabled)
            .filter((el) => !isPageOption(el))
            // A menu's divider is drawn, not pressed.
            .filter((el) => !el.matches("[role=menu] [role=separator]"))
            .map(nameOf)
            .filter((name) => !ALLOWED.some((ok) => ok.test(name)))
    );
}

let root: Root;
let host: HTMLDivElement;
let site = 0;
type Props = Parameters<typeof SiteEditor>[0];

function render(overrides: Partial<Props> = {}) {
    site += 1;
    const props: Props = {
        siteId: `site-${site}`,
        pageId: "p-home",
        pages: PAGES,
        readOnly: true,
        initialFlags: { flags: [], awaitingNavigation: [] },
        initialComments: [NOTE, SETTLED],
        initialReview: REVIEW,
        neverPublished: false,
        unreadableSections: [],
        initialPendingChanges: null,
        initialPendingSiteChanges: null,
        initialSections: SECTIONS,
        initialRevision: 0,
        siteName: "Flour & Ferment",
        navigation: null,
        footerPreview: null,
        // As the page sends for a Reviewer: none of the owner's powers.
        canUpdateSite: false,
        canPublish: false,
        address: "flour.saroh.app",
        initialStyle: {
            colours: { pageGround: "paper" },
            scalars: { sectionPadding: 4 },
            fontPair: "newsreader",
        },
        styleOptions: STYLE_OPTIONS,
        initialTestReleases: {
            state: "on",
            list: { testHosts: [], zone: "Asia/Kolkata", releases: [RELEASE] },
        },
        reloadDraft: vi.fn(),
        ...overrides,
    };
    act(() => root.render(<SiteEditor {...props} />));
    return props;
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

function button(name: string | RegExp): HTMLElement {
    const hit = Array.from(
        document.querySelectorAll<HTMLElement>("button,[role=tab]"),
    ).find((b) => {
        const label = nameOf(b);
        return typeof name === "string" ? label === name : name.test(label);
    });
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}
const has = (name: string | RegExp) => {
    try {
        button(name);
        return true;
    } catch {
        return false;
    }
};

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function key(k: string, mods: KeyboardEventInit = {}) {
    act(() => {
        (document.activeElement ?? document.body).dispatchEvent(
            new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods }),
        );
    });
}

let width = 1440;
function atWidth(px: number) {
    width = px;
}

/** No write control, and the scene named if one is found. */
function expectReadOnly(scene: string) {
    expect(writeControls(), scene).toEqual([]);
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    width = 1440;
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
            get matches() {
                const max = /max-width:\s*([\d.]+)px/.exec(query);
                return max ? width <= Number(max[1]) : false;
            },
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
    Element.prototype.scrollTo = vi.fn();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    prefs.setChrome(prefs.CHROME_DEFAULT);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    area.on = false;
    // Long enough for any autosave (1.5s) to have fired, had it been armed.
    await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
    });
    for (const spy of [
        ...Object.values(writes),
        ...Object.values(releaseWrites),
        revertChange,
    ]) {
        expect(spy).not.toHaveBeenCalled();
    }
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("the read-only editor draws no write control (DEC-200)", () => {
    it("on a desk: the bar, the rail, the canvas and the inspector", () => {
        render();
        expectReadOnly("desk, Page tab, first block selected");
        // What a Reviewer sees: the same page, blocks and inspector.
        expect(button("Welcome in")).toBeTruthy();
        expect(button("Our story")).toBeTruthy();
        expect($("aside[aria-label=Inspector]")).not.toBeNull();
        // And none of the owner's actions.
        for (const gone of [
            "Add",
            "Publish",
            "Share",
            "Test release",
            "Remove",
            "Move block up",
            "Move block down",
        ]) {
            expect(has(gone), gone).toBe(false);
        }
        expect($("[draggable=true]")).toBeNull();
    });

    it("the selected block's settings, readable, with a way to note it", () => {
        render();
        click(button("Our story"));
        // A Reviewer opens on Feedback (DEC-200, U4); Block is a tab away.
        click(button("Block"));
        expectReadOnly("desk, Block tab, hidden block selected");
        expect($("aside[aria-label=Inspector]")?.textContent ?? "").toContain(
            "Hidden when published",
        );
        // Its fields are drawn, with their values, but can't be changed.
        const heading = Array.from(
            document.querySelectorAll<HTMLInputElement>(
                "aside[aria-label=Inspector] input",
            ),
        ).find((i) => i.value === "Our story");
        expect(heading).toBeTruthy();
        click(button("Add a note on this block"));
        expect(button(/^Feedback/).getAttribute("aria-selected")).toBe("true");
        expectReadOnly("desk, Feedback for the block");
    });

    it("Feedback, the block's and the whole site's", () => {
        render();
        click(button(/^Feedback/));
        expectReadOnly("desk, Feedback, this block");
        expect(has("Mark settled")).toBe(false);
        click(button(/^Whole site/));
        expectReadOnly("desk, Feedback, whole site");
        // The verdict is the top bar's alone (U4), never in the panel.
        const panel = $("aside[aria-label=Inspector]")?.textContent ?? "";
        expect(panel).not.toMatch(/Approve|Ask for changes/);
        expect(has("Approve")).toBe(true);
        expect(has(/preview link/i)).toBe(false);
        click(button("Show settled"));
        expectReadOnly("desk, Feedback, whole site, settled shown");
        expect(has("Reopen")).toBe(false);
    });

    it("Brand: the look as rows, nothing to choose", () => {
        render();
        click(button("Brand"));
        expectReadOnly("desk, Brand tab");
        const rail = document.body.textContent;
        expect(rail).toContain(
            "You can see the look. Owners and admins change it.",
        );
        expect(rail).toContain("Newsreader");
        expect(rail).toContain("Paper");
        expect(has(/^Reset/)).toBe(false);
    });

    it("the page picker switches page and nothing else", () => {
        render();
        click(button(/^Page: Home/));
        expectReadOnly("desk, page picker");
        expect(has(/^Add a page/)).toBe(false);
        expect(has(/^Settings for/)).toBe(false);
        // Posts are reached from here, read-only in the post editor (U8).
        expect(document.querySelector('a[href$="/posts"]')?.textContent).toBe(
            "Posts",
        );
    });

    it("test releases: each one's review, nothing to make, share or put live", () => {
        render();
        click(button("Test releases · 1"));
        expectReadOnly("desk, test releases");
        for (const gone of [
            "Make a test release",
            "Open",
            "Go live…",
            "Schedule…",
            "Discard",
        ]) {
            expect(has(gone), gone).toBe(false);
        }
        expect($("a[href$='/releases/r1']")?.textContent.trim()).toBe("Review");
    });

    it("narrow: More holds nothing that writes", () => {
        atWidth(1000);
        render();
        expectReadOnly("narrow");
        click(button(/^More: preview, feedback/));
        expectReadOnly("narrow, More");
    });

    it("on a phone: the pill, its sheets and More", () => {
        atWidth(390);
        render();
        expectReadOnly("phone");
        expect(has("Add a block")).toBe(false);
        click(button("Blocks"));
        expectReadOnly("phone, Blocks sheet");
        expect($("[aria-label^='Move ']")).toBeNull();
        click(button(/^Top of the pageWelcome in/));
        expectReadOnly("phone, a block's sheet");
        click(button("Close the block panel"));
        // Brand is a tab in the Blocks sheet, not on the pill (U5).
        expect(has("Brand")).toBe(false);
        click(button("Blocks"));
        click(button("Brand"));
        expectReadOnly("phone, Blocks sheet, Brand tab");
        click(button("Close the block list"));
        click(button(/^Feedback, /));
        expectReadOnly("phone, Feedback sheet");
        click(button("Close the block panel"));
        click(button("Review"));
        expectReadOnly("phone, Review sheet");
        click(button("Close your review"));
        click(button(/^More: preview/));
        expectReadOnly("phone, More");
        click(button("Close More"));
        click(button(/^Page: Home/));
        expectReadOnly("phone, Pages");
    });

    it("the canvas: a tapped block on a phone gets no toolbar", () => {
        atWidth(390);
        render();
        const block = $("[data-block-index='0'] > button[aria-pressed]");
        if (!block) throw new Error("No block on the canvas");
        click(block);
        expectReadOnly("phone, block tapped on the canvas");
        expect(has(/^Move .* (up|down)$/)).toBe(false);
    });

    it("keys an editor answers change nothing", () => {
        render();
        click(button("Welcome in"));
        for (const k of ["Delete", "Backspace", "ArrowUp", "ArrowDown"]) {
            key(k);
        }
        key("z", { metaKey: true });
        key("z", { metaKey: true, shiftKey: true });
        key("Escape");
        // Saves and writes are checked after every test (afterEach).
        expect(button("Welcome in")).toBeTruthy();
    });

    it("selecting, switching tabs and widths sends nothing", () => {
        render();
        click(button("Our story"));
        click(button(/^Feedback/));
        click(button("Block"));
        click(button("Brand"));
        click(button("Page"));
        click(button("Show at phone width"));
        click(button("Preview"));
        key("Escape");
    });
});

describe("feedback and the verdict for a Reviewer (DEC-200, U4)", () => {
    const flush = () =>
        act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
    const inspector = () => $("aside[aria-label=Inspector]")?.textContent ?? "";

    it("opens on Feedback, the tag and the verdict in the bar, and reads the page once", async () => {
        render();
        await flush();
        expect(button(/^Feedback/).getAttribute("aria-selected")).toBe("true");
        expect($("[data-reviewing]")?.textContent).toBe(
            "Reviewing · you can’t change anything",
        );
        expect(has("Ask for changes")).toBe(true);
        expect(has("Approve")).toBe(true);
        expect(actions.recordPageView).toHaveBeenCalledTimes(1);
        expect(actions.recordPageView).toHaveBeenCalledWith(
            expect.stringMatching(/^site-/),
            "p-home",
        );
        // The composer names the block.
        expect(document.querySelector("label")?.textContent).toBeDefined();
        expect(document.body.textContent).toContain(
            "Add a note on Top of the page",
        );
    });

    it("a reader who may only read is offered no note box and no verdict", async () => {
        render({ reviewCan: { comment: false, approve: false } });
        await flush();
        expect(has("Ask for changes")).toBe(false);
        expect(has("Approve")).toBe(false);
        expect(document.body.textContent).not.toContain(
            "Add a note on Top of the page",
        );
        // Reading stays: the tag and the Feedback tab are still there.
        expect($("[data-reviewing]")).not.toBeNull();
    });

    it("on a phone, a reader who may not approve has no Review to open", async () => {
        atWidth(390);
        render({ reviewCan: { comment: true, approve: false } });
        await flush();
        expect(has("Review")).toBe(false);
        expect(has(/^Publish/)).toBe(false);
    });

    it("may comment but not approve: the note box, no verdict", async () => {
        render({ reviewCan: { comment: true, approve: false } });
        await flush();
        expect(has("Approve")).toBe(false);
        expect(document.body.textContent).toContain(
            "Add a note on Top of the page",
        );
    });

    it("the request line, from the review state", () => {
        render({
            initialReview: {
                ...REVIEW,
                request: { by: "Asha Example", at: "2026-10-28T09:00:00.000Z" },
            },
        });
        expect(inspector()).toContain("Asha Example asked you to review");
    });

    it("your own open note: Edit and Delete, and You; locked after an approval", () => {
        render({
            initialComments: [
                { ...NOTE, mine: true, editable: true },
                {
                    ...NOTE,
                    id: "c3",
                    body: "Before the approval.",
                    mine: true,
                    editable: false,
                },
            ] as SiteCommentView[],
        });
        expect(has("Edit your note")).toBe(true);
        expect(has("Delete your note")).toBe(true);
        expect(
            Array.from(document.querySelectorAll("button")).filter(
                (b) => b.getAttribute("aria-label") === "Edit your note",
            ),
        ).toHaveLength(1);
        expect(inspector()).toContain("Kept with the approved review");
        expect(inspector()).toContain("You");
        expectReadOnly("desk, own notes");
    });

    it("a note in Whole site selects its block, with its notes", () => {
        render();
        click(button("Our story"));
        click(button(/^Whole site/));
        click(button("Go to section"));
        // Back on This block, with the first block's note (it is on s1).
        expect(inspector()).toContain("Say the Saturday cut-off too.");
        expect(inspector()).not.toContain("Nothing said about this");
        expect(inspector()).toContain("Pinned to this block");
    });

    it("a note on another page opens that page with its block selected", () => {
        const onAbout = { ...NOTE, pageId: "p-about", pageTitle: "About" };
        const first = render({ initialComments: [onAbout] });
        click(button(/^Whole site/));
        click(button("Go to section"));
        // The router takes us there; the About page's editor then opens,
        // a new mount (the page keys it on the page).
        act(() => root.unmount());
        root = createRoot(host);
        render({
            siteId: first.siteId,
            pageId: "p-about",
            initialComments: [onAbout],
            initialSections: [SECTIONS[1], { ...SECTIONS[0], key: "s1" }],
        });
        expect(inspector()).toContain("Say the Saturday cut-off too.");
        expect(inspector()).toContain("Pinned to this block");
    });

    it("See the notes opens Whole site, settled only", () => {
        render({
            initialReview: {
                ...REVIEW,
                settledForYou: { count: 1, at: "2026-10-28T12:00:00.000Z" },
            },
        });
        click(button("See the notes"));
        expect(inspector()).toContain("Settled notes");
        expect(inspector()).toContain("Fixed the phone number.");
        expect(inspector()).not.toContain("Say the Saturday cut-off too.");
        click(button("Show all"));
        expect(inspector()).toContain("Say the Saturday cut-off too.");
    });

    it("couldn't load keeps an unsent note through Try again", async () => {
        // Opening the page records it and re-reads; the re-read fails.
        vi.mocked(actions.recordPageView).mockResolvedValueOnce({
            ok: true,
            data: { recorded: true },
        });
        vi.mocked(actions.getReviewState).mockRejectedValueOnce(
            new Error("offline"),
        );
        render();
        await flush();
        expect(inspector()).toContain("Couldn't load the draft");
        const field = document.querySelector<HTMLTextAreaElement>(
            "#block-feedback-reply",
        );
        if (!field) throw new Error("no composer");
        act(() => {
            Reflect.set(
                HTMLTextAreaElement.prototype,
                "value",
                "Unsent words",
                field,
            );
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        click(button("Try again"));
        await flush();
        expect(inspector()).not.toContain("Couldn't load the draft");
        expect(
            document.querySelector<HTMLTextAreaElement>("#block-feedback-reply")
                ?.value,
        ).toBe("Unsent words");
    });
});

describe("a Reviewer on a phone (DEC-200, U5)", () => {
    const sheet = (title: string) =>
        $(`[data-editor-sheet="${title}"]`)?.textContent ?? null;
    const onCanvas = (index: number) => {
        const block = $(`[data-block-index='${index}'] > button[aria-pressed]`);
        if (!block) throw new Error(`No block ${index} on the canvas`);
        return block;
    };

    beforeEach(() => atWidth(390));

    it("the pill is Blocks · Feedback n; Feedback opens the notes", () => {
        render();
        const pill = $("[data-edit-pill]");
        expect(
            Array.from(pill?.querySelectorAll("button") ?? []).map(nameOf),
        ).toEqual(["Blocks", "Feedback, 1 open note"]);
        click(button("Feedback, 1 open note"));
        expect($("[data-editor-sheet]")).not.toBeNull();
        expect(button(/^Feedback/).getAttribute("aria-selected")).toBe("true");
    });

    it("tapping a block on the canvas selects it and opens its Feedback", () => {
        render();
        click(onCanvas(0));
        expect(onCanvas(0).getAttribute("aria-pressed")).toBe("true");
        // The sheet names the block, on its Feedback (RVD1Phone).
        expect(sheet("Top of the page")).toContain(
            "Add a note on Top of the page",
        );
        // Even after the Block tab was looked at.
        click(button("Block"));
        click(button("Close the block panel"));
        click(onCanvas(0));
        expect(button(/^Feedback/).getAttribute("aria-selected")).toBe("true");
    });

    it("tapping a block in the Blocks sheet scrolls the page to it and selects it", () => {
        render();
        click(button("Blocks"));
        expect(sheet("Blocks on Home")).not.toBeNull();
        const scrolled = vi.fn();
        Element.prototype.scrollTo = scrolled;
        click(button(/^Top of the pageWelcome in/));
        act(() => {
            vi.advanceTimersByTime(20);
        });
        expect(scrolled).toHaveBeenCalled();
        expect(onCanvas(0).getAttribute("aria-pressed")).toBe("true");
    });

    it("the Blocks sheet's Brand tab shows the look as rows", () => {
        render();
        click(button("Blocks"));
        click(button("Brand"));
        expect(sheet("Blocks on Home")).toContain(
            "You can see the look. Owners and admins change it.",
        );
        expect(sheet("Blocks on Home")).toContain("Newsreader");
    });

    it("every control in the pill, the bar's Review and the sheets is 44px", () => {
        render();
        const tall = /(^|\s)(coarse:)?(min-)?h-1[12]\b|(^|\s)size-11\b/;
        const short = (scope: string) =>
            Array.from(document.querySelectorAll(scope))
                .flatMap((el) => Array.from(el.querySelectorAll(CONTROLS)))
                // The grip is a mouse's: the sheet's whole head drags.
                .filter((el) => !nameOf(el).startsWith("Make the sheet"))
                // A field of several lines is taller than a row anyway.
                .filter((el) => el.tagName !== "TEXTAREA")
                .filter((el) => el.getAttribute("aria-hidden") !== "true")
                .filter((el) => {
                    const own = el.className.toString();
                    const row = el.closest("label")?.className ?? "";
                    return !tall.test(own) && !tall.test(row);
                })
                .map(nameOf);
        expect(short("[data-edit-pill]"), "pill").toEqual([]);
        expect(tall.test(button("Review").className)).toBe(true);
        click(button("Blocks"));
        expect(short("[data-editor-sheet]"), "Blocks").toEqual([]);
        click(button("Brand"));
        expect(short("[data-editor-sheet]"), "Brand").toEqual([]);
        click(button("Close the block list"));
        click(button("Review"));
        click(button(/^Ask for changes/));
        expect(short("[data-editor-sheet]"), "Your review").toEqual([]);
    });

    it("Review opens the sheet: the request, what you've read, and a reason for Ask", () => {
        render({
            initialComments: [
                { ...NOTE, mine: true, editable: true },
            ] as SiteCommentView[],
            initialReview: {
                ...REVIEW,
                request: { by: "Asha Example", at: "2026-10-28T09:00:00.000Z" },
                pagesRead: { read: 1, total: 2 },
            },
        });
        click(button("Review"));
        const text = () => sheet("Your review") ?? "";
        expect(text()).toContain("Asha Example asked you to review");
        expect(text()).toContain("You’ve read 1 of 2 pages · 1 open note");
        expect(text()).toContain(
            "Approving doesn’t publish. Asha Example decides when it goes live.",
        );
        // With a note of your own, Ask for changes is chosen, and needs a reason.
        expect(button(/^Ask for changes/).getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(text()).toContain("Your 1 open note goes with it.");
        click(button("Send to Asha Example"));
        expect(text()).toContain("Say what needs changing.");
        expect(writes.createApproval).not.toHaveBeenCalled();
        click(button(/^Approve/));
        expect(document.querySelector("textarea[maxlength='500']")).toBeNull();
    });

    it("a page with no blocks: Feedback has no note composer", () => {
        render({ initialSections: [] });
        click(button(/^Feedback, /));
        expect(sheet("Feedback")).not.toBeNull();
        expect($("#block-feedback-reply")).toBeNull();
        expect(document.body.textContent).not.toContain("Add a note on");
        expectReadOnly("phone, no blocks, Feedback");
    });
});

describe("the same editor, editable (owner regression)", () => {
    it("keeps every write control", () => {
        render({ readOnly: false, canUpdateSite: true, canPublish: true });
        for (const kept of [
            "Add",
            "Publish",
            "In review",
            "Test release",
            "Remove",
        ]) {
            expect(has(kept), kept).toBe(true);
        }
        expect($("[draggable=true]")).not.toBeNull();
        // The guard sees them: this is what fails if one leaks.
        expect(writeControls().length).toBeGreaterThan(0);
        // No reviewer's tag or verdict for the owner (DEC-200, U4).
        expect($("[data-reviewing]")).toBeNull();
        expect(has("Approve")).toBe(false);
        expect(has("Ask for changes")).toBe(false);
        expect(actions.recordPageView).not.toHaveBeenCalled();
    });
    it("keeps the phone's own pill and Publish (U5)", () => {
        atWidth(390);
        render({ readOnly: false, canUpdateSite: true, canPublish: true });
        const pill = $("[data-edit-pill]");
        expect(
            Array.from(pill?.querySelectorAll("button") ?? []).map(nameOf),
        ).toEqual(["Blocks", "Add a block", "Brand"]);
        expect(has("Publish")).toBe(true);
        expect(has("Review")).toBe(false);
        click(button("Blocks"));
        // No Page | Brand tabs in an owner's Blocks sheet.
        expect(has("Page")).toBe(false);
        expect($("[aria-label^='Move ']")).not.toBeNull();
    });
});

describe("the top bar's status for a Reviewer (U6)", () => {
    const status = () =>
        Array.from(document.querySelectorAll('[role="status"]'))
            .map((el) => el.textContent)
            .join(" | ");

    it("says live and since when, never what publishing would change", () => {
        render({
            publishedAt: "2026-10-17T06:00:00.000Z",
            initialPendingChanges: 3,
        });
        expect(status()).toMatch(/Live · published 17 Oct/);
        expect(status()).not.toMatch(/look at|Not published ·|change/i);
    });

    it("says Not published yet for a site never published", () => {
        render({ neverPublished: true, publishedAt: null });
        expect(status()).toContain("Not published yet");
    });

    it("leaves the owner's readout alone", () => {
        render({
            readOnly: false,
            canUpdateSite: true,
            canPublish: true,
            publishedAt: "2026-10-17T06:00:00.000Z",
        });
        expect(status()).not.toContain("published 17 Oct");
    });
});

describe("the draft hook in no-save mode", () => {
    it("never saves, even when its sections change", async () => {
        const probe: { draft?: ReturnType<typeof useEditorDraft> } = {};
        function Probe() {
            probe.draft = useEditorDraft({
                siteId: "site-x",
                pageId: "p-home",
                siteName: "Flour & Ferment",
                initialSections: SECTIONS,
                initialRevision: 0,
                readOnly: true,
                publishing: false,
                recordSaved: vi.fn(),
                refreshFlags: vi.fn(() => Promise.resolve()),
                selectedIndexNow: () => null,
            });
            return null;
        }
        act(() => root.render(<Probe />));
        act(() => probe.draft?.removeAt(0));
        expect(probe.draft?.dirty).toBe(true);
        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        // afterEach: saveDraftSections was never called.
    });
});

/** The open menu's item with this name. */
function menuItem(name: string): HTMLElement {
    const hit = Array.from(
        document.querySelectorAll<HTMLElement>(
            "[role=menuitem],[role=menuitemradio]",
        ),
    ).find((el) => nameOf(el) === name);
    if (!hit) throw new Error(`No menu item ${name}`);
    return hit;
}

/** Open a Radix menu from its trigger, as a keyboard does. */
function openMenu(trigger: HTMLElement) {
    act(() => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
    });
}
const menuItems = () =>
    Array.from(
        document.querySelectorAll<HTMLElement>(
            "[role=menuitem],[role=menuitemradio]",
        ),
    ).map((el) => nameOf(el));

describe("the desk shell with the Website area on (U46)", () => {
    beforeEach(() => {
        area.on = true;
        atWidth(1920);
    });

    it("a reader: Read only, Preview, More and the verdict; nothing that writes", () => {
        render();
        expectReadOnly("shell, reader, Pages tab");
        expect($("[data-reviewing]")?.textContent).toBe("Read only");
        for (const gone of [
            "Undo",
            "Ask AI",
            "Publish",
            "Add section",
            "Add a page",
            "Add",
            "History",
        ]) {
            expect(has(gone), gone).toBe(false);
        }
        expect($("[data-status-chip]")).toBeNull();
        expect($("[draggable=true]")).toBeNull();
        // The rail is Pages · Brand · Feedback (fix/WXMReviewer).
        const trail = $("[data-editor-trail]");
        expect(
            Array.from(trail?.querySelectorAll("button") ?? []).map(
                (b) => b.firstChild?.nextSibling?.textContent,
            ),
        ).toEqual(["Pages", "Brand", "Feedback"]);
        expect(has("Approve")).toBe(true);
        expect(has("Ask for changes")).toBe(true);
        expect(
            $("[data-pages-tree]")?.textContent.includes(
                "Nothing else changes.",
            ),
        ).toBe(true);
    });

    it("a reader's More: how the page is shown and test links, nothing that writes", () => {
        render();
        openMenu(button(/^More: desk/));
        const items = menuItems();
        expect(items).toEqual(
            expect.arrayContaining(["Desk", "Tablet", "Phone", "Fit"]),
        );
        for (const gone of [
            "Redo",
            "Share a test link",
            "Ask a teammate to review",
            "Withdraw the review request",
            "Share a preview link",
            "History",
        ]) {
            expect(items, gone).not.toContain(gone);
        }
        expectReadOnly("shell, reader, More open");
    });

    it("a reader's Find: only On this site, and no photo sheet (U46c, U46d)", () => {
        render();
        key("k", { metaKey: true });
        const find = $("[data-editor-find]");
        expect(find).not.toBeNull();
        const headings = Array.from(
            document.querySelectorAll("[cmdk-group-heading]"),
        ).map((h) => h.textContent);
        expect(headings).toEqual(["On this site"]);
        expect(find?.textContent).toContain("Welcome in section");
        expect(find?.textContent).not.toContain("Page settings");
        expect(has(/^Replace, focus and describe/)).toBe(false);
        expectReadOnly("shell, reader, Find open");
    });

    it("a reader who may not approve has no verdict", () => {
        render({ reviewCan: { comment: true, approve: false } });
        expect(has("Approve")).toBe(false);
        expect(has("Ask for changes")).toBe(false);
    });

    it("Preview at three sizes: nothing that writes (U46f)", () => {
        render();
        click(button("Preview"));
        expect($("[data-preview-frames]")).not.toBeNull();
        expect(has("Share a test link")).toBe(false);
        expectReadOnly("shell, reader, Preview at three sizes");
    });

    it("the rail's Brand and Feedback stay readable", () => {
        render();
        click(button("Brand"));
        expectReadOnly("shell, reader, Brand");
        click(button(/^Feedback\d*$/));
        expect($("[data-left-panel=feedback]")).not.toBeNull();
        expectReadOnly("shell, reader, Feedback");
    });
});

describe("the desk shell for an owner (U46)", () => {
    beforeEach(() => {
        area.on = true;
        atWidth(1920);
    });
    const owner: Partial<Props> = {
        readOnly: false,
        canUpdateSite: true,
        canPublish: true,
        askAi: true,
        initialPendingChanges: 2,
        initialPendingSiteChanges: [],
    };

    it("the bar is Website, page, Undo, Ask AI, the chip, Preview, More, Publish", () => {
        render(owner);
        const bar = $("[data-editor-bar]");
        const names = Array.from(
            bar?.querySelectorAll<HTMLElement>("a,button") ?? [],
        ).map((el) => (el.matches("[data-status-chip]") ? "chip" : nameOf(el)));
        expect(names).toEqual([
            "Back to Website",
            "Page: Home. Choose another page to edit",
            "Undo",
            "Ask AI",
            "chip",
            "Preview",
            expect.stringMatching(/^More: desk/),
            "Publish",
        ]);
        expect($("[data-status-chip]")?.textContent).toBe(
            "Live · 2 changes waiting",
        );
        // None of the old bar's controls sit on it any more.
        for (const gone of ["Share", "In review", "Test release", "Zoom"]) {
            expect(has(gone), gone).toBe(false);
        }
    });

    it("everything that left the bar is in More (00-universal §15)", () => {
        render(owner);
        openMenu(button(/^More: desk/));
        expect(menuItems()).toEqual(
            expect.arrayContaining([
                "Desk",
                "Tablet",
                "Phone",
                "50%",
                "75%",
                "100%",
                "Fit",
                "Redo",
                "Page settings",
                "Share a test link",
                "Test links1",
                // REVIEW is pending in this file's fixture.
                "Withdraw the review request",
                "Share a preview link",
                "History",
                "Feedback1",
                expect.stringMatching(/^Theme: switch to/),
            ]),
        );
    });

    it("More › Width changes the canvas bar's word", () => {
        render(owner);
        expect($("[data-canvas-bar]")?.textContent).toContain("Desk view");
        openMenu(button(/^More: desk/));
        click(menuItem("Tablet"));
        expect($("[data-canvas-bar]")?.textContent).toContain("Tablet view");
    });

    it("More › Share a preview link opens the rail's Feedback", () => {
        render(owner);
        openMenu(button(/^More: desk/));
        click(menuItem("Share a preview link"));
        expect($("[data-left-panel=feedback]")).not.toBeNull();
    });

    it("the rail is Pages · Add · Brand · History · Feedback, and the tree lists the page's sections", () => {
        render(owner);
        expect(
            Array.from(
                $("[data-editor-trail]")?.querySelectorAll("button") ?? [],
            ).map((b) => b.firstChild?.nextSibling?.textContent),
        ).toEqual(["Pages", "Add", "Brand", "History", "Feedback"]);
        const tree = $("[data-pages-tree]");
        expect(tree?.textContent).toContain("On every page");
        expect(tree?.textContent).toContain("Welcome in");
        expect(tree?.textContent).toContain("Our storyHidden");
        expect(has("Add section")).toBe(true);
        expect($("[draggable=true]")).not.toBeNull();
        click(button("Add section"));
        expect($("[data-left-panel=add]")).not.toBeNull();
    });

    it("Undo waits for something to undo; Redo puts it back", () => {
        render(owner);
        expect((button("Undo") as HTMLButtonElement).disabled).toBe(true);
        // Delete the selected section from its canvas toolbar (U47).
        click(button("Welcome in"));
        click(button("Delete"));
        expect((button("Undo") as HTMLButtonElement).disabled).toBe(false);
        click(button("Undo"));
        expect($("[data-pages-tree]")?.textContent).toContain("Welcome in");
        expect((button("Undo") as HTMLButtonElement).disabled).toBe(true);
    });

    it("a phone draws the one phone editor (U49), not the desk shell", () => {
        atWidth(390);
        render(owner);
        expect($("[data-editor-trail]")).toBeNull();
        expect($("[data-phone-bar]")).not.toBeNull();
        expect($("[data-edit-pill]")).toBeNull();
    });

    it("Rail › History: the waiting change with Undo, the versions, and Versions kept (U46b)", async () => {
        render(owner);
        click(button("History"));
        await act(async () => {
            await Promise.resolve();
        });
        const panel = $("[data-history-panel]");
        // No recorded editor: a neutral row, no made-up person (no avatar).
        expect(panel?.textContent).toContain("Changed Top of the page");
        expect(panel?.textContent).toContain("before names were kept");
        expect(panel?.textContent).not.toContain("Earlier changes");
        expect(has("Undo")).toBe(true);
        expect(panel?.textContent).toContain("Live now");
        expect(panel?.querySelector("a[href$='/versions']")?.textContent).toBe(
            "See all versions",
        );
    });

    it("Preview draws the page at three sizes; Back to editing keeps the selection (U46f)", () => {
        render(owner);
        click(button("Welcome in"));
        click(button("Preview"));
        expect(
            Array.from(document.querySelectorAll("[data-preview-frame]")).map(
                (f) => f.getAttribute("data-preview-frame"),
            ),
        ).toEqual(["desktop", "tablet", "phone"]);
        expect(has("Share a test link")).toBe(true);
        click(button("Back to editing"));
        expect($("[data-preview-frames]")).toBeNull();
        expect($("aside[aria-label=Inspector] h2")?.textContent).toBe(
            "Welcome in",
        );
    });

    it("off: today's chrome, unchanged", () => {
        area.on = false;
        render(owner);
        expect($("[data-editor-trail]")).toBeNull();
        expect(has("Test release")).toBe(true);
        expect(has("In review")).toBe(true);
        expect($("[data-status-chip]")).toBeNull();
    });
});

describe("the inspector with the Website area on (U47)", () => {
    beforeEach(() => {
        area.on = true;
        atWidth(1920);
    });
    const owner: Partial<Props> = {
        readOnly: false,
        canUpdateSite: true,
        canPublish: true,
        initialPendingChanges: 0,
        initialPendingSiteChanges: [],
    };
    const inspector = () => $("aside[aria-label=Inspector]");
    const tree = () => $("[data-pages-tree]")?.textContent ?? "";

    it("a reader: the selected section's tabs read, nothing writes, no toolbar", () => {
        render();
        click(button("Welcome in"));
        for (const tab of ["Content", "Style", "Visibility", /^Feedback/]) {
            click(button(tab));
            expectReadOnly(`shell, reader, ${String(tab)} tab`);
        }
        expect($("[data-section-toolbar]")).toBeNull();
    });

    it("nothing selected: the page, its settings card and its checks", () => {
        render(owner);
        // The first section opens selected; Close leaves the page at rest.
        click(button("Close, nothing selected"));
        expect(inspector()?.textContent).toContain("Page · Nothing selected");
        expect($("[data-page-at-rest]")?.textContent).toContain(
            "Who can see itPublic · anyone with the link",
        );
        expect($("[data-pre-publish-checks]")).not.toBeNull();
        expect(inspector()?.textContent).toContain(
            "Opens Page settings, the same one as Website › Pages.",
        );
    });

    it("a section: its name, kind and place, Content first, and every old control", () => {
        render(owner);
        click(button("Welcome in"));
        expect(inspector()?.querySelector("h2")?.textContent).toBe(
            "Welcome in",
        );
        expect(inspector()?.textContent).toContain(
            "Top of the page · section 1 of 2",
        );
        expect(button("Content").getAttribute("aria-selected")).toBe("true");
        // The canvas toolbar holds what the old inspector's foot did.
        for (const kept of ["Move", "Duplicate", "Hide on phone", "Delete"]) {
            expect(has(kept), kept).toBe(true);
        }
        click(button("Visibility"));
        expect(inspector()?.textContent).toContain("Hidden when published");
    });

    it("Style: spacing is one change from the look, and Reset takes it back", () => {
        render(owner);
        click(button("Welcome in"));
        click(button("Style"));
        expect($("[data-style-changes]")).toBeNull();
        click(button("Airy"));
        expect($("[data-style-changes]")?.textContent).toContain(
            "1 change from the site look",
        );
        click(button(/^Reset to /));
        expect($("[data-style-changes]")).toBeNull();
    });

    it("Duplicate puts a copy below, and Undo takes it away", () => {
        render(owner);
        click(button("Welcome in"));
        click(button("Duplicate"));
        expect(tree().match(/Welcome in/g)).toHaveLength(2);
        expect(inspector()?.textContent).toContain(
            "Top of the page · section 2 of 3",
        );
        click(button("Undo"));
        expect(tree().match(/Welcome in/g)).toHaveLength(1);
    });

    it("Hide on phone marks the tree row, with Undo", () => {
        render(owner);
        click(button("Welcome in"));
        click(button("Hide on phone"));
        expect(tree()).toContain("Hidden on phone");
        click(button("Undo"));
        expect(tree()).not.toContain("Hidden on phone");
    });

    /** The selected section's words on the canvas, marked by site-blocks. */
    const onPage = (field: string) =>
        $(`[data-block-index] [data-edit-field=${field}]`);
    const headingInput = () =>
        Array.from(
            inspector()?.querySelectorAll<HTMLInputElement>("input") ?? [],
        ).find((i) => i.value.startsWith("Welcome"));

    it("typing on the page is the inspector's field, and Esc puts it back (U47d)", () => {
        render(owner);
        // Not selected: the words are only drawn.
        click(button("Close, nothing selected"));
        expect(onPage("heading")).toBeNull();
        click(button("Welcome in"));
        const words = onPage("heading");
        if (!words) throw new Error("No heading to type in");
        expect(words.textContent).toBe("Welcome in");
        act(() => words.focus());
        act(() => {
            words.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
            words.textContent = "Welcome back";
            words.dispatchEvent(new InputEvent("input", { bubbles: true }));
        });
        // One draft field, two inputs.
        expect(headingInput()?.value).toBe("Welcome back");
        key("Escape");
        expect(headingInput()?.value).toBe("Welcome in");
        expect(words.textContent).toBe("Welcome in");
    });

    it("a reader cannot type on the page (U47d, DEC-200)", () => {
        render();
        click(button("Welcome in"));
        expect(onPage("heading")).toBeNull();
        expect($("[data-block-index] [contenteditable]")).toBeNull();
        expectReadOnly("shell, reader, the selected section's words");
    });

    it("the header: on every page, with the banner over the canvas", () => {
        render(owner);
        click(button(/^Header/));
        expect(inspector()?.textContent).toContain("On every page · 2 pages");
        expect($("[data-everywhere-banner]")?.textContent).toContain(
            "Changes here show on all 2 pages · Home and About",
        );
        click(button("Back to this page's sections"));
        expect($("[data-everywhere-banner]")).toBeNull();
    });
});

describe("the one phone editor (U49)", () => {
    beforeEach(() => {
        area.on = true;
        atWidth(390);
    });
    const owner: Partial<Props> = {
        readOnly: false,
        canUpdateSite: true,
        canPublish: true,
        askAi: true,
        initialPendingChanges: 2,
        initialPendingSiteChanges: [],
    };
    const FAQ: Section = {
        key: "s3",
        type: "faq",
        contractVersion: 1,
        content: {
            heading: "Questions",
            intro: "Ask us anything",
            items: [{ question: "Open Sundays?", answer: "Yes, till noon." }],
        },
    };
    const names = (sel: string) =>
        Array.from(
            document.querySelectorAll<HTMLElement>(`${sel} a,${sel} button`),
        ).map(nameOf);
    const sectionSheet = () => $("[data-section-sheet]");
    const tapSection = (index: number) => {
        const block = $(`[data-block-index='${index}'] > button[aria-pressed]`);
        if (!block) throw new Error(`No section ${index} on the canvas`);
        click(block);
    };
    /** The toast's Undo (the phone has no Undo icon). */
    const undoFromToast = () => {
        const call = vi.mocked(showUndo).mock.calls.at(-1);
        act(() => (call?.[1] as () => void)());
    };

    it("one top bar, one bar: Sections · Add · Brand · Publish with the chip's count", () => {
        render(owner);
        expect(names("[data-editor-bar]")).toEqual([
            "Back to Website",
            "Page: Home. Choose another page or change its settings",
            "Ask AI",
            "Preview",
        ]);
        expect(names("[data-phone-bar]")).toEqual([
            "Sections",
            "Add",
            "Brand",
            "Publish: 2 changes waiting",
        ]);
        expect($("[data-publish-count]")?.textContent).toBe("2");
        // Only one phone editor (00-universal §15): no pill, no second bar.
        expect($("[data-edit-pill]")).toBeNull();
        expect(
            document.querySelectorAll("nav[aria-label=Editor]"),
        ).toHaveLength(1);
        expect(has("Blocks")).toBe(false);
    });

    it("the first visit's hint goes for good with Got it", () => {
        window.localStorage.removeItem("saroh.editor.phone-hint-seen");
        render(owner);
        expect($("[data-first-hint]")?.textContent).toContain(
            "Tap any part of the page to change it. Shown once.",
        );
        click(button("Got it"));
        expect($("[data-first-hint]")).toBeNull();
        expect(
            window.localStorage.getItem("saroh.editor.phone-hint-seen"),
        ).toBe("1");
    });

    it("a tapped section opens its sheet: actions, the four tabs, Cancel and Save", () => {
        render(owner);
        tapSection(0);
        const sheet = sectionSheet();
        expect(sheet).not.toBeNull();
        expect(document.body.textContent).toContain(
            "Top of the page · section 1 of 2",
        );
        expect(
            Array.from(
                document.querySelectorAll(
                    "[aria-label='Section actions'] button",
                ),
            ).map(nameOf),
        ).toEqual(["Move", "Duplicate", "Hide here", "Delete", "Ask AI"]);
        for (const tab of ["Content", "Style", "Visibility", /^Feedback/]) {
            expect(has(tab), String(tab)).toBe(true);
        }
        expect($("[data-save-footer]")?.textContent).toContain(
            "Saved · goes live when you publish",
        );
        expect(has("Cancel")).toBe(true);
        click(button("Visibility"));
        expect(sheet?.textContent).toContain("Hidden when published");
        click(button("Save"));
        expect(sectionSheet()).toBeNull();
        // The old phone's toolbar on a tapped block is gone.
        expect(has(/^Move .* (up|down)$/)).toBe(false);
    });

    it("Duplicate and Hide here act at once with the toast's Undo", () => {
        render(owner);
        tapSection(0);
        click(button("Duplicate"));
        expect(document.body.textContent).toContain(
            "Top of the page · section 2 of 3",
        );
        undoFromToast();
        expect(document.body.textContent).toContain(
            "Top of the page · section 1 of 2",
        );
        click(button("Hide here"));
        expect(button("Show here").getAttribute("aria-pressed")).toBe("true");
        undoFromToast();
        expect(has("Hide here")).toBe(true);
    });

    it("Move opens Sections: pinned header and footer, Up and Down with Undo", () => {
        render(owner);
        tapSection(0);
        click(button("Move"));
        const list = () => $("[data-sections-sheet]");
        expect(list()?.textContent).toContain(
            "HeaderOn every page · stays at the top",
        );
        expect(list()?.textContent).toContain(
            "FooterOn every page · stays at the bottom",
        );
        expect(
            (button("Move Welcome in up") as HTMLButtonElement).disabled,
        ).toBe(true);
        click(button("Move Welcome in down"));
        expect(list()?.textContent.indexOf("Our story")).toBeLessThan(
            list()?.textContent.indexOf("Welcome in") ?? -1,
        );
        expect(vi.mocked(showUndo).mock.calls.at(-1)?.[0]).toBe(
            "Top of the page moved down",
        );
        undoFromToast();
        // Undo selects the section again, so its sheet is what shows.
        expect(document.body.textContent).toContain(
            "Top of the page · section 1 of 2",
        );
        click(button("Sections"));
        expect(list()?.textContent.indexOf("Welcome in")).toBeLessThan(
            list()?.textContent.indexOf("Our story") ?? -1,
        );
        expect(has("Add a section")).toBe(true);
        click(button("Done"));
        expect(list()).toBeNull();
    });

    it("a long text field opens full screen with its word count; Cancel on the section puts it back", () => {
        render({ ...owner, initialSections: [...SECTIONS, FAQ] });
        tapSection(2);
        const intro = Array.from(
            document.querySelectorAll<HTMLTextAreaElement>(
                "[data-section-sheet] textarea",
            ),
        ).find((t) => t.value === "Ask us anything");
        if (!intro) throw new Error("No Intro field");
        act(() => intro.focus());
        const big = document.getElementById(
            "phone-text-sheet",
        ) as HTMLTextAreaElement | null;
        expect(big?.value).toBe("Ask us anything");
        expect(document.body.textContent).toContain("Questions · Intro");
        expect(document.body.textContent).toContain("3 words");
        if (!big) return;
        act(() => typeInto(big, "Ask us anything at all"));
        expect(document.body.textContent).toContain("5 words");
        const save = Array.from(
            document.querySelectorAll<HTMLElement>(
                "[data-editor-sheet=Intro] button",
            ),
        ).find((b) => b.textContent === "Save");
        if (!save) throw new Error("No Save on the text sheet");
        click(save);
        expect(document.getElementById("phone-text-sheet")).toBeNull();
        expect(intro.value).toBe("Ask us anything at all");
        // Cancel: the section as it was when its sheet opened.
        click(button("Cancel"));
        tapSection(2);
        expect(
            Array.from(
                document.querySelectorAll<HTMLTextAreaElement>(
                    "[data-section-sheet] textarea",
                ),
            ).some((t) => t.value === "Ask us anything"),
        ).toBe(true);
    });

    it("the page picker holds the pages and what the old bar's More held", () => {
        render(owner);
        click(button(/^Page: Home/));
        for (const kept of [
            /^Settings for Home/,
            // REVIEW is pending: Withdraw stands where Ask would.
            /^Withdraw the review request/,
            /^Share a preview link/,
            /^Make a test release/,
            /^Preview/,
            /^Feedback/,
            /^(Light|Dark)/,
        ]) {
            expect(has(kept), String(kept)).toBe(true);
        }
    });

    it("Add and Brand open their sheets; Publish opens the Publish sheet", () => {
        render(owner);
        click(button("Add"));
        expect($("[data-editor-sheet=Add]")).not.toBeNull();
        click(button("Close Add"));
        click(button("Brand"));
        expect($("[data-editor-sheet=Brand]")).not.toBeNull();
        click(button("Close Brand"));
        click(button("Publish: 2 changes waiting"));
        expect(
            button("Publish: 2 changes waiting").getAttribute("aria-current"),
        ).toBe("true");
    });

    it("a reader: the verdict takes the bar's place, nothing writes", () => {
        render();
        expect($("[data-phone-bar]")).toBeNull();
        expect($("[data-read-only-line]")?.textContent).toBe(
            "Read only. You can leave notes.",
        );
        expect(has("Approve")).toBe(true);
        expect(has("Ask for changes")).toBe(true);
        expectReadOnly("phone editor, reader");
        tapSection(0);
        expectReadOnly("phone editor, reader, a section's sheet");
        expect($("[aria-label='Section actions']")).toBeNull();
        click(button("Close the section"));
        click(button(/^Page: Home/));
        expectReadOnly("phone editor, reader, page picker");
        click(button("Sections on this page"));
        expectReadOnly("phone editor, reader, Sections");
        expect(has(/^Drag to move/)).toBe(false);
        click(button("Done"));
        click(button("Approve"));
        expectReadOnly("phone editor, reader, review sheet");
    });

    it("a reader who may not approve has no verdict bar", () => {
        render({ reviewCan: { comment: true, approve: false } });
        expect($("[data-reader-bar]")).toBeNull();
        expect(has("Approve")).toBe(false);
    });

    it("off: today's phone, pill and all", () => {
        area.on = false;
        render(owner);
        expect($("[data-edit-pill]")).not.toBeNull();
        expect($("[data-phone-bar]")).toBeNull();
    });
});

/**
 * The plan's "Capabilities kept" table (U51, 00-universal §15), row by row,
 * for what the earlier units' cases don't already reach: every control
 * the editor had stays reachable with the Website area on, desk and phone.
 * The other rows are asserted above, each where its unit built it: the
 * bar and More (U46), the rail and the tree, History, Preview (U46b/f),
 * the inspector's tabs and toolbar (U47), the phone bar, its sheets and
 * the page picker sheet (U49).
 */
describe("the capability table, row by row (U51)", () => {
    const owner: Partial<Props> = {
        readOnly: false,
        canUpdateSite: true,
        canPublish: true,
        askAi: true,
        initialPendingChanges: 2,
        initialPendingSiteChanges: [],
        siteIcon: {
            siteId: "site",
            siteName: "Flour & Ferment",
            saved: { own: null, businessLogoUrl: null },
        },
    };
    beforeEach(() => {
        area.on = true;
    });
    const sheetTitled = (title: string) =>
        Array.from(document.querySelectorAll("[role=dialog] h2")).some(
            (h) => h.textContent === title,
        );

    describe("desk (1920)", () => {
        beforeEach(() => atWidth(1920));

        it("the page picker: switch page, Page settings, Add a page", () => {
            render(owner);
            click(button("Page: Home. Choose another page to edit"));
            expect(has(/^Settings for Home/)).toBe(true);
            expect(has("Add a page")).toBe(true);
            expect(has(/About/)).toBe(true);
        });

        it("the Pages tree's Add a page opens Add's own sheet (U46e)", () => {
            render(owner);
            const add = Array.from(
                document.querySelectorAll<HTMLElement>(
                    "[data-pages-tree] button",
                ),
            ).find((b) => nameOf(b) === "Add a page");
            if (!add) throw new Error("No Add a page in the tree");
            click(add);
            expect(sheetTitled("Add a page")).toBe(true);
        });

        it("Rail › Add › Add a page opens the same sheet", () => {
            render(owner);
            click(button("Add"));
            click(button("Blank page"));
            expect(sheetTitled("Add a page")).toBe(true);
        });

        it("Brand: Logo and tab icon in the panel, the aside where the inspector is", () => {
            render(owner);
            click(button("Brand"));
            expect($("[data-brand-panel]")?.textContent).toContain(
                "Logo and tab icon",
            );
            // `BrandAside` once, in the inspector's place (U24b).
            expect(
                document.querySelectorAll("[data-brand-aside]"),
            ).toHaveLength(1);
            expect(
                $("[data-inspector-frame] [data-brand-aside]"),
            ).not.toBeNull();
        });

        it("the dividers still resize both panels", () => {
            render(owner);
            for (const label of [
                "Resize the block list",
                "Resize the inspector",
            ]) {
                expect(
                    document.querySelector(`[aria-label="${label}"]`),
                    label,
                ).not.toBeNull();
            }
        });

        it("the chip's number is Overview's: the API's change units (KTD-E3)", () => {
            render({ ...owner, initialPendingUnits: 3 });
            expect($("[data-status-chip]")?.textContent).toBe(
                "Live · 3 changes waiting",
            );
        });
    });

    describe("phone (390)", () => {
        beforeEach(() => atWidth(390));

        it("Add sheet › A page opens Add a page", () => {
            render(owner);
            click(button("Add"));
            click(button("Blank page"));
            expect(sheetTitled("Add a page")).toBe(true);
        });

        it("Brand sheet: Logo and tab icon is a group", () => {
            render(owner);
            click(button("Brand"));
            expect(has("Logo")).toBe(true);
        });

        it("the Publish badge is the chip's number (KTD-E3)", () => {
            render({ ...owner, initialPendingUnits: 3 });
            expect($("[data-publish-count]")?.textContent).toBe("3");
        });
    });
});
