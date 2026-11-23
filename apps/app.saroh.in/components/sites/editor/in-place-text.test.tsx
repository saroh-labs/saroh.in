// @vitest-environment jsdom
import { EditableTextContext, PageSections } from "@saroh/site-blocks";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { inPlaceText } from "./in-place-text";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

/** Typing on the page beyond headings (U47d, D1): the hero's line, with the bar. */
describe("typing on the page (D1)", () => {
    const hero = {
        type: "hero",
        content: { heading: "Bridal makeup", subheading: "In Rohtak" },
    } as unknown as Section;

    it("the hero's line is typed into, with Paragraph, its length and Done", () => {
        const replace = vi.fn();
        const edit = inPlaceText(hero, replace);
        if (!edit) throw new Error("No host for a hero");
        act(() =>
            root.render(
                <EditableTextContext.Provider value={edit}>
                    <PageSections sections={[hero]} />
                </EditableTextContext.Provider>,
            ),
        );
        const line = host.querySelector<HTMLElement>(
            "[data-edit-field=subheading]",
        );
        if (!line) throw new Error("The line is not marked");
        act(() => line.focus());
        expect(host.textContent).toContain("Paragraph");
        expect(host.textContent).toContain("9 of 160");
        act(() => {
            line.textContent = "In Rohtak, Delhi Road";
            line.dispatchEvent(new InputEvent("input", { bubbles: true }));
        });
        expect(replace).toHaveBeenCalledWith({
            ...hero,
            content: { ...hero.content, subheading: "In Rohtak, Delhi Road" },
        });
        expect(host.textContent).toContain("21 of 160");
        const done = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Done",
        );
        act(() => done?.click());
        expect(host.textContent).not.toContain("Paragraph");
    });

    it("an intro shows its length against the contract's 600", () => {
        const faq = {
            type: "faq",
            content: { heading: "Questions", intro: "Ask us", items: [] },
        } as unknown as Section;
        const edit = inPlaceText(faq, vi.fn());
        if (!edit?.bar) throw new Error("No bar");
        const bar = edit.bar({ field: "intro", text: "Ask us", done: vi.fn() });
        act(() => root.render(<>{bar}</>));
        expect(host.textContent).toContain("6 of 600");
    });
});
