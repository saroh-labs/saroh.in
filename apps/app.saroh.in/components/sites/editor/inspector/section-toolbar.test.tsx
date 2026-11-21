// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { longField, typeInto } from "../phone/text-sheet";
import { SectionToolbar, TOOLBAR_FOLD_PX } from "./section-toolbar";

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
    vi.unstubAllGlobals();
});

/** The toolbar inside a section of the given width. */
function draw(sectionWidth: number) {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            disconnect = vi.fn();
        },
    );
    const section = document.createElement("div");
    Object.defineProperty(section, "clientWidth", { value: sectionWidth });
    host.append(section);
    const sectionRoot = createRoot(section);
    act(() =>
        sectionRoot.render(
            <SectionToolbar
                label="Bridal packages"
                index={1}
                count={3}
                hiddenOnPhone={false}
                onMove={() => undefined}
                onDuplicate={() => undefined}
                onHideOnPhone={() => undefined}
                onDelete={() => undefined}
                onAskAi={() => undefined}
            />,
        ),
    );
    const bar = section.querySelector<HTMLElement>("[data-section-toolbar]");
    if (!bar) throw new Error("no toolbar");
    return bar;
}

describe("SectionToolbar (editor audit, 21 Nov)", () => {
    it("sits on the section's top edge, one line, without a name chip", () => {
        const bar = draw(TOOLBAR_FOLD_PX + 100);
        expect(bar.className).toContain("-top-6");
        expect(bar.className).toContain("flex-nowrap");
        expect(bar.className).not.toContain("flex-wrap ");
        expect(bar.textContent).not.toContain("Bridal packages");
        expect(bar.textContent).toBe("MoveDuplicateHide on phoneDeleteAsk AI");
    });

    it("folds its words to named icons on a narrow section", () => {
        const bar = draw(TOOLBAR_FOLD_PX - 1);
        expect(bar.dataset.folded).toBe("true");
        expect(bar.textContent).toBe("");
        const names = Array.from(bar.querySelectorAll("button")).map((b) =>
            b.getAttribute("aria-label"),
        );
        expect(names).toEqual([
            "Move",
            "Duplicate",
            "Hide on phone",
            "Delete",
            "Ask AI",
        ]);
    });
});

describe("a phone section's long one-line field (editor audit, 21 Nov)", () => {
    it("opens full screen for a textarea, or text that no longer fits", () => {
        expect(longField(document.createElement("textarea"))).toBe(true);
        const input = document.createElement("input");
        input.type = "text";
        expect(longField(input)).toBe(false);
        Object.defineProperty(input, "scrollWidth", { value: 900 });
        Object.defineProperty(input, "clientWidth", { value: 260 });
        expect(longField(input)).toBe(true);
        expect(longField(document.createElement("div"))).toBe(false);
    });

    it("types the words back into a one-line field as React hears it", () => {
        const input = document.createElement("input");
        const heard = vi.fn();
        input.addEventListener("input", heard);
        typeInto(input, "Cartons and tape");
        expect(input.value).toBe("Cartons and tape");
        expect(heard).toHaveBeenCalledOnce();
    });
});
