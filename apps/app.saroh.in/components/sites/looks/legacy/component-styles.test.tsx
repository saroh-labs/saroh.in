// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteStyle } from "@/lib/sites/style";
import { changedComponents, resolveStyleVariables } from "@/lib/sites/style";

import { ComponentStyleList, componentsLine } from "./component-styles";

/**
 * Brand › Customise components (DEC-237, plan U2, board SBCustomise): each
 * component's options, the look's default chosen until the owner picks; a
 * pick is kept even when it equals the look's own (KD1); Undo per row and
 * "Reset to <look>" take choices away.
 */

const base: SiteStyle = { colours: {}, scalars: {} };

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

function renderList(style: SiteStyle, disabled = false) {
    const onChange = vi.fn<(next: SiteStyle) => void>();
    act(() =>
        root.render(
            <ComponentStyleList
                style={style}
                onChange={onChange}
                disabled={disabled}
            />,
        ),
    );
    return onChange;
}

function found<T>(el: T | null | undefined, what: string): T {
    if (!el) throw new Error(`No ${what}`);
    return el;
}
const row = (kind: string) =>
    found(
        host.querySelector<HTMLElement>(`[data-component-row="${kind}"]`),
        kind,
    );
const option = (kind: string, id: string) =>
    found(
        row(kind).querySelector<HTMLElement>(`[data-component-option="${id}"]`),
        `${kind} ${id}`,
    );
const undo = (kind: string, label: string) =>
    found(
        row(kind).querySelector<HTMLElement>(`[aria-label="Undo ${label}"]`),
        `Undo ${label}`,
    );
const last = (fn: ReturnType<typeof renderList>) =>
    found(fn.mock.calls.at(-1)?.[0], "change");

describe("Customise components", () => {
    it("labels each group and chooses the look's defaults when nothing is set", () => {
        renderList({ ...base, look: "folio" });
        const group = row("buttons").querySelector('[role="radiogroup"]');
        const labelId = group?.getAttribute("aria-labelledby") ?? "";
        expect(document.getElementById(labelId)?.textContent).toBe("Buttons");
        expect(option("buttons", "square").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(option("cards", "flat").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(host.textContent).toContain(
            "Folio’s defaults · Free on every plan",
        );
        expect(host.querySelector("[data-component-changed]")).toBeNull();
        expect(host.querySelector("[data-components-reset]")).toBeNull();
    });

    it("stores a pick, and keeps one equal to the look's default", () => {
        const onChange = renderList(base);
        act(() => option("cards", "flat").click());
        expect(last(onChange).components).toEqual({ cards: "flat" });
        // Classic's own Bordered is still stored, so it survives a switch.
        const again = renderList({ ...base, components: { cards: "flat" } });
        act(() => option("cards", "bordered").click());
        expect(last(again).components).toEqual({ cards: "bordered" });
    });

    it("counts and marks the changed rows, with Undo and Reset to the look", () => {
        const style: SiteStyle = {
            ...base,
            look: "folio",
            // Square is Folio's own: kept, not counted.
            components: {
                buttons: "rounded",
                cards: "raised",
                images: "square",
            },
        };
        expect(changedComponents(style)).toEqual(["buttons", "cards"]);
        const onChange = renderList(style);
        expect(host.textContent).toContain(
            "Folio’s defaults, 2 changed · Free on every plan",
        );
        expect(row("buttons").textContent).toContain("Changed from Folio");
        expect(row("images").textContent).not.toContain("Changed from");

        act(() => undo("buttons", "Buttons").click());
        expect(last(onChange).components).toEqual({
            cards: "raised",
            images: "square",
        });

        const reset = found(
            host.querySelector<HTMLElement>("[data-components-reset]"),
            "Reset",
        );
        expect(reset.textContent).toBe("Reset to Folio");
        act(() => reset.click());
        expect(last(onChange)).not.toHaveProperty("components");
        expect(last(onChange).look).toBe("folio");
    });

    it("leaves the key out when the last choice is undone", () => {
        const onChange = renderList({
            ...base,
            components: { links: "arrow" },
        });
        act(() => undo("links", "Links").click());
        expect(last(onChange)).not.toHaveProperty("components");
    });

    it("shows a Reviewer the choices, off (DEC-200)", () => {
        const onChange = renderList(
            { ...base, components: { buttons: "pill" } },
            true,
        );
        expect(option("buttons", "pill").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(option("buttons", "square")).toHaveProperty("disabled", true);
        act(() => option("buttons", "square").click());
        expect(onChange).not.toHaveBeenCalled();
        expect(host.querySelector("[data-components-reset]")).toBeNull();
        expect(host.querySelector('[aria-label="Undo Buttons"]')).toBeNull();
        expect(row("buttons").textContent).toContain("Changed from Classic");
    });

    it("draws the choices on the preview, nothing for a site with none", () => {
        const opts = { rows: [], scalars: [] };
        expect(
            Object.keys(resolveStyleVariables(base, opts)).some((k) =>
                k.startsWith("--site-choice-"),
            ),
        ).toBe(false);
        expect(
            resolveStyleVariables(
                { ...base, components: { cards: "flat" } },
                opts,
            )["--site-choice-cards"],
        ).toBe("flat");
    });

    it("names the look in the line, Classic for none", () => {
        expect(componentsLine(base)).toBe(
            "Classic’s defaults · Free on every plan",
        );
    });
});
