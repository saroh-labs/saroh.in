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
/** True: a phone-width screen, where the colour picker is a bottom sheet. */
let phone = false;
beforeEach(() => {
    phone = false;
    // jsdom has no matchMedia: the picker asks it whether this is a phone.
    window.matchMedia = ((q: string) => ({
        matches: phone,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
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
    Array.from(document.querySelectorAll("button")).find(
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
        for (const role of [
            "Background",
            "Panels",
            "Text",
            "Brand",
            "Brand tint",
            "Lines",
        ]) {
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
        // Reset asks which level (CSI-C states 4); only this button has any.
        const trigger = host.querySelector("[data-reset-levels]");
        act(() => {
            trigger?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });
        const level = (l: string) =>
            document.querySelector(`[data-reset-level="${l}"]`);
        expect(level("section")?.hasAttribute("data-disabled")).toBe(true);
        expect(level("site")?.textContent).toContain(
            "Back to Classic across the site",
        );
        press(level("element"));
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

    it("counts the buttons a section's choice reaches", () => {
        draw({ scope: "section" });
        expect(host.textContent).toContain("1 button in Hero.");
    });

    it("tries a custom colour on the canvas, uses it and keeps it in Recent", () => {
        window.localStorage.clear();
        const onTry = vi.fn<(next: Section | null) => void>();
        const { onChange } = draw({ onTry });
        press(host.querySelector("[data-colour-custom]"));
        const picker = () => document.querySelector("[data-button-colour]");
        expect(picker()?.textContent).toContain("Button colour");
        expect(picker()?.textContent).toContain("Site colours");
        expect(document.querySelector("[data-colour-square]")).not.toBeNull();
        expect(document.querySelector("[data-colour-hue]")).not.toBeNull();

        const hex = picker()?.querySelector<HTMLInputElement>(
            "input[aria-invalid]",
        );
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(hex, "#1F5F8B");
            hex?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        // Drawn on the page, unsaved.
        const tried = onTry.mock.calls.at(-1)?.[0]?.content as Record<
            string,
            Record<string, unknown>
        >;
        expect(tried.cta.elementStyle).toEqual({ colour: "#1F5F8B" });
        expect(onChange).not.toHaveBeenCalled();

        press(radio("Use this colour"));
        expect(wrote(onChange, 0).cta.elementStyle).toEqual({
            colour: "#1F5F8B",
        });
        expect(onTry.mock.calls.at(-1)?.[0]).toBeNull();

        press(host.querySelector("[data-colour-custom]"));
        expect(
            document.querySelector('[aria-label="Recent colour #1F5F8B"]'),
        ).not.toBeNull();
    });

    it("picks a site colour from the picker's first tab", () => {
        const { onChange } = draw();
        press(host.querySelector("[data-colour-custom]"));
        press(
            Array.from(document.querySelectorAll('[role="radio"]')).find(
                (b) => b.textContent.trim() === "Site colours",
            ),
        );
        press(document.querySelector('[data-role-row="fg"]'));
        expect(wrote(onChange, 0).cta.elementStyle).toEqual({ colour: "fg" });
    });

    it("shows Recent even before a colour is used", () => {
        window.localStorage.clear();
        draw();
        press(host.querySelector("[data-colour-custom]"));
        expect(document.querySelector("[data-recent]")?.textContent).toContain(
            "Colours you use land here.",
        );
    });

    it("keeps Use this colour out of the scrolling body, so it stays in reach", () => {
        draw();
        press(host.querySelector("[data-colour-custom]"));
        const actions = document.querySelector("[data-picker-actions]");
        expect(actions?.textContent).toContain("Use this colour");
        expect(actions?.closest("[data-picker-body]")).toBeNull();
        expect(
            document.querySelector("[data-button-colour]")?.className,
        ).toContain("max-h-[var(--radix-popover-content-available-height)]");
    });

    it("ends the custom preview when Site colours is chosen", () => {
        const onTry = vi.fn<(next: Section | null) => void>();
        draw({ onTry });
        press(host.querySelector("[data-colour-custom]"));
        const hex = document.querySelector<HTMLInputElement>(
            "[data-button-colour] input[aria-invalid]",
        );
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(hex, "#1F5F8B");
            hex?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(onTry.mock.calls.at(-1)?.[0]).not.toBeNull();
        press(
            Array.from(document.querySelectorAll('[role="radio"]')).find(
                (b) => b.textContent.trim() === "Site colours",
            ),
        );
        expect(onTry.mock.calls.at(-1)?.[0]).toBeNull();
    });

    it("puts the colour picker in a bottom sheet on a phone, Use on top and pinned", () => {
        phone = true;
        const reveal = vi.fn();
        draw({ onTry: vi.fn() });
        // The tapped button is scrolled into view above the sheet.
        const target = document.createElement("a");
        target.dataset.siteEl = "button:cta";
        document.body.append(target);
        const scroll = vi.fn();
        target.scrollIntoView = scroll;
        press(host.querySelector("[data-colour-custom]"));
        const sheet = document.querySelector("[data-colour-sheet]");
        expect(sheet).not.toBeNull();
        expect(sheet?.textContent).toContain("Button colour");
        expect(sheet?.textContent).toContain("Recent");
        expect(sheet?.textContent).toContain("Hex");
        expect(scroll).toHaveBeenCalled();
        expect(reveal).not.toHaveBeenCalled();
        const buttons = Array.from(
            document.querySelectorAll("[data-picker-actions] button"),
        ).map((b) => b.textContent);
        expect(buttons).toEqual(["Use this colour", "Cancel"]);
        // No scrim: the page stays in reach.
        expect(document.querySelector("[data-vaul-overlay]")).toBeNull();
    });

    it("hides the Style sheet while the phone colour sheet is open, and brings it back", () => {
        phone = true;
        host.dataset.editorSheet = "Button";
        const { onChange } = draw({ onTry: vi.fn() });
        const sheetHidden = () => host.hasAttribute("data-colour-open");
        press(host.querySelector("[data-colour-custom]"));
        expect(sheetHidden()).toBe(true);
        // Cancel: back to the Style sheet.
        press(
            Array.from(
                document.querySelectorAll("[data-picker-actions] button"),
            ).find((b) => b.textContent === "Cancel"),
        );
        expect(sheetHidden()).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
        // Use this colour: saved, and back.
        press(host.querySelector("[data-colour-custom]"));
        expect(sheetHidden()).toBe(true);
        const hex = document.querySelector<HTMLInputElement>(
            "[data-button-colour] input[aria-invalid]",
        );
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(hex, "#1F5F8B");
            hex?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        press(radio("Use this colour"));
        expect(onChange).toHaveBeenCalled();
        expect(sheetHidden()).toBe(false);
    });

    it("warns before saving a colour no words read on, and keeps it when confirmed", () => {
        window.localStorage.clear();
        const onTry = vi.fn<(next: Section | null) => void>();
        const { onChange } = draw({ onTry });
        press(host.querySelector("[data-colour-custom]"));
        const hex = document.querySelector<HTMLInputElement>(
            "[data-button-colour] input[aria-invalid]",
        );
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(hex, "#777777");
            hex?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        press(radio("Use this colour"));
        // Warned, not saved, not silent.
        expect(onChange).not.toHaveBeenCalled();
        expect(
            document.querySelector("[data-confirm-unreadable]")?.textContent,
        ).toContain("hard to read");
        press(radio("Use it anyway"));
        expect(wrote(onChange, 0).cta.elementStyle).toEqual({
            colour: "#777777",
        });
    });

    it("shows a five-step shade strip under the selected role; a failing shade waits for a yes", () => {
        const { onChange } = draw({
            // The palette the strip's base colour comes from.
            style: {
                colours: {},
                scalars: {},
                palette: {
                    bg: "#FFFFFF",
                    surface: "#F7F2EC",
                    fg: "#1C1A18",
                    body: "#1C1A18",
                    muted: "#4A4843",
                    border: "#D9D6CC",
                    accent: "#A65E3F",
                    accentFg: "#FFFFFF",
                    heroBg: "#FFFFFF",
                    heroFg: "#1C1A18",
                    ctaBg: "#A65E3F",
                    ctaFg: "#FFFFFF",
                    footerBg: "#FFFFFF",
                    footerFg: "#1C1A18",
                },
            } as unknown as SiteStyle,
        });
        const strip = host.querySelector("[data-shade-strip]");
        expect(strip).not.toBeNull();
        expect(strip?.querySelectorAll("[data-shade]")).toHaveLength(5);
        expect(strip?.textContent).toContain("Brand · shade");
        // A readable shade is applied at once, as a custom colour.
        const shades = Array.from(
            strip?.querySelectorAll<HTMLElement>("[data-shade]") ?? [],
        );
        press(shades[4]);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(wrote(onChange, 0).cta.elementStyle).toEqual({
            colour: expect.stringMatching(/^#[0-9A-F]{6}$/) as string,
        });
    });
});
