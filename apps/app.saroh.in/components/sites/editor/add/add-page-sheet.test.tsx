// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddPageSheet, PAGE_TYPES, shorterLink } from "./add-page-sheet";
import { formLine } from "./suggestions";
import { dropAfter, dropWords } from "./use-canvas-drop";

const createPage = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    createPage: (...a: unknown[]) => createPage(...a) as unknown,
    duplicatePage: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    createPage.mockResolvedValue({ ok: true, data: { id: "pg", title: "T" } });
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

const text = () => document.body.textContent;
async function type(input: HTMLInputElement | null, value: string) {
    if (!input) throw new Error("No input");
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
    });
}

async function open(start: "blank" | "TEAM", taken: string[] = []) {
    await act(async () => {
        root.render(
            <AddPageSheet
                open
                siteId="site_1"
                address="sample.saroh.app"
                offers={[]}
                page={undefined}
                start={start}
                takenPaths={taken}
                onClose={vi.fn()}
                onAdded={vi.fn()}
            />,
        );
        await Promise.resolve();
    });
}

describe("Add a page: link said as typed (A8)", () => {
    it("says nobody else uses the link, and offers Shorten", async () => {
        await open("blank", ["/about"]);
        const name = document.querySelector<HTMLInputElement>(
            "input:not([aria-label])",
        );
        await type(name, "Bridal trials");
        expect(text()).toContain(
            "Nobody else uses it. Shorten makes it /trials.",
        );
        const shorten = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Shorten",
        );
        act(() => shorten?.click());
        expect(
            document.querySelector<HTMLInputElement>(
                'input[aria-label="Page link"]',
            )?.value,
        ).toBe("/trials");
    });

    it("says when another page uses it", async () => {
        await open("blank", ["/about"]);
        const name = document.querySelector<HTMLInputElement>(
            "input:not([aria-label])",
        );
        await type(name, "About");
        expect(text()).toContain("Another page uses /about.");
    });
});

describe("Add a page: new page types (A7)", () => {
    it("Our team says what it starts with, and sends its type", async () => {
        await open("TEAM");
        expect(text()).toContain("Starts with, filled from your business");
        for (const line of PAGE_TYPES.TEAM.starts)
            expect(text()).toContain(line);
        const name = document.querySelector<HTMLInputElement>(
            "input:not([aria-label])",
        );
        await type(name, "Our team");
        await act(async () => {
            document.querySelector("form")?.requestSubmit();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(createPage).toHaveBeenCalledWith("site_1", {
            title: "Our team",
            path: "/our-team",
            inMenu: true,
            starter: "TEAM",
        });
    });
});

describe("Add a page: start tiles (A7)", () => {
    it("four ways to start; A template page shows its three pages", async () => {
        await open("blank");
        const radios = () =>
            Array.from(document.querySelectorAll("[role=radio]")).map(
                (r) => r.textContent,
            );
        expect(radios().some((t) => t.startsWith("Blank"))).toBe(true);
        const template = Array.from(
            document.querySelectorAll<HTMLButtonElement>("[role=radio]"),
        ).find((r) => r.textContent.startsWith("A template page"));
        await act(async () => {
            template?.click();
            await Promise.resolve();
        });
        expect(
            document.querySelector('[aria-label="Template pages"]')
                ?.textContent,
        ).toContain("Service detail");
        expect(text()).toContain("Starts with, filled from your business");
    });
});

describe("pure helpers", () => {
    it("shorterLink keeps the last word", () => {
        expect(shorterLink("/bridal-trials")).toBe("/trials");
        expect(shorterLink("/about")).toBeNull();
    });
    it("dropAfter finds the section a drop goes below (A4)", () => {
        expect(dropAfter([100, 300, 500], 50)).toBe(0);
        expect(dropAfter([100, 300, 500], 350)).toBe(1);
        expect(dropAfter([100, 300, 500], 900)).toBe(2);
        expect(dropWords("Prices", "Reviews")).toBe(
            "Drops between Prices and Reviews",
        );
        expect(dropWords("Prices", null)).toBe(
            "Drops at the end, below Prices",
        );
    });
    it("formLine names the first form and how many more (A9)", () => {
        expect(formLine({ count: 1, first: "Enquiry" })).toBe("Enquiry");
        expect(formLine({ count: 3, first: "Enquiry" })).toBe(
            "Enquiry, 2 more",
        );
    });
});
