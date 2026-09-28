// @vitest-environment jsdom
/**
 * The Plans block in the inspector (round 2 G9): a title, the highlight, the
 * button's words and descriptions on or off. Which plans, and their prices,
 * are never a field.
 *
 * `react-dom/client` + `act` directly, as `journal.test.tsx` does.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOUND_BLOCKS, boundHref } from "@/components/sites/block-kinds";
import { emptySection } from "@/components/sites/empty-section";
import type { PlansContent, Section } from "@/lib/sites/service";

import { PlansFields } from "./plans";

let root: Root;
let host: HTMLDivElement;

type PlansSectionValue = Extract<Section, { type: "plans" }>;

function render(content: PlansContent) {
    const onChange = vi.fn<(next: Section) => void>();
    const section: PlansSectionValue = {
        key: "sec_plans",
        type: "plans",
        contractVersion: 1,
        content,
    };
    act(() => {
        root.render(
            <PlansFields
                section={section}
                pages={[]}
                services={{ status: "loading" }}
                onChange={onChange}
            />,
        );
    });
    return onChange;
}

function lastContent(onChange: ReturnType<typeof render>): PlansContent {
    const next = onChange.mock.calls.at(-1)?.[0];
    if (next?.type !== "plans") throw new Error("No plans change");
    return next.content;
}

function byText(selector: string, text: string): HTMLElement {
    const found = Array.from(host.querySelectorAll<HTMLElement>(selector)).find(
        (el) => el.textContent.trim() === text,
    );
    if (!found) throw new Error(`No "${text}"`);
    return found;
}

/** One answer of a labelled choice ("Descriptions" › "Hide"). */
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

describe("the Plans block's fields (G9)", () => {
    it("highlights the first plan and shows descriptions until told otherwise", () => {
        render({ title: "Plans" });
        expect(
            choice("Highlight", "First plan").getAttribute("aria-pressed"),
        ).toBe("true");
        expect(
            choice("Descriptions", "Show").getAttribute("aria-pressed"),
        ).toBe("true");
        expect(choice("Prices", "Show").getAttribute("aria-pressed")).toBe(
            "true",
        );
        expect(choice("Show as", "Cards").getAttribute("aria-pressed")).toBe(
            "true",
        );
    });

    it("keeps no highlight when chosen, and stores the first as the default", () => {
        const onChange = render({ title: "Plans" });
        click(byText("button", "None"));
        expect(lastContent(onChange)).toEqual({
            title: "Plans",
            highlight: "none",
        });

        const back = render({ highlight: "none" });
        click(byText("button", "First plan"));
        expect(lastContent(back)).toEqual({ highlight: undefined });
    });

    it("writes the button's words, and clears them to the default", () => {
        const onChange = render({ buttonLabel: "Ask" });
        const inputs = host.querySelectorAll<HTMLInputElement>("input");
        const button = inputs[1];
        expect(button.placeholder).toBe("Ask about joining");
        type(button, "Join us");
        expect(lastContent(onChange)).toEqual({ buttonLabel: "Join us" });
        type(button, "");
        expect(lastContent(onChange)).toEqual({ buttonLabel: undefined });
    });

    it("turns descriptions off, and back on as the default", () => {
        const onChange = render({});
        click(choice("Descriptions", "Hide"));
        expect(lastContent(onChange)).toEqual({ showDescriptions: false });

        const back = render({ showDescriptions: false });
        click(choice("Descriptions", "Show"));
        expect(lastContent(back)).toEqual({ showDescriptions: undefined });
    });

    it("lists plans one per row without prices (G16), and back as the default", () => {
        const onChange = render({});
        click(choice("Show as", "List"));
        expect(lastContent(onChange)).toEqual({ layout: "list" });
        click(choice("Prices", "Hide"));
        expect(lastContent(onChange)).toEqual({ showPrices: false });

        const back = render({ layout: "list", showPrices: false });
        click(choice("Show as", "Cards"));
        expect(lastContent(back)).toEqual({
            layout: undefined,
            showPrices: false,
        });
    });

    it("never offers a plan, a price or a way to pay as a field", () => {
        render({});
        expect(choice("Highlight", "None")).toBeTruthy();
        expect(host.textContent).toContain("Descriptions");
        // Prices can be hidden, never typed: no field holds one.
        expect(host.querySelectorAll("input")).toHaveLength(2);
        expect(host.textContent).not.toMatch(/choose (a|which) plan/i);
        expect(host.textContent).not.toMatch(/upi|autopay/i);
    });
});

describe("the Plans block in the editor (G9)", () => {
    it("says where plans live and links there", () => {
        const bound = BOUND_BLOCKS.plans;
        expect(bound?.notice).toContain("Payments › Subscriptions › Plans");
        expect(bound && boundHref(bound, "site_1")).toBe(
            "/billing/subscriptions?tab=plans",
        );
    });

    it("starts with a title and nothing else to choose", () => {
        const section = emptySection("plans");
        expect(section.type).toBe("plans");
        expect(section.content).toEqual({ title: "Plans" });
    });
});
