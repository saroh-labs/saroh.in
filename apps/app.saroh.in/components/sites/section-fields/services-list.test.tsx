// @vitest-environment jsdom
/**
 * The services list's display options in the inspector (round 2 G16): Show
 * as, Descriptions, Prices and each service's button, as the Site Editor
 * design draws a bound list. Which services, and their prices, stay the
 * business's: nothing here types one.
 *
 * `react-dom/client` + `act` directly, as `plans.test.tsx` does.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section, ServicesListContent } from "@/lib/sites/service";

import { ServicesListFields } from "./services-list";

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
    }: {
        children: React.ReactNode;
        href: string;
    }) => <a href={href}>{children}</a>,
}));

let root: Root;
let host: HTMLDivElement;

type ServicesListSection = Extract<Section, { type: "servicesList" }>;

function render(content: Partial<ServicesListContent>) {
    const onChange = vi.fn<(next: Section) => void>();
    const section: ServicesListSection = {
        key: "sec_services",
        type: "servicesList",
        contractVersion: 1,
        content: { serviceIds: ["svc_cut"], ...content },
    };
    act(() => {
        root.render(
            <ServicesListFields
                section={section}
                pages={[]}
                services={{
                    status: "ready",
                    services: [
                        { id: "svc_cut", name: "Cut", status: "ACTIVE" },
                    ],
                }}
                onChange={onChange}
            />,
        );
    });
    return onChange;
}

function lastContent(onChange: ReturnType<typeof render>): ServicesListContent {
    const next = onChange.mock.calls.at(-1)?.[0];
    if (next?.type !== "servicesList") throw new Error("No change");
    return next.content;
}

/** One answer of a labelled choice ("Prices" › "Hide"). */
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

describe("the services list's display options (G16)", () => {
    it("reads an untouched section as the list it has always been", () => {
        render({});
        expect(choice("Show as", "List").getAttribute("aria-pressed")).toBe(
            "true",
        );
        for (const label of ["Descriptions", "Prices"]) {
            expect(choice(label, "Show").getAttribute("aria-pressed")).toBe(
                "true",
            );
        }
        // A service has no photo to show or hide.
        expect(host.textContent).not.toContain("Photos");
    });

    it("switches Services to a list without prices, storing the list as absent", () => {
        const onChange = render({ layout: "cards" });
        click(choice("Show as", "List"));
        expect(lastContent(onChange)).toEqual({
            serviceIds: ["svc_cut"],
            layout: undefined,
        });

        const prices = render({});
        click(choice("Prices", "Hide"));
        expect(lastContent(prices)).toEqual({
            serviceIds: ["svc_cut"],
            showPrices: false,
        });
    });

    it("shows services as cards without descriptions", () => {
        const onChange = render({});
        click(choice("Show as", "Cards"));
        expect(lastContent(onChange).layout).toBe("cards");
        click(choice("Descriptions", "Hide"));
        expect(lastContent(onChange).showDescriptions).toBe(false);
    });

    it("writes each service's button, and empty keeps its own Book", () => {
        const buttonField = () => {
            const found = Array.from(host.querySelectorAll("input")).find(
                (i) => i.placeholder === "Choose a time",
            );
            if (!found) throw new Error("No button field");
            return found;
        };
        const onChange = render({});
        type(buttonField(), "Choose a time");
        expect(lastContent(onChange).buttonLabel).toBe("Choose a time");

        const cleared = render({ buttonLabel: "Reserve" });
        type(buttonField(), "");
        expect(lastContent(cleared).buttonLabel).toBeUndefined();
        expect(host.textContent).toContain("keep each service's own “Book”");
    });

    it("keeps the section's own button below the list", () => {
        render({});
        expect(host.textContent).toContain("Button below the list");
    });
});
