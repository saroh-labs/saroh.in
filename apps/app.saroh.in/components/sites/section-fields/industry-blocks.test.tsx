// @vitest-environment jsdom
/**
 * The industry templates' blocks in the inspector (U2): a Person typed in,
 * a Timetable narrowed to some classes, and a photo slot shipped as a brief
 * (KTD-5) showing the brief until a photo is chosen. What comes out is
 * content the contract takes, so the draft saves what the merchant sees.
 *
 * `react-dom/client` + `act`, as `projects.test.tsx` does; the media library
 * is stood in for.
 */
import { parseSectionContent } from "@saroh/block-contract";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { emptySection } from "../empty-section";
import { HeroFields } from "./hero";
import { PersonFields } from "./person";
import { TimetableFields } from "./timetable";

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
                onPick({ src: "https://cdn.example.com/anika.jpg", width: 800 })
            }
        >
            {label ?? "Upload"}
        </button>
    ),
}));

type Person = Extract<Section, { type: "person" }>;
type Timetable = Extract<Section, { type: "timetable" }>;

let root: Root;
let host: HTMLDivElement;
let draft: Section;

const SERVICES = {
    status: "ready" as const,
    services: [
        { id: "svc_strength", name: "Strength", status: "ACTIVE" as const },
        { id: "svc_yoga", name: "Yoga", status: "ACTIVE" as const },
        { id: "svc_old", name: "Old class", status: "ARCHIVED" as const },
    ],
};

function Harness({ start }: { start: Section }) {
    const [section, setSection] = useState<Section>(start);
    const props = {
        pages: [],
        services: SERVICES,
        onChange: (next: Section) => {
            draft = next;
            setSection(next);
        },
    };
    if (section.type === "person") {
        return <PersonFields section={section} {...props} />;
    }
    if (section.type === "timetable") {
        return <TimetableFields section={section} {...props} />;
    }
    if (section.type === "hero") {
        return <HeroFields section={section} {...props} />;
    }
    return null;
}

function mount(start: Section) {
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

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
    const l = Array.from(host.querySelectorAll("label")).find(
        (x) => x.textContent.trim() === label,
    );
    const el = l ? document.getElementById(l.htmlFor) : null;
    if (!el) throw new Error(`No control for "${label}"`);
    return el as HTMLInputElement;
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

function saves(section: Section): boolean {
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

describe("the Person inspector", () => {
    it("starts with an empty name — no invented practitioner — and saves once named", () => {
        const start = emptySection("person") as Person;
        expect(start.content).toEqual({ name: "" });
        expect(saves(start)).toBe(false);
        mount(start);
        type(field("Name"), "Dr Anika Rao");
        type(field("What they do"), "Clinical dietician");
        click(button("Add a qualification"));
        const first = host.querySelector<HTMLInputElement>(
            'input[aria-label="Qualification 1"]',
        );
        if (!first) throw new Error("No qualification field");
        type(first, "MSc Nutrition");
        expect(draft.content).toMatchObject({
            name: "Dr Anika Rao",
            role: "Clinical dietician",
            credentials: ["MSc Nutrition"],
        });
        expect(saves(draft)).toBe(true);
    });

    it("shows a template's photo brief until a photo is chosen, then asks for its description", () => {
        mount({
            ...(emptySection("person") as Person),
            content: {
                name: "Anika",
                imageBrief: "A plain portrait at the desk",
            },
        });
        expect(host.textContent).toContain(
            "Photo wanted: A plain portrait at the desk",
        );
        click(button("Upload a photo…"));
        expect(host.textContent).not.toContain("Photo wanted");
        expect(host.textContent).toContain("Needed before you publish.");
        expect(saves(draft)).toBe(true);
    });
});

describe("the Timetable inspector", () => {
    it("shows every class until some are ticked, and only active services are offered", () => {
        const start = emptySection("timetable") as Timetable;
        mount(start);
        expect(host.textContent).toContain("Every class on your booking page");
        expect(host.textContent).not.toContain("Old class");
        const yoga = host.querySelector<HTMLButtonElement>(
            `[id$="-svc-svc_yoga"]`,
        );
        if (!yoga) throw new Error("No Yoga checkbox");
        click(yoga);
        expect((draft as Timetable).content.serviceIds).toEqual(["svc_yoga"]);
        expect(saves(draft)).toBe(true);
        click(yoga);
        // None ticked is stored as absent: every class.
        expect((draft as Timetable).content.serviceIds).toBeUndefined();
    });
});

describe("a hero shipped as a brief (KTD-5)", () => {
    it("names the photo it wants in the empty image slot", () => {
        mount({
            type: "hero",
            contractVersion: 2,
            content: {
                variant: "fullBleed",
                heading: "Bread, the slow way",
                imageBrief: "Loaves on the counter at dawn",
            },
        });
        expect(host.textContent).toContain(
            "Photo wanted: Loaves on the counter at dawn",
        );
    });
});
