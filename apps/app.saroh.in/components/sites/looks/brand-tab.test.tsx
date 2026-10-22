// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { heroDrawsInText } from "@/components/sites/editor/editor-rail";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { styleChoiceRules } from "@/lib/sites/style-access";

import { unreadableWords } from "./colour-picker";
import { RESET_BODY, RESET_TITLE, StylePanel } from "./style-panel";

/**
 * The Brand tab's pickers (DEC-184): the typeface search tries a face on
 * the page as the highlight moves and puts it back on Escape; a refused
 * paid face keeps the search open; Reset asks first; a colour the page
 * can't be read in says why; the Hero row says when it moves nothing.
 */

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/saroh-billing/plans-shown", () => ({ plansShown: () => true }));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));

const options: SiteStyleOptions = {
    rows: [
        {
            key: "pageGround",
            label: "Page ground",
            swatches: [
                { key: "paper", label: "Paper", hsl: "0 0% 100%" },
                { key: "slate", label: "Slate", hsl: "215 25% 12%" },
            ],
        },
        {
            key: "text",
            label: "Text",
            swatches: [
                { key: "ink", label: "Ink", hsl: "24 10% 10%" },
                { key: "chalk", label: "Chalk", hsl: "0 0% 98%" },
            ],
        },
        {
            key: "heroBackground",
            label: "Hero background",
            swatches: [{ key: "paper", label: "Paper", hsl: "0 0% 100%" }],
        },
    ],
    scalars: [],
    fontPairs: [
        { key: "system", name: "Your visitor's system font" },
        { key: "newsreader", name: "Newsreader" },
        { key: "archivo", name: "Archivo" },
    ],
};

const style: SiteStyle = {
    colours: { pageGround: "paper", text: "ink", heroBackground: "paper" },
    scalars: {},
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    // cmdk keeps the highlighted row in view; jsdom has no scrolling.
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function render({ heroInText = false } = {}) {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const onTry = vi.fn();
    act(() =>
        root.render(
            <StylePanel
                style={style}
                options={options}
                onChange={onChange}
                onReset={onReset}
                onTry={onTry}
                saving={false}
                heroInText={heroInText}
                rules={styleChoiceRules(
                    {
                        free: {
                            looks: [],
                            fontPairs: ["system", "newsreader"],
                            colourways: [],
                        },
                        paidIncluded: false,
                    },
                    style,
                    options,
                )}
            />,
        ),
    );
    return { onChange, onReset, onTry };
}

const open = () =>
    document.querySelector<HTMLElement>(
        '[data-brand-picker][data-state="open"]',
    );
function openTypefaces() {
    const change = host.querySelector<HTMLElement>("[data-typeface-change]");
    act(() => change?.click());
    const picker = open();
    if (!picker) throw new Error("No typeface picker");
    return picker;
}
const key = (el: Element, k: string) =>
    act(() => {
        el.dispatchEvent(
            new KeyboardEvent("keydown", { key: k, bubbles: true }),
        );
    });
function type(input: HTMLInputElement, text: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const rows = (picker: HTMLElement) =>
    Array.from(picker.querySelectorAll<HTMLElement>("[data-typeface]")).map(
        (el) => el.dataset.typeface,
    );

describe("the typeface search", () => {
    it("filters by name and says when nothing matches", () => {
        render();
        const picker = openTypefaces();
        const input = picker.querySelector("input");
        if (!input) throw new Error("No search");
        type(input, "news");
        expect(rows(picker)).toEqual(["newsreader"]);
        type(input, "zzz");
        expect(rows(picker)).toEqual([]);
        expect(picker.textContent).toContain("No typefaces match");
    });

    it("tries the highlighted face on the page unsaved, and Escape puts it back", () => {
        const { onChange, onTry } = render();
        const picker = openTypefaces();
        const input = picker.querySelector("input");
        if (!input) throw new Error("No search");
        key(input, "ArrowDown");
        expect(onTry).toHaveBeenLastCalledWith(
            expect.objectContaining({ fontPair: "newsreader" }),
        );
        expect(onChange).not.toHaveBeenCalled();
        key(input, "Escape");
        expect(open()).toBeNull();
        expect(onTry).toHaveBeenLastCalledWith(null);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps a free face on Enter, saving it", () => {
        const { onChange } = render();
        const picker = openTypefaces();
        const input = picker.querySelector("input");
        if (!input) throw new Error("No search");
        key(input, "ArrowDown");
        key(input, "Enter");
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ fontPair: "newsreader" }),
        );
        expect(open()).toBeNull();
    });

    it("stays open on a refused paid face, the line in its foot", () => {
        const { onChange } = render();
        const picker = openTypefaces();
        const input = picker.querySelector("input");
        if (!input) throw new Error("No search");
        key(input, "ArrowDown");
        key(input, "ArrowDown");
        key(input, "Enter");
        expect(onChange).not.toHaveBeenCalled();
        expect(open()).not.toBeNull();
        expect(
            open()?.querySelector("[data-paid-refusal]")?.textContent,
        ).toContain("Archivo comes with a paid plan");
    });
});

describe("Reset style…", () => {
    const resetButton = () => {
        const b = Array.from(host.querySelectorAll("button")).find(
            (el) => el.textContent === "Reset style…",
        );
        if (!b) throw new Error("No Reset style…");
        return b;
    };
    const confirmButton = (name: string) => {
        const b = Array.from(
            document.querySelectorAll<HTMLElement>(
                '[role="alertdialog"] button',
            ),
        ).find((el) => el.textContent === name);
        if (!b) throw new Error(`No ${name}`);
        return b;
    };

    it("asks first, keeping the style the safe way out", () => {
        const { onReset } = render();
        act(() => resetButton().click());
        const ask = document.querySelector('[role="alertdialog"]');
        expect(ask?.textContent).toContain(RESET_TITLE);
        expect(ask?.textContent).toContain(RESET_BODY);
        expect(document.activeElement?.textContent).toBe("Keep my style");
        act(() => confirmButton("Keep my style").click());
        expect(onReset).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    });

    it("resets on Reset style, which offers its Undo (useUndo)", () => {
        const { onReset } = render();
        act(() => resetButton().click());
        act(() => confirmButton("Reset style").click());
        expect(onReset).toHaveBeenCalledTimes(1);
    });
});

describe("the colour rows", () => {
    it("names each colour on its row, in the Brand tab's words", () => {
        render();
        const row = (label: string) =>
            host.querySelector(`[data-colour-row="${label}"]`)?.textContent;
        expect(row("Page background")).toContain("Paper");
        expect(row("Text")).toContain("Ink");
        expect(row("Hero")).toContain("Paper");
    });

    it("strikes a text colour the page can't be read in, and says why", () => {
        render();
        const text = host.querySelector<HTMLElement>(
            '[data-colour-row="Text"]',
        );
        act(() => text?.click());
        const chalk = open()?.querySelector('[aria-label="Chalk"]');
        expect(chalk?.getAttribute("aria-disabled")).toBe("true");
        expect(open()?.textContent).toContain(
            "Chalk: too light to read on Paper. Choose a darker page background to use it.",
        );
        expect(
            unreadableWords(
                { key: "ink", label: "Ink", hsl: "24 10% 10%" },
                { label: "Slate" },
            ),
        ).toBe(
            "Ink: too dark to read on Slate. Choose a lighter page background to use it.",
        );
    });

    it("says when the Hero row changes nothing on this page", () => {
        render({ heroInText: true });
        expect(host.querySelector("[data-hero-hint]")?.textContent).toBe(
            "This hero uses your text colour. Change it in the hero block.",
        );
        render();
        expect(host.querySelector("[data-hero-hint]")).toBeNull();
    });
});

describe("heroDrawsInText", () => {
    const hero = (variant: string, hidden = false) =>
        ({
            type: "hero",
            contractVersion: 1,
            content: { heading: "Hi", variant },
            ...(hidden ? { hidden } : {}),
        }) as unknown as Section;

    it("is true when every shown hero is full-bleed, on Classic", () => {
        expect(heroDrawsInText([hero("fullBleed")], undefined)).toBe(true);
        expect(
            heroDrawsInText(
                [hero("fullBleed"), hero("plain", true)],
                undefined,
            ),
        ).toBe(true);
    });

    it("is false with a plain hero, no hero, or a look", () => {
        expect(
            heroDrawsInText([hero("fullBleed"), hero("plain")], undefined),
        ).toBe(false);
        expect(heroDrawsInText([], undefined)).toBe(false);
        expect(heroDrawsInText([hero("fullBleed")], "quiet")).toBe(false);
    });
});
