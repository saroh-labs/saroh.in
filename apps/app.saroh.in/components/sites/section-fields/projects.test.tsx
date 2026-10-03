// @vitest-environment jsdom
/**
 * The Projects block in the inspector (K11): add a project, move it, remove
 * it, give it a photo and a link, and what comes out is content the contract
 * takes — so the draft saves what the merchant sees.
 *
 * `react-dom/client` + `act` directly, as `text-photo.test.tsx` does. The
 * media library is stood in for: uploading is its own module's job.
 */
import { parseSectionContent } from "@saroh/block-contract";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { emptySection } from "../empty-section";
import { ProjectsFields } from "./projects";

vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: ({
        label,
        onPick,
    }: {
        label?: string;
        onPick: (img: { src: string; width?: number; height?: number }) => void;
    }) => (
        <button
            type="button"
            onClick={() =>
                onPick({
                    src: "https://cdn.example.com/menu.jpg",
                    width: 800,
                    height: 600,
                })
            }
        >
            {label}
        </button>
    ),
}));

type Projects = Extract<Section, { type: "projects" }>;

let root: Root;
let host: HTMLDivElement;
/** The draft as the editor holds it after each change. */
let draft: Projects;

/** The inspector holding its own draft, as the editor does. */
function Harness({ start }: { start: Projects }) {
    const [section, setSection] = useState<Projects>(start);
    return (
        <ProjectsFields
            section={section}
            services={{ status: "ready", services: [] }}
            pages={[]}
            onChange={(next) => {
                draft = next as Projects;
                setSection(next as Projects);
            }}
        />
    );
}

function mount(start: Projects) {
    draft = start;
    act(() => {
        root.render(<Harness start={start} />);
    });
}

function button(name: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll("button")).find(
        (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent.trim() === name,
    );
    if (!found) throw new Error(`No "${name}" button`);
    return found;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

/** The inputs labelled `label`, in order. */
function fields(label: string): (HTMLInputElement | HTMLTextAreaElement)[] {
    return Array.from(host.querySelectorAll("label"))
        .filter((l) => l.textContent.trim() === label)
        .map((l) => {
            const el = document.getElementById(l.htmlFor);
            if (!el) throw new Error(`No control for "${label}"`);
            return el as HTMLInputElement;
        });
}

/** Type into a React-controlled input or textarea. */
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

function saves(section: Projects): boolean {
    return parseSectionContent(
        section.type,
        section.contractVersion,
        section.content,
    ).success;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("the Projects inspector", () => {
    it("starts with one empty project, and no invented work", () => {
        const start = emptySection("projects") as Projects;
        expect(start.content.items).toEqual([{ title: "" }]);
        mount(start);
        expect(fields("Title")).toHaveLength(2);
        // The only project can't be removed or moved.
        expect(() => button("Remove")).toThrow();
        expect(() => button("Move project 1 up")).toThrow();
    });

    it("adds, reorders and removes projects, and the draft saves", () => {
        mount(emptySection("projects") as Projects);
        type(fields("Title")[1], "Menus for a bakery");
        click(button("Add a project"));
        type(fields("Title")[2], "A booking site");
        type(fields("Link")[1], "https://example.com/booking");
        expect(draft.content.items.map((p) => p.title)).toEqual([
            "Menus for a bakery",
            "A booking site",
        ]);

        click(button("Move project 2 up"));
        expect(draft.content.items).toEqual([
            { title: "A booking site", link: "https://example.com/booking" },
            { title: "Menus for a bakery" },
        ]);
        expect(button("Move project 1 up").disabled).toBe(true);
        expect(button("Move project 2 down").disabled).toBe(true);

        click(button("Move project 1 down"));
        expect(draft.content.items.map((p) => p.title)).toEqual([
            "Menus for a bakery",
            "A booking site",
        ]);
        expect(saves(draft)).toBe(true);

        click(button("Remove project 1"));
        expect(draft.content.items).toEqual([
            { title: "A booking site", link: "https://example.com/booking" },
        ]);
        expect(saves(draft)).toBe(true);
    });

    it("stops offering Add at the contract's cap", () => {
        const items = Array.from({ length: 24 }, (_, i) => ({
            title: `Project ${i + 1}`,
        }));
        mount({
            ...(emptySection("projects") as Projects),
            content: { items },
        });
        expect(() => button("Add a project")).toThrow();
        expect(host.textContent).toContain(
            "That is the most this block carries",
        );
    });

    it("takes a photo from the media library and asks for its description", () => {
        mount(emptySection("projects") as Projects);
        type(fields("Title")[1], "Menus for a bakery");
        click(button("Upload a photo…"));
        expect(draft.content.items[0].image).toEqual({
            src: "https://cdn.example.com/menu.jpg",
            alt: undefined,
            width: 800,
            height: 600,
        });
        expect(host.textContent).toContain("Needed before you publish.");
        // Saved as it is: the pre-publish check asks for the description.
        expect(saves(draft)).toBe(true);

        type(fields("Describe the photo")[0], "The menu's cover");
        expect(draft.content.items[0].image?.alt).toBe("The menu's cover");

        click(button("Remove photo"));
        expect(draft.content.items[0].image).toBeUndefined();
    });

    it("says so when a link is not one a site may draw", () => {
        mount(emptySection("projects") as Projects);
        const scheme = ["java", "script:"].join("");
        type(fields("Link")[0], `${scheme}alert(1)`);
        expect(host.textContent).toContain("A link must be a web address");
        expect(fields("Link")[0].getAttribute("aria-invalid")).toBe("true");

        type(fields("Link")[0], "");
        expect(draft.content.items[0].link).toBeUndefined();
    });
});
