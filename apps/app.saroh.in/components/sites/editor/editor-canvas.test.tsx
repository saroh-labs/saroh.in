// @vitest-environment jsdom
/**
 * The canvas in Preview (round 2 G5): the same canvas and renderer with the
 * editing tools taken away. What the whole editor does around it — the bar,
 * the rail and inspector put away, a page opened from the menu — is pinned in
 * `site-editor.test.tsx`; this pins the canvas's own part.
 *
 * `react-dom/client` + `act` directly, as `site-editor.test.tsx` does.
 */
import type * as SiteBlocks from "@saroh/site-blocks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorCanvas } from "@/components/sites/editor/editor-canvas";
import type { Section, SitePage } from "@/lib/sites/service";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/sites",
}));

const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showInfo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

/*
 * The live site's renderer, watched rather than replaced: every block the
 * canvas draws has to come through this one component, editing or not.
 */
const drawn = vi.hoisted(() => ({ calls: 0 }));
let scrolled: ReturnType<typeof vi.fn<Element["scrollIntoView"]>>;
vi.mock("@saroh/site-blocks", async (importOriginal) => {
    const real = await importOriginal<typeof SiteBlocks>();
    const PageSections: typeof real.PageSections = (props) => {
        drawn.calls += 1;
        return real.PageSections(props);
    };
    return { ...real, PageSections };
});

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

const HERO: Section = {
    key: "s1",
    type: "hero",
    contractVersion: 1,
    content: {
        heading: "Welcome in",
        cta: { label: "Menu", href: "#menu", style: "primary" },
    },
};

const ENQUIRY: Section = {
    key: "s2",
    type: "enquiry",
    contractVersion: 1,
    content: {
        formId: "form-1",
        title: "Write to us",
        submitLabel: "Send",
        fields: [
            { name: "email", label: "Email", type: "email", required: true },
        ],
    },
};

let root: Root;
let host: HTMLDivElement;

type Props = Parameters<typeof EditorCanvas>[0];

function render(overrides: Partial<Props> = {}) {
    const props: Props = {
        canvasRef: createRef<HTMLDivElement>(),
        onCanvasScroll: vi.fn(),
        conflict: false,
        neverPublished: false,
        device: "desktop",
        switching: false,
        zoomScale: 1,
        previewing: true,
        setPreviewing: vi.fn(),
        siteId: "site-1",
        pageId: "p-home",
        address: "flour.saroh.app",
        sections: [HERO, ENQUIRY],
        pages: PAGES,
        style: { colours: {}, scalars: {} },
        styleOptions: { rows: [], scalars: [] },
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
        setRail: vi.fn(),
        setInspector: vi.fn(),
        canvasChrome: { name: "Flour & Ferment", navigation: [], footer: null },
        selectedChrome: null,
        selectChrome: vi.fn(),
        notesByKey: new Map([["s1", 2]]),
        dirty: false,
        onlyHeldBack: false,
        heldBack: [],
        ...overrides,
    };
    act(() => {
        root.render(<EditorCanvas {...props} />);
    });
    return props;
}

const $ = (sel: string) => host.querySelector<HTMLElement>(sel);

function submitForm() {
    const form = $("form");
    if (!form) throw new Error("No form on the canvas");
    act(() => {
        form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", vi.fn());
    // jsdom has no layout, and no ResizeObserver for the device frame's height.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {
                // Nothing to measure: jsdom has no layout.
            }
            unobserve() {
                // Nothing was observed.
            }
            disconnect() {
                // Nothing was observed.
            }
        },
    );
    scrolled = vi.fn<Element["scrollIntoView"]>();
    Element.prototype.scrollIntoView = scrolled;
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    drawn.calls = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("the canvas in Preview", () => {
    it("draws the site with no outlines, labels, pins or window bar", () => {
        render();
        expect($("[data-previewing]")).not.toBeNull();
        expect($("[data-block-index]")).toBeNull();
        expect($("button[aria-pressed]")).toBeNull();
        expect(host.textContent).not.toContain("read the feedback");
        expect(host.textContent).not.toContain("flour.saroh.app/");
        expect(host.textContent).toContain("Welcome in");
        expect(host.textContent).toContain("Write to us");
    });

    it("draws the editing tools when it is not previewing", () => {
        render({ previewing: false });
        expect($("[data-previewing]")).toBeNull();
        expect(host.querySelectorAll("[data-block-index]")).toHaveLength(2);
        expect(host.textContent).toContain("flour.saroh.app/");
    });

    it("says what Preview is, and Back to editing leaves it", () => {
        const { setPreviewing } = render();
        expect($("[role=status]")?.textContent).toBe(
            "This is your site with the draft. Try it; nothing is live until you publish.",
        );
        const back = Array.from(host.querySelectorAll("button")).find((b) =>
            b.textContent.startsWith("Back to editing"),
        );
        if (!back) throw new Error("No way back");
        expect(back.textContent).toContain("Esc");
        act(() => back.click());
        expect(setPreviewing).toHaveBeenCalledWith(false);
    });

    it("draws the page in a frame of its own at phone width, so the blocks' breakpoints read the phone's", () => {
        render({ device: "phone" });
        const frame = host.querySelector<HTMLIFrameElement>(
            "iframe[data-device-frame]",
        );
        expect(frame?.title).toBe("The page at phone width");
        // The page is in the frame's document, not the canvas's.
        expect(frame?.contentDocument?.body.textContent).toContain(
            "Welcome in",
        );
        expect(host.textContent).not.toContain("Welcome in");
    });

    it("draws the page straight on the canvas at desktop width", () => {
        render({ device: "desktop" });
        expect(host.querySelector("iframe[data-device-frame]")).toBeNull();
        expect(host.textContent).toContain("Welcome in");
    });

    it("keeps the device width and the zoom", () => {
        render({ device: "phone", zoomScale: 0.75 });
        const frame = Array.from(
            host.querySelectorAll<HTMLElement>("div[style]"),
        ).find((d) => d.style.transformOrigin);
        expect(frame?.style.maxWidth).toBe("23.4375rem");
        expect(frame?.style.transform).toBe("scale(0.75)");
    });

    it("sends no form: it says 'Preview — not sent' instead, then goes back to its note", async () => {
        render();
        submitForm();
        expect(fetch).not.toHaveBeenCalled();
        expect($("[role=status]")?.textContent).toBe(
            "Preview — not sent. Forms send from your live site.",
        );
        expect(toast.showInfo).not.toHaveBeenCalled();
        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        expect($("[role=status]")?.textContent).toContain(
            "This is your site with the draft.",
        );
    });

    it("sends no form while editing either, and says so in a toast", () => {
        render({ previewing: false });
        submitForm();
        expect(fetch).not.toHaveBeenCalled();
        expect(toast.showInfo).toHaveBeenCalledWith(
            "Preview — not sent",
            "Forms send from your live site.",
        );
    });

    it("scrolls to an anchor on the page instead of leaving it", () => {
        const target = document.createElement("div");
        target.id = "menu";
        render({
            sections: [HERO],
            canvasChrome: {
                name: "Flour & Ferment",
                navigation: [],
                footer: null,
            },
        });
        // An anchor inside the page: the canvas finds it and scrolls there.
        $("[data-previewing] section")?.appendChild(target);
        const opened = vi.spyOn(window, "open").mockReturnValue(null);
        const link = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "Menu",
        );
        if (!link) throw new Error("No link");
        act(() => link.click());
        expect(scrolled.mock.contexts).toEqual([target]);
        expect(opened).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });

    it("stays put, back at the top, when the link is to the page already open", () => {
        const canvasRef = createRef<HTMLDivElement>();
        render({
            canvasRef,
            sections: [
                {
                    ...HERO,
                    content: {
                        heading: "Hi",
                        cta: { label: "Home", href: "/", style: "primary" },
                    },
                },
            ],
        });
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("No canvas");
        canvas.scrollTop = 400;
        const link = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "Home",
        );
        if (!link) throw new Error("No link");
        act(() => link.click());
        expect(push).not.toHaveBeenCalled();
        expect(canvas.scrollTop).toBe(0);
    });

    it("names what is holding a page switch back", () => {
        render({
            sections: [
                {
                    ...HERO,
                    content: {
                        heading: "Hi",
                        cta: {
                            label: "About",
                            href: "/about",
                            style: "primary",
                        },
                    },
                },
            ],
            dirty: true,
            onlyHeldBack: true,
            heldBack: [
                {
                    index: 1,
                    type: "enquiry",
                    key: "s2",
                    message: "Add an email field",
                },
            ],
        });
        const link = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "About",
        );
        if (!link) throw new Error("No link");
        act(() => link.click());
        expect(push).not.toHaveBeenCalled();
        expect(toast.showError).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Finish or remove .+ before opening another page\.$/,
            ),
        );
    });
});

describe("the merchant's type (review G-5)", () => {
    it("sets the page in the site's body face, editing and in Preview", () => {
        for (const previewing of [false, true]) {
            render({ previewing });
            const scope = $(".site-preview-scope");
            expect(scope?.classList.contains("font-site-body")).toBe(true);
        }
    });
});

describe("one renderer", () => {
    it("draws Preview and the editing canvas through the live site's PageSections", () => {
        render({ previewing: false });
        const editing = drawn.calls;
        expect(editing).toBeGreaterThan(0);
        render({ previewing: true });
        expect(drawn.calls).toBeGreaterThan(editing);
    });

    /*
     * No second import path: the canvas reaches the blocks only through
     * `DraftPreview`, and that only through the package's own entry — never
     * a block file, and never the merchant site app's copy.
     */
    it("imports the blocks from @saroh/site-blocks alone", () => {
        const here = join(__dirname);
        const canvas = readFileSync(join(here, "editor-canvas.tsx"), "utf8");
        const preview = readFileSync(
            join(here, "..", "section-preview.tsx"),
            "utf8",
        );
        const imports = (src: string) =>
            Array.from(src.matchAll(/from "([^"]+)"/g), (m) => m[1]);

        expect(imports(canvas)).not.toContainEqual(
            expect.stringMatching(/site-blocks|saroh\.app/),
        );
        expect(imports(canvas)).toContain("@/components/sites/section-preview");
        const blockImports = imports(preview).filter((p) =>
            /site-blocks|blocks\/|saroh\.app/.test(p),
        );
        expect(blockImports).toEqual([
            "@saroh/site-blocks",
            "@saroh/site-blocks",
        ]);
    });
});
