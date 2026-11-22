// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

import type { ElementStyleTabProps } from "./element-style-tab";
import { ElementStyleTab } from "./element-style-tab";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const OPTIONS: SiteStyleOptions = { rows: [], scalars: [], fontPairs: [] };
const STYLE: SiteStyle = { colours: {}, scalars: {} };

const hero = (content: Record<string, unknown> = {}): Section => ({
    key: "s1",
    type: "hero",
    contractVersion: 2,
    content: {
        heading: "Packaging, from stock",
        cta: {
            label: "Browse the catalogue",
            action: { kind: "page", pageId: "p" },
        },
        ...content,
    },
});

function draw(over: Partial<ElementStyleTabProps> = {}) {
    const onChange = vi.fn<(next: Section) => void>();
    const onSiteStyle = vi.fn<(next: SiteStyle) => void>();
    act(() =>
        root.render(
            <ElementStyleTab
                element={{ kind: "button", path: "cta" }}
                section={hero()}
                sectionName="Hero"
                scope="element"
                onScope={() => undefined}
                style={STYLE}
                styleOptions={OPTIONS}
                onChange={onChange}
                onSiteStyle={onSiteStyle}
                {...over}
            />,
        ),
    );
    return { onChange, onSiteStyle };
}

/** The content the n-th change wrote. */
const wrote = (fn: { mock: { calls: [Section][] } }, n = 0) =>
    fn.mock.calls[n][0].content as Record<string, Record<string, unknown>>;

const press = (el: Element | null | undefined) =>
    act(() => (el as HTMLElement).click());
const radio = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

describe("a button's Style tab (CSI-C, CS1)", () => {
    it("says what the look really draws: a site's stored 2px corners", () => {
        draw({
            style: { colours: {}, scalars: { cornerRadius: 2 } },
            styleOptions: {
                rows: [],
                fontPairs: [],
                scalars: [
                    {
                        key: "cornerRadius",
                        label: "Corners",
                        min: 0,
                        max: 24,
                        step: 1,
                        default: 10,
                        unit: "px",
                    },
                ],
            } as unknown as SiteStyleOptions,
        });
        expect(host.textContent).toContain(
            "Classic draws buttons with 2px corners.",
        );
        draw({ style: { colours: {}, scalars: {}, look: "quiet" } });
        expect(host.textContent).toContain("Quiet draws buttons as pills.");
    });

    it("puts Apply to first, then Colour, Style, Corners and Size", () => {
        draw();
        const text = host.textContent;
        const at = (w: string) => text.indexOf(w);
        expect(at("Apply to")).toBeLessThan(at("Colour"));
        expect(at("Colour")).toBeLessThan(at("Style"));
        expect(at("Corners")).toBeLessThan(at("Size"));
        expect(text).toContain("Only “Browse the catalogue” changes.");
        for (const role of ["Background", "Panels", "Text", "Brand", "Lines"]) {
            expect(host.querySelector(`[aria-label="${role}"]`)).not.toBeNull();
        }
        expect(text).toContain("Custom");
        expect(text).toContain("Classic draws buttons with rounded corners.");
        expect(text).toContain("0 changes from Classic");
    });

    it("writes this button's own corners and Soft onto the button", () => {
        const { onChange } = draw();
        press(radio("Pill"));
        expect(wrote(onChange, 0).cta.elementStyle).toEqual({
            corners: "pill",
        });
        press(host.querySelector('[data-button-style="soft"]'));
        expect(wrote(onChange, 1).cta.style).toBe("soft");
    });

    it("writes this section's choice into its frame, and the site's into Brand", () => {
        const { onChange } = draw({ scope: "section" });
        press(radio("L"));
        expect(wrote(onChange, 0).frame).toEqual({
            styles: { button: { size: "l" } },
        });
        const { onSiteStyle } = draw({ scope: "site" });
        press(radio("Square"));
        expect(onSiteStyle.mock.calls[0][0].components).toEqual({
            buttons: "square",
        });
        // A custom colour is for one button or one section.
        expect(host.querySelector("[data-colour-custom]")).toBeNull();
    });

    it("marks a change and resets this button to the look's own", () => {
        const { onChange } = draw({
            section: hero({
                cta: {
                    label: "Browse the catalogue",
                    action: { kind: "page", pageId: "p" },
                    style: "soft",
                    elementStyle: { corners: "pill" },
                },
            }),
        });
        expect(
            host.querySelector('[data-style-changed="corners"]'),
        ).not.toBeNull();
        expect(host.textContent).toContain("2 changes from Classic");
        press(radio("Reset this button"));
        expect(wrote(onChange, 0).cta).toEqual({
            label: "Browse the catalogue",
            action: { kind: "page", pageId: "p" },
            style: "primary",
        });
    });

    it("styles a photo's corners only", () => {
        const { onChange } = draw({
            element: { kind: "image", path: "image" },
            section: hero({ image: { src: "/a.jpg", alt: "The warehouse" } }),
        });
        expect(host.textContent).not.toContain("Size");
        press(radio("Arch"));
        expect(wrote(onChange, 0).image.elementStyle).toEqual({
            corners: "arch",
        });
    });
});
