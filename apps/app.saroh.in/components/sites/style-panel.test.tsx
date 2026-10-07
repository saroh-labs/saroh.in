// @vitest-environment jsdom
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

/** A radio by its accessible name: its label, else its words. */
function radio(name: string): HTMLElement {
    const found = Array.from(
        host.querySelectorAll<HTMLElement>('[role="radio"]'),
    ).find(
        (el) =>
            el.getAttribute("aria-label") === name ||
            el.textContent.trim() === name,
    );
    if (!found) throw new Error(`No radio "${name}"`);
    return found;
}

const group = (name: string) =>
    host.querySelector(`[role="radiogroup"][aria-label="${name}"]`);

function click(el: HTMLElement) {
    act(() => el.click());
}

describe("StylePanel colourways", () => {
    it("offers the template's colourways by name, the current one chosen", () => {
        renderPanel(GREEN.style);
        const green = radio("Green");
        expect(group("Colourway")?.contains(green)).toBe(true);
        expect(green.getAttribute("aria-checked")).toBe("true");
        expect(radio("Oxblood").getAttribute("aria-checked")).toBe("false");
        expect(host.textContent).toContain(
            "The Green colourway uses your template's own colours.",
        );
    });

    it("puts the style in a colourway, keeping the merchant's spacing", () => {
        const moved = {
            ...GREEN.style,
            scalars: { gridGap: 4, pageMargin: 20 },
        };
        const onChange = renderPanel(moved);
        click(radio("Oxblood"));
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next.palette?.accent).toBe("#4F2927");
        expect(next.scalars).toEqual({ gridGap: 4, pageMargin: 20 });
    });

    it("leaves the palette when a swatch is chosen", () => {
        const onChange = renderPanel(GREEN.style);
        click(radio("Teal"));
        const next = onChange.mock.calls[0][0] as SiteStyle;
        expect(next).not.toHaveProperty("palette");
        expect(next.colours.accent).toBe("teal");
    });

    it("shows no row swatch as chosen while a palette is on", () => {
        renderPanel(GREEN.style);
        expect(radio("Clay").getAttribute("aria-checked")).toBe("false");
    });

    it("shows a template's hairline gap truly on the slider", () => {
        renderPanel(GREEN.style);
        const slider = host.querySelector<HTMLInputElement>("#style-gridGap");
        if (!slider) throw new Error("no slider");
        expect(slider.min).toBe("1");
        expect(slider.value).toBe("1");
    });

    it("offers no colourways for a site without a template", () => {
        renderPanel({ colours, scalars }, { ...options, colourways: [] });
        expect(group("Colourway")).toBeNull();
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
