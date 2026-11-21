import { act, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditableText, EditableTextContext } from "./editable-text";
import { PageSections } from "./section-renderer";

/**
 * The editable-text markers (U47d) draw nothing of their own on the live
 * site: no provider, no wrapper, no attribute. The classic and look
 * snapshots (`classic-pin`, `component-theme`) pin every block's HTML; this
 * says it outright for the blocks that carry a marker.
 */
const MARKED = [
    {
        type: "hero",
        content: { heading: "Bridal makeup for your day", subheading: "x" },
    },
    {
        type: "faq",
        content: {
            heading: "Questions",
            intro: "Ask us anything",
            items: [{ question: "Open Sundays?", answer: "Till noon." }],
        },
    },
    {
        type: "features",
        content: {
            heading: "Why us",
            intro: "Three reasons",
            items: [{ title: "Near you" }],
        },
    },
    {
        type: "testimonials",
        content: {
            heading: "What brides say",
            items: [{ quote: "Lovely", name: "Asha" }],
        },
    },
    {
        type: "contact",
        content: {
            heading: "Find us",
            intro: "On Delhi Road",
            phone: "+91 00000 01001",
        },
    },
];

describe("editable-text markers (U47d)", () => {
    it("draw the words and nothing else on the live site", () => {
        const html = renderToStaticMarkup(<PageSections sections={MARKED} />);
        expect(html).not.toContain("data-edit-field");
        expect(html).not.toContain("contenteditable");
        // The words sit straight in their heading, as before the markers.
        expect(html).toMatch(/<h1[^>]*>Bridal makeup for your day<\/h1>/);
        expect(html).toMatch(/<h2[^>]*>Questions<\/h2>/);
        expect(html).toMatch(/<p[^>]*>Ask us anything<\/p>/);
        expect(html).toMatch(/<h2[^>]*>What brides say<\/h2>/);
        for (const look of ["folio", "quiet", "live"] as const) {
            const drawn = renderToStaticMarkup(
                <PageSections sections={MARKED} look={look} />,
            );
            expect(drawn, look).not.toContain("data-edit-field");
        }
    });

    it("with the editor's host, mark the field and send what is typed", () => {
        const onText = vi.fn();
        const { container } = render(
            <EditableTextContext.Provider value={{ onText }}>
                <h2>
                    <EditableText field="heading">Questions</EditableText>
                </h2>
            </EditableTextContext.Provider>,
        );
        const el = container.querySelector<HTMLElement>(
            "[data-edit-field=heading]",
        );
        if (!el) throw new Error("No marked heading");
        expect(el.textContent).toBe("Questions");
        expect(el.getAttribute("contenteditable")).toBe("plaintext-only");
        act(() => el.focus());
        fireEvent.focus(el);
        el.textContent = "Your questions";
        fireEvent.input(el);
        expect(onText).toHaveBeenLastCalledWith("heading", "Your questions");
        // Esc puts the words back.
        fireEvent.keyDown(el, { key: "Escape" });
        expect(onText).toHaveBeenLastCalledWith("heading", "Questions");
        expect(el.textContent).toBe("Questions");
    });

    it("never sends empty words; emptied, they come back on leaving", () => {
        const onText = vi.fn();
        const { container } = render(
            <EditableTextContext.Provider value={{ onText }}>
                <EditableText field="intro">Ask us</EditableText>
            </EditableTextContext.Provider>,
        );
        const el = container.querySelector<HTMLElement>("[data-edit-field]");
        if (!el) throw new Error("No marked intro");
        fireEvent.focus(el);
        el.textContent = "";
        fireEvent.input(el);
        expect(onText).not.toHaveBeenCalled();
        fireEvent.blur(el);
        expect(onText).toHaveBeenLastCalledWith("intro", "Ask us");
        expect(el.textContent).toBe("Ask us");
    });
});
