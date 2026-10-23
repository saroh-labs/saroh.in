// @vitest-environment jsdom
/**
 * The Journal block in the inspector (round 2 G10): a title, three or six,
 * and photos and excerpts on or off. Which posts is never a field.
 *
 * `react-dom/client` + `act` directly, as `text-photo.test.tsx` does.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JournalContent, Section } from "@/lib/sites/service";

import { JournalFields } from "./journal";

let root: Root;
let host: HTMLDivElement;

type JournalSection = Extract<Section, { type: "journal" }>;

function render(content: JournalContent) {
    const onChange = vi.fn<(next: Section) => void>();
    const section: JournalSection = {
        key: "sec_journal",
        type: "journal",
        contractVersion: 1,
        content,
    };
    act(() => {
        root.render(
            <JournalFields
                section={section}
                pages={[]}
                services={{ status: "loading" }}
                onChange={onChange}
            />,
        );
    });
    return onChange;
}

/** What the last change wrote into the section's content. */
function lastContent(onChange: ReturnType<typeof render>): JournalContent {
    const next = onChange.mock.calls.at(-1)?.[0];
    if (next?.type !== "journal") throw new Error("No journal change");
    return next.content;
}

function byText(selector: string, text: string): HTMLElement {
    const found = Array.from(host.querySelectorAll<HTMLElement>(selector)).find(
        (el) => el.textContent.trim() === text,
    );
    if (!found) throw new Error(`No "${text}"`);
    return found;
}

function one<T extends HTMLElement>(selector: string): T {
    const found = host.querySelector<T>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
}

/** One answer of a labelled choice ("Photos" › "Hide"). */
function choice(label: string, answer: string): HTMLElement {
    const group = Array.from(
        host.querySelectorAll<HTMLElement>('[role="group"]'),
    ).find((g) => g.firstElementChild?.textContent.trim() === label);
    if (!group) throw new Error(`No "${label}" choice`);
    const found = Array.from(group.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === answer,
    );
    if (!found) throw new Error(`No "${answer}" in "${label}"`);
    return found;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function type(input: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    );
    act(() => {
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
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

describe("the Journal's fields", () => {
    it("shows the latest three until told otherwise, photos and excerpts on", () => {
        render({ title: "Journal" });
        expect(byText("button", "Latest 3").getAttribute("data-state")).toBe(
            "on",
        );
        for (const label of ["Photos", "Descriptions"]) {
            expect(choice(label, "Show").getAttribute("aria-pressed")).toBe(
                "true",
            );
        }
        expect(choice("Show as", "Cards").getAttribute("aria-pressed")).toBe(
            "true",
        );
    });

    it("keeps six when chosen, and stores three as the default", () => {
        const onChange = render({ title: "Journal" });
        click(byText("button", "Latest 6"));
        expect(lastContent(onChange)).toEqual({ title: "Journal", count: 6 });

        const back = render({ title: "Journal", count: 6 });
        click(byText("button", "Latest 3"));
        expect(lastContent(back)).toEqual({
            title: "Journal",
            count: undefined,
        });
    });

    it("turns photos and excerpts off, and back on as the default", () => {
        const onChange = render({});
        click(choice("Photos", "Hide"));
        expect(lastContent(onChange)).toEqual({ showImages: false });

        const excerpts = render({ showExcerpts: false });
        expect(
            choice("Descriptions", "Hide").getAttribute("aria-pressed"),
        ).toBe("true");
        click(choice("Descriptions", "Show"));
        expect(lastContent(excerpts)).toEqual({ showExcerpts: undefined });
    });

    it("lists posts one per row with the merchant's button (G16)", () => {
        const onChange = render({});
        click(choice("Show as", "List"));
        expect(lastContent(onChange)).toEqual({ layout: "list" });

        const words = render({ layout: "list" });
        const button = host.querySelectorAll<HTMLInputElement>("input")[1];
        expect(button.placeholder).toBe("Read");
        type(button, "Read more");
        expect(lastContent(words)).toEqual({
            layout: "list",
            buttonLabel: "Read more",
        });
        type(button, "  ");
        expect(lastContent(words)).toEqual({
            layout: "list",
            buttonLabel: undefined,
        });
    });

    it("writes the title, and clears it to the default when emptied", () => {
        const onChange = render({ title: "Journal" });
        const input = one<HTMLInputElement>("input");
        type(input, "From the kitchen");
        expect(lastContent(onChange)).toEqual({ title: "From the kitchen" });
        type(input, "");
        expect(lastContent(onChange)).toEqual({ title: undefined });
    });

    it("names every control", () => {
        render({});
        expect(host.querySelector('[aria-label="Posts shown"]')).toBeTruthy();
        expect(host.textContent).toContain("Photos");
        expect(host.textContent).toContain("Descriptions");
        expect(host.textContent).not.toMatch(/choose (a|which) post/i);
    });
});
