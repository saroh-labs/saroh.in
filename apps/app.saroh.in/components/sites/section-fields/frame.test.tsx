// @vitest-environment jsdom
/**
 * A block's place on its page in the inspector (industry templates, polish
 * pass): its menu label, its link name and its background band; and the
 * `none` hero's "Show the heading". `react-dom/client` + `act` directly, as
 * `journal.test.tsx` does.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canvasChromeFor } from "@/components/sites/editor/editor-canvas";
import { withFooterLayout } from "@/components/sites/editor/use-site-chrome";
import type { Section } from "@/lib/sites/service";

import { SectionFrameFields } from "./frame";
import { HeroFields } from "./hero";

// The media library (the hero's picker), the editor's server actions and
// its router: what these modules import that reaches the API.
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("@/lib/sites/actions", () => ({
    updateSiteFooter: vi.fn(),
    updateSiteSettings: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/sites",
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const textSection = (extra: Record<string, unknown> = {}): Section => ({
    key: "sec_text",
    type: "richText",
    contractVersion: 1,
    content: { format: "html", value: "<p>Hi</p>", ...extra },
});

function renderFrame(section: Section) {
    const onChange = vi.fn<(next: Section) => void>();
    act(() => {
        root.render(
            <SectionFrameFields section={section} onChange={onChange} />,
        );
    });
    return onChange;
}

function input(label: string): HTMLInputElement {
    const lab = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    // React's generated ids hold colons, so look the id up, not a selector.
    const found = lab ? document.getElementById(lab.htmlFor) : null;
    if (!(found instanceof HTMLInputElement)) {
        throw new Error(`No "${label}" field`);
    }
    return found;
}

function type(el: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    );
    act(() => {
        descriptor?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const lastContent = (onChange: ReturnType<typeof renderFrame>) =>
    onChange.mock.calls.at(-1)?.[0].content as Record<string, unknown>;

describe("a block's frame fields", () => {
    it("suggests a link name from the first menu label typed", () => {
        const onChange = renderFrame(textSection());
        type(input("Menu label"), "Today's bread");
        expect(lastContent(onChange)).toMatchObject({
            navLabel: "Today's bread",
            anchor: "todays-bread",
        });
    });

    it("leaves a link name the merchant already chose", () => {
        const onChange = renderFrame(textSection({ anchor: "bread" }));
        type(input("Menu label"), "Bread");
        expect(lastContent(onChange)).toMatchObject({
            navLabel: "Bread",
            anchor: "bread",
        });
    });

    it("says what is wrong with a link name, and how to use a good one", () => {
        renderFrame(textSection({ anchor: "enquiry" }));
        expect(host.textContent).toMatch(/used by the site itself/);
        act(() => root.unmount());
        root = createRoot(host);
        renderFrame(textSection({ anchor: "visit" }));
        expect(host.textContent).toContain("#visit");
    });

    it("removes a cleared field rather than storing it empty", () => {
        const onChange = renderFrame(
            textSection({ anchor: "visit", navLabel: "Visit" }),
        );
        type(input("Menu label"), "");
        expect(lastContent(onChange)).not.toHaveProperty("navLabel");
        expect(lastContent(onChange)).toHaveProperty("anchor", "visit");
    });
});

describe("the none hero's heading switch", () => {
    function renderHero(content: Record<string, unknown>) {
        const onChange = vi.fn<(next: Section) => void>();
        const section = {
            key: "sec_hero",
            type: "hero",
            contractVersion: 2,
            content: { heading: "Kiln", ...content },
        } as Extract<Section, { type: "hero" }>;
        act(() => {
            root.render(
                <HeroFields
                    section={section}
                    pages={[]}
                    services={{ status: "loading" }}
                    onChange={onChange}
                />,
            );
        });
        return onChange;
    }

    it("shows only on the none look, and writes false when turned off", () => {
        renderHero({ variant: "centered" });
        expect(host.textContent).not.toContain("Show the heading");
        act(() => root.unmount());
        root = createRoot(host);
        const onChange = renderHero({ variant: "none" });
        const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
        expect(toggle?.getAttribute("aria-checked")).toBe("true");
        act(() => toggle?.click());
        expect(
            (
                onChange.mock.calls.at(-1)?.[0].content as {
                    titleVisible?: boolean;
                }
            ).titleVisible,
        ).toBe(false);
    });
});

describe("the canvas's chrome", () => {
    it("leads the menu with the home page's labelled sections", () => {
        const chrome = canvasChromeFor({
            siteName: "Rye & Co.",
            navigation: { items: [{ pageId: "p_about" }] },
            pages: [
                {
                    id: "p_about",
                    path: "/about",
                    title: "About",
                    isHome: false,
                    hidden: false,
                },
            ],
            footer: null,
            homeSections: [
                textSection({ anchor: "visit", navLabel: "Visit" }),
                {
                    ...textSection({ anchor: "gone", navLabel: "Gone" }),
                    hidden: true,
                },
            ],
        });
        expect(chrome.navigation).toEqual([
            { label: "Visit", href: "/#visit" },
            { label: "About", href: "/about" },
        ]);
    });

    it("keeps a left footer's row with no line", () => {
        const footer = {
            format: "html" as const,
            value: "",
            layout: "left" as const,
        };
        expect(
            canvasChromeFor({
                siteName: "Rye",
                navigation: null,
                pages: [],
                footer,
            }).footer,
        ).toEqual(footer);
    });
});

describe("withFooterLayout", () => {
    const stored = {
        format: "markdown" as const,
        value: "Old",
        layout: "left" as const,
    };

    it("draws the typed line in the stored row, and the row with none", () => {
        expect(
            withFooterLayout({ format: "markdown", value: "New" }, stored),
        ).toEqual({ format: "markdown", value: "New", layout: "left" });
        expect(withFooterLayout(null, stored)).toEqual({
            format: "markdown",
            value: "",
            layout: "left",
        });
    });

    it("is the line itself for a centred footer", () => {
        const line = { format: "html" as const, value: "<p>x</p>" };
        expect(withFooterLayout(line, null)).toBe(line);
    });
});
