// @vitest-environment jsdom
/**
 * Phone text in the inspector (U7, KD9, DEC-227): a button, the hero's line
 * and a Text block's body each choose "Same on phone" or "Shorter on phone";
 * shorter opens an empty phone field, body text says search engines read
 * it, and the hero's heading has no phone field, only "Shorten it for both".
 */
import { parseSectionContent } from "@saroh/block-contract";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { HeroFields } from "@/components/sites/content-sections/hero";
import { RichTextFields } from "@/components/sites/content-sections/rich-text";
import { PHONE_SEARCH_HINT } from "./phone-text-field";

vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));

let root: Root;
let host: HTMLDivElement;
let draft: Section;

function Harness({ start }: { start: Section }) {
    const [section, setSection] = useState<Section>(start);
    const props = {
        pages: [],
        services: { status: "ready" as const, services: [] },
        onChange: (next: Section) => {
            draft = next;
            setSection(next);
        },
    };
    if (section.type === "hero") {
        return <HeroFields section={section} {...props} />;
    }
    if (section.type === "richText") {
        return <RichTextFields section={section} {...props} />;
    }
    return null;
}

function mount(start: Section) {
    draft = start;
    act(() => root.render(<Harness start={start} />));
}

/** An answer in the choice group named `group`. */
function choice(group: string, answer: string): HTMLButtonElement {
    const g = Array.from(host.querySelectorAll('[role="group"]')).find(
        (el) =>
            document
                .getElementById(el.getAttribute("aria-labelledby") ?? "")
                ?.textContent.trim() === group,
    );
    const b = Array.from(g?.querySelectorAll("button") ?? []).find(
        (x) => x.textContent.trim() === answer,
    );
    if (!b) throw new Error(`No "${answer}" in "${group}"`);
    return b;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function field(label: string): HTMLInputElement | null {
    const l = Array.from(host.querySelectorAll("label")).find(
        (x) => x.textContent.trim() === label,
    );
    return l ? (document.getElementById(l.htmlFor) as HTMLInputElement) : null;
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto =
        input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    act(() => {
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
            input,
            value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const saves = (s: Section) =>
    parseSectionContent(s.type, s.contractVersion, s.content).success;

const hero = (): Section =>
    ({
        id: "s_hero",
        type: "hero",
        contractVersion: 2,
        content: {
            heading: "Cuts, colour & brides.",
            subheading: "Kesar Salon on Linking Road, Khar West.",
            cta: {
                label: "Book a chair",
                action: { kind: "url", href: "/book" },
                style: "primary",
            },
        },
    }) as Section;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("the hero's phone text", () => {
    it("has no phone field for the heading, and Shorten it for both focuses it", () => {
        mount(hero());
        expect(host.textContent).not.toContain("Heading on phone");
        const shorten = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Shorten it for both.",
        );
        expect(shorten).toBeTruthy();
        if (shorten) click(shorten);
        expect(document.activeElement).toBe(field("Heading"));
    });

    it("opens an empty phone field for the button, kept when the label changes", () => {
        mount(hero());
        expect(field("Button, on phone")).toBeNull();
        click(choice("Button on phone", "Shorter on phone"));
        const input = field("Button, on phone");
        expect(input?.value).toBe("");
        expect(host.textContent).toContain(
            "Empty: phone shows “Book a chair”.",
        );
        if (input) type(input, "Book");
        const label = field("Button label");
        if (label) type(label, "Book a chair today");
        const c = draft.content as { cta?: { phoneLabel?: string } };
        expect(c.cta?.phoneLabel).toBe("Book");
        expect(saves(draft)).toBe(true);

        click(choice("Button on phone", "Same on phone"));
        expect(
            (draft.content as { cta?: { phoneLabel?: string } }).cta
                ?.phoneLabel,
        ).toBeUndefined();
    });

    it("says search engines read the phone line", () => {
        mount(hero());
        expect(host.textContent).not.toContain(PHONE_SEARCH_HINT);
        click(choice("Subheading on phone", "Shorter on phone"));
        expect(host.textContent).toContain(PHONE_SEARCH_HINT);
        const input = field("Subheading, on phone");
        if (input) type(input, "Linking Road, Khar West.");
        expect((draft.content as { phoneLine?: string }).phoneLine).toBe(
            "Linking Road, Khar West.",
        );
        expect(saves(draft)).toBe(true);
    });
});

describe("a Text block's phone body", () => {
    it("shows the search hint and saves the shorter body", () => {
        mount({
            id: "s_text",
            type: "richText",
            contractVersion: 1,
            content: { format: "markdown", value: "A long story." },
        } as Section);
        click(choice("Content on phone", "Shorter on phone"));
        expect(host.textContent).toContain(PHONE_SEARCH_HINT);
        const body = field("Content, on phone");
        if (body) type(body, "Short.");
        expect((draft.content as { phoneBody?: string }).phoneBody).toBe(
            "Short.",
        );
        expect(saves(draft)).toBe(true);
    });
});
