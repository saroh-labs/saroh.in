// @vitest-environment jsdom
/**
 * The Class packs block in the inspector (round 2 G20): a title, the
 * button's words and descriptions on or off. Which packs, and their prices,
 * are never a field.
 *
 * `react-dom/client` + `act` directly, as `plans.test.tsx` does.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOUND_BLOCKS, boundHref } from "@/components/sites/block-kinds";
import { emptySection } from "@/components/sites/empty-section";
import type { PacksContent, Section } from "@/lib/sites/service";

import { PacksFields } from "./packs";

let root: Root;
let host: HTMLDivElement;

type PacksSectionValue = Extract<Section, { type: "packs" }>;

function render(content: PacksContent) {
    const onChange = vi.fn<(next: Section) => void>();
    const section: PacksSectionValue = {
        key: "sec_packs",
        type: "packs",
        contractVersion: 1,
        content,
    };
    act(() => {
        root.render(
            <PacksFields
                section={section}
                pages={[]}
                services={{ status: "loading" }}
                onChange={onChange}
            />,
        );
    });
    return onChange;
}

function lastContent(onChange: ReturnType<typeof render>): PacksContent {
    const next = onChange.mock.calls.at(-1)?.[0];
    if (next?.type !== "packs") throw new Error("No packs change");
    return next.content;
}

function one<T extends HTMLElement>(selector: string): T {
    const found = host.querySelector<T>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
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

describe("the Class packs block's fields (G20)", () => {
    it("writes the title and the button's words, and clears them to the default", () => {
        const onChange = render({ buttonLabel: "Get it" });
        const inputs = host.querySelectorAll<HTMLInputElement>("input");
        const title = inputs[0];
        const button = inputs[1];
        expect(title.placeholder).toBe("Class packs");
        expect(button.placeholder).toBe("Buy");
        type(button, "Get this pack");
        expect(lastContent(onChange)).toEqual({ buttonLabel: "Get this pack" });
        type(button, "");
        expect(lastContent(onChange)).toEqual({ buttonLabel: undefined });
    });

    it("turns descriptions off, and back on as the default", () => {
        const onChange = render({});
        act(() => {
            one("#sec_packs-descriptions").dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });
        expect(lastContent(onChange)).toEqual({ showDescriptions: false });
    });

    it("never offers a pack, a price or a way to pay as a field", () => {
        render({});
        expect(host.textContent).toContain("Descriptions");
        expect(host.textContent).not.toMatch(/choose (a|which) pack/i);
        expect(host.textContent).not.toMatch(/upi|card|autopay/i);
    });
});

describe("the Class packs block in the editor (G20)", () => {
    it("says where packs live and links there", () => {
        const bound = BOUND_BLOCKS.packs;
        expect(bound?.notice).toContain("Class packs");
        expect(bound && boundHref(bound, "site_1")).toBe("/class-packs");
    });

    it("starts with a title and nothing else to choose", () => {
        const section = emptySection("packs");
        expect(section.type).toBe("packs");
        expect(section.content).toEqual({ title: "Class packs" });
    });
});
