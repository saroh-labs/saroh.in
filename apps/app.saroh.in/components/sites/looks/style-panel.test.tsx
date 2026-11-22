// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    SiteStyle,
    SiteStyleOptions,
    StyleColourway,
} from "@/lib/sites/style";
import {
    activeColourway,
    inColourway,
    resolveStyleVariables,
} from "@/lib/sites/style";

import { StylePanel } from "./style-panel";

/**
 * Website › Style offers the site's template's colourways as named choices
 * (DEC-090). A palette reaches a site only that way: choosing a swatch
 * afterwards leaves the colourway for the merchant's own colours.
 */

const PALETTE = {
    bg: "#F4F1E8",
    surface: "#EAE6DB",
    fg: "#1A1815",
    body: "#3B362E",
    muted: "#6E685E",
    border: "#DFDACD",
    accent: "#1F3D2B",
    accentFg: "#F9F7F1",
    heroBg: "#F4F1E8",
    heroFg: "#1A1815",
    ctaBg: "#1F3D2B",
    ctaFg: "#F9F7F1",
    footerBg: "#F4F1E8",
    footerFg: "#1A1815",
};

const colours = { pageGround: "paper", accent: "clay" };
const scalars = { gridGap: 1, pageMargin: 38 };

const GREEN: StyleColourway = {
    id: "green",
    name: "Green",
    style: {
        colours,
        scalars,
        palette: PALETTE,
        type: { measure: 64, labelStyle: "eyebrowAccent" },
    },
    chips: ["44.62 41.94% 93.92%", "36 10.64% 9.22%", "144 32.61% 18.04%"],
};
const OXBLOOD: StyleColourway = {
    id: "oxblood",
    name: "Oxblood",
    style: {
        colours,
        scalars,
        palette: { ...PALETTE, bg: "#F1F1F4", accent: "#4F2927" },
        type: { measure: 64, labelStyle: "eyebrowAccent" },
    },
    chips: ["240 13% 95%", "36 10.64% 9.22%", "2 34% 23%"],
};

const options: SiteStyleOptions = {
    rows: [
        {
            key: "pageGround",
            label: "Page ground",
            swatches: [
                { key: "paper", label: "Paper", hsl: "0 0% 100%" },
                { key: "bone", label: "Bone", hsl: "40 24% 97%" },
            ],
        },
        {
            key: "accent",
            label: "Accent",
            swatches: [
                { key: "clay", label: "Clay", hsl: "18 45% 45%" },
                { key: "teal", label: "Teal", hsl: "190 60% 35%" },
            ],
        },
    ],
    scalars: [
        {
            key: "gridGap",
            label: "Grid gap",
            min: 6,
            max: 32,
            step: 1,
            unit: "px",
            default: 14,
        },
    ],
    colourways: [GREEN, OXBLOOD],
    startColourway: "green",
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function renderPanel(style: SiteStyle, opts: SiteStyleOptions = options) {
    const onChange = vi.fn();
    act(() =>
        root.render(
            <StylePanel
                style={style}
                options={opts}
                onChange={onChange}
                onReset={vi.fn()}
                saving={false}
            />,
        ),
    );
    return onChange;
}

function el(selector: string): HTMLElement {
    const found = host.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
}

/** Open "Edit each colour", then the picker behind a row (DEC-184). */
function openRow(label: string) {
    if (!host.querySelector("[data-colour-rows]")) {
        click(el("[data-edit-colours]"));
    }
    const row = host.querySelector<HTMLElement>(`[data-colour-row="${label}"]`);
    if (!row) throw new Error(`No row "${label}"`);
    act(() => row.click());
}

/** A radio by its accessible name, in the open picker or the panel. */
function radio(name: string, scope = '[data-brand-picker][data-state="open"]') {
    const found = Array.from(
        document.querySelectorAll<HTMLElement>(`${scope} [role="radio"]`),
    ).find(
        (el) =>
            el.getAttribute("aria-label") === name ||
            el.textContent.trim() === name,
    );
    if (!found) throw new Error(`No radio "${name}"`);
    return found;
}
/** A colourway chip in the Colours group (U24b). */
const chip = (name: string) => radio(name, '[data-brand-group="Colours"]');

const group = (name: string) =>
    document.querySelector(`[role="radiogroup"][aria-label="${name}"]`);

function click(el: HTMLElement) {
    act(() => el.click());
}

describe("StylePanel colourways", () => {
    it("offers the template's colourways by name, the current one chosen", () => {
        renderPanel(GREEN.style);
        const green = chip("Green");
        expect(group("Colours")?.contains(green)).toBe(true);
        expect(green.getAttribute("aria-checked")).toBe("true");
        expect(chip("Oxblood").getAttribute("aria-checked")).toBe("false");
        expect(chip("Your own").getAttribute("aria-checked")).toBe("false");
        expect(host.textContent).toContain(
            "The Green colours are your template's own.",
        );
    });

    it("puts the style in a colourway, keeping any stored spacing", () => {
        const moved = {
            ...GREEN.style,
            scalars: { gridGap: 4, pageMargin: 20 },
        };
        const onChange = renderPanel(moved);
        click(chip("Oxblood"));
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next.palette?.accent).toBe("#4F2927");
        expect(next.scalars).toEqual({ gridGap: 4, pageMargin: 20 });
    });

    it("leaves the colourway for the rows' colours with Your own", () => {
        const onChange = renderPanel(GREEN.style);
        click(chip("Your own"));
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next).not.toHaveProperty("palette");
        expect(next).not.toHaveProperty("type");
    });

    it("leaves the palette when a swatch is chosen", () => {
        const onChange = renderPanel(GREEN.style);
        openRow("Accent");
        click(radio("Teal"));
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next).not.toHaveProperty("palette");
        expect(next.colours.accent).toBe("teal");
    });

    it("shows no row swatch as chosen while a palette is on", () => {
        renderPanel(GREEN.style);
        openRow("Accent");
        // The row names where the colour comes from, not a swatch it isn't.
        expect(
            host.querySelector('[data-colour-row="Accent"]')?.textContent,
        ).toContain("From your colours");
        expect(radio("Clay").getAttribute("aria-checked")).toBe("false");
    });

    it("offers no colourways for a site without a template", () => {
        renderPanel({ colours, scalars }, { ...options, colourways: [] });
        expect(group("Colours")).toBeNull();
    });
});

describe("one Brand panel (U24b)", () => {
    it("draws no slider anywhere, stored spacing or not", () => {
        renderPanel(GREEN.style);
        expect(host.querySelector('input[type="range"]')).toBeNull();
        expect(host.textContent).not.toContain("Spacing and shape");
    });

    it("says where a change goes", () => {
        renderPanel(GREEN.style);
        expect(host.querySelector("[data-style-save-line]")?.textContent).toBe(
            "Saved · goes live when you publish",
        );
    });

    it("makes the colours from one brand colour, and saves it with them", () => {
        const onChange = renderPanel(GREEN.style);
        click(el("[data-brand-colour-open]"));
        const input = document.querySelector<HTMLInputElement>(
            "[data-brand-colour-input]",
        );
        if (!input) throw new Error("No brand colour field");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "#E8A0B4");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(document.body.textContent).toContain(
            "too light for white words or small text",
        );
        const use = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Use these colours",
        );
        click(use as HTMLElement);
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next.brandColour).toBe("#E8A0B4");
        expect(next.palette?.bg).toBeDefined();
        // A colourway's type scale goes with the colourway.
        expect(next).not.toHaveProperty("type");
    });

    it("counts the plan's part of Brand from the rules, never from words in the code", () => {
        const paidPairs = new Set(["editorial"]);
        const rules = {
            isPaid: (kind: string, id: string) =>
                kind === "fontPair" ? paidPairs.has(id) : kind === "look",
            refuses: (kind: string, id: string) =>
                kind === "fontPair" ? paidPairs.has(id) : kind === "look",
        };
        act(() =>
            root.render(
                <StylePanel
                    style={GREEN.style}
                    options={{
                        ...options,
                        fontPairs: [
                            { key: "system", name: "System" },
                            { key: "serif", name: "Serif" },
                            { key: "editorial", name: "Editorial" },
                        ],
                    }}
                    onChange={vi.fn()}
                    onReset={vi.fn()}
                    saving={false}
                    rules={rules}
                />,
            ),
        );
        const fonts = host.querySelector('[data-plan-line="Fonts"]');
        expect(fonts?.textContent).toContain("2 pairs. 1 more on paid plans");
        expect(fonts?.textContent).toContain("2 of 3");
        // Change the catalogue, and the card follows.
        paidPairs.add("serif");
        act(() =>
            root.render(
                <StylePanel
                    style={GREEN.style}
                    options={{
                        ...options,
                        fontPairs: [
                            { key: "system", name: "System" },
                            { key: "serif", name: "Serif" },
                            { key: "editorial", name: "Editorial" },
                        ],
                    }}
                    onChange={vi.fn()}
                    onReset={vi.fn()}
                    saving={false}
                    rules={rules}
                />,
            ),
        );
        expect(
            host.querySelector('[data-plan-line="Fonts"]')?.textContent,
        ).toContain("1 of 3");
    });

    it("draws no plan card when the plan refuses nothing", () => {
        renderPanel(GREEN.style);
        expect(host.querySelector("[data-plan-summary]")).toBeNull();
    });
});

describe("the preview's resolver", () => {
    it("draws a colourway's palette and type scale as the API does", () => {
        const vars = resolveStyleVariables(GREEN.style, options);
        expect(vars["--site-accent"]).toBe("144 32.61% 18.04%");
        expect(vars["--site-measure"]).toBe("64ch");
        expect(vars["--site-label-style"]).toBe("eyebrowAccent");
        expect(vars["--site-grid-gap"]).toBe("1px");
    });

    it("matches a style to its colourway, and none once it leaves", () => {
        expect(activeColourway(GREEN.style, [GREEN, OXBLOOD])?.id).toBe(
            "green",
        );
        expect(
            activeColourway(inColourway(GREEN.style, OXBLOOD), [GREEN, OXBLOOD])
                ?.id,
        ).toBe("oxblood");
        const { palette: _p, ...own } = GREEN.style;
        expect(activeColourway(own, [GREEN, OXBLOOD])).toBeUndefined();
    });
});

describe("StylePanel on a phone (WXBBrandPhone)", () => {
    it("shows one group at a time, opening on Colours, the template in Look", () => {
        act(() =>
            root.render(
                <StylePanel
                    style={GREEN.style}
                    options={options}
                    onChange={vi.fn()}
                    onReset={vi.fn()}
                    saving={false}
                    phoneTabs
                    templateRow={<p data-row="">the template</p>}
                />,
            ),
        );
        const tabs = Array.from(
            host.querySelectorAll<HTMLElement>('[role="tab"]'),
        ).map((t) => t.textContent.trim());
        expect(tabs).toEqual(["Look", "Colours", "Buttons and shapes"]);
        expect(
            host.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent,
        ).toBe("Colours");
        expect(host.textContent).toContain("Colours from my brand colour");
        expect(host.querySelector("[data-style-save-line]")?.textContent).toBe(
            "Saved · goes live when you publish",
        );
    });
});

describe("Buttons and shapes (DEC-237)", () => {
    it("opens the list from its row on a desk and saves a pick", () => {
        const onChange = renderPanel({ ...GREEN.style, look: "folio" });
        const open = host.querySelector<HTMLElement>("[data-components-open]");
        expect(open?.textContent).toContain("Folio’s defaults · on every plan");
        act(() => open?.click());
        const pick = document.querySelector<HTMLElement>(
            '[data-brand-picker][data-state="open"] [data-component-row="cards"] [data-component-option="raised"]',
        );
        act(() => pick?.click());
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next.components).toEqual({ cards: "raised" });
        expect(next.look).toBe("folio");
    });

    it("is a tab of its own in a phone's Brand sheet", () => {
        act(() =>
            root.render(
                <StylePanel
                    style={GREEN.style}
                    options={options}
                    onChange={vi.fn()}
                    onReset={vi.fn()}
                    saving={false}
                    phoneTabs
                />,
            ),
        );
        const tab = Array.from(
            host.querySelectorAll<HTMLElement>('[role="tab"]'),
        ).find((t) => t.textContent === "Buttons and shapes");
        expect(tab).toBeDefined();
        act(() => {
            tab?.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true, button: 0 }),
            );
            tab?.click();
        });
        expect(host.querySelector("[data-component-list]")).not.toBeNull();
        expect(host.querySelector("[data-components-open]")).toBeNull();
    });
});

describe("no sliders in Brand (U24b, RULES §3)", () => {
    it("has no range input in any of its files", () => {
        const dir = __dirname;
        const sources = readdirSync(dir).filter(
            (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
        );
        expect(sources.length).toBeGreaterThan(5);
        for (const file of sources) {
            expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(
                /type=["']range["']/,
            );
        }
    });
});
