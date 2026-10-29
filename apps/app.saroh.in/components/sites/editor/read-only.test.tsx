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
import { SiteEditor } from "./site-editor";
import { useEditorDraft } from "./use-editor-draft";

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
    /^Hero block, \d+ of \d+(, selected)?$/,
    /^(Welcome in|Our story)$/,
    /^Hero(Welcome in|Our story)/,
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
    /^(See the notes|Show all|Try again)$/,
    // Test releases: the list, and each one's own review page (a link).
    /^Test releases( · )?\d*$/,
    /^Show (all \d+|fewer)$/,
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
    return true;
}

/** Every enabled control on screen that is not on the list, by name. */
function writeControls(): string[] {
    const docs: Document[] = [document];
    for (const frame of Array.from(document.querySelectorAll("iframe"))) {
        if (frame.contentDocument) docs.push(frame.contentDocument);
    }
    return docs
        .flatMap((d) => Array.from(d.querySelectorAll(CONTROLS)))
        .filter(isEnabled)
        .filter((el) => !isPageOption(el))
        .map(nameOf)
        .filter((name) => !ALLOWED.some((ok) => ok.test(name)));
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
    // Long enough for any autosave (1.5s) to have fired, had it been armed.
    await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
    });
    for (const spy of [
        ...Object.values(writes),
        ...Object.values(releaseWrites),
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
        click(button(/^HeroWelcome in/));
        expectReadOnly("phone, a block's sheet");
        click(button("Close the block panel"));
        click(button("Brand"));
        expectReadOnly("phone, Brand sheet");
        click(button("Close Brand"));
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
        expect(document.body.textContent).toContain("Add a note on Hero");
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
        expect(inspector()).toContain("The draft couldn't be loaded.");
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
        expect(inspector()).not.toContain("couldn't be loaded");
        expect(
            document.querySelector<HTMLTextAreaElement>("#block-feedback-reply")
                ?.value,
        ).toBe("Unsent words");
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
