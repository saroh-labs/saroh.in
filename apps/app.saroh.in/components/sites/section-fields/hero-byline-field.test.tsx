// @vitest-environment jsdom
/**
 * The hero's Byline field (U4): a name makes one, a role joins it, and
 * clearing the name removes it, so a saved hero never holds an empty
 * byline the contract refuses.
 */
import { parseSectionContent } from "@saroh/block-contract";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { HeroFields } from "@/components/sites/content-sections/hero";

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
    return null;
}

function mount(start: Section) {
    draft = start;
    act(() => root.render(<Harness start={start} />));
}

function field(label: string): HTMLInputElement | null {
    const l = Array.from(host.querySelectorAll("label")).find(
        // An optional field's label carries "Optional" after its words.
        (x) => x.textContent.trim().startsWith(label),
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

describe("the hero's byline", () => {
    it("a name makes one, a role joins it, and it saves", () => {
        mount(hero());
        const name = field("Written by");
        expect(name).not.toBeNull();
        expect(field("Their role")).toBeNull();
        if (name) type(name, "Asha Verma");
        const role = field("Their role");
        if (role) type(role, "Founder");
        expect(draft.content).toMatchObject({
            byline: { name: "Asha Verma", role: "Founder" },
        });
        expect(saves(draft)).toBe(true);
    });

    it("clearing the name removes it", () => {
        mount(hero());
        const name = field("Written by");
        if (name) type(name, "Meera");
        if (name) type(name, "");
        expect((draft.content as { byline?: unknown }).byline).toBeUndefined();
        expect(saves(draft)).toBe(true);
    });
});
