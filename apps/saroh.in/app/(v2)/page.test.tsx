// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";
import { fakeCatalog } from "@/lib/pricing.fixture";

import HomePage, { metadata } from "./page";

const read = vi.hoisted(() => ({
    catalog: null as ReturnType<typeof fakeCatalog> | null,
}));

// No API in a unit test: each case says which catalogue the page reads.
vi.mock("@/lib/pricing", () => ({
    readLivePricing: () => Promise.resolve(read.catalog),
}));

function section(container: HTMLElement, id: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`no #${id}`);
    return el;
}

/** A currency sign (written as an escape: no sign in the repo). */
const RUPEE = new RegExp("\\u20B9");

afterEach(() => {
    cleanup();
    read.catalog = null;
});

describe("/ (Home)", () => {
    it("reads the headline whole and has the anchors other pages link to", async () => {
        const { container } = render(await HomePage());
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Services, Appointments, Retail, Orders. Handled.",
            }),
        ).toBeTruthy();
        for (const id of ["features", "solutions", "pricing", "faq"]) {
            expect(container.querySelector(`#${id}`)).not.toBeNull();
        }
        expect(metadata.alternates?.canonical).toBe("/");
    });

    it("lists the eight features, Dashboard first, and the three solutions", async () => {
        const { container } = render(await HomePage());
        const features = container.querySelector("#features");
        const hrefs = Array.from(features?.querySelectorAll("a") ?? []).map(
            (a) => a.getAttribute("href"),
        );
        expect(hrefs).toEqual(FEATURE_SLUGS.map((s) => `/features/${s}`));
        expect(hrefs[0]).toBe("/features/dashboard");
        const solutions = container.querySelector("#solutions");
        expect(
            Array.from(solutions?.querySelectorAll("a") ?? []).map((a) =>
                a.getAttribute("href"),
            ),
        ).toEqual(SOLUTION_SLUGS.map((s) => `/solutions/${s}`));
        const worksFor = screen.getByRole("navigation", { name: "Works for" });
        expect(within(worksFor).getAllByRole("link")).toHaveLength(3);
    });

    it("no tour video: no 'See it in action' and no #video", async () => {
        const { container } = render(await HomePage());
        expect(container.textContent).not.toContain("See it in action");
        expect(container.querySelector("#video")).toBeNull();
    });

    it("without a catalogue: placeholders, no price and no footnote", async () => {
        const { container } = render(await HomePage());
        const pricing = container.querySelector<HTMLElement>("#pricing");
        expect(pricing?.querySelectorAll("[data-plan]")).toHaveLength(3);
        expect(pricing?.textContent).not.toMatch(/\d/);
        expect(pricing?.textContent).not.toContain("Billed monthly");
        expect(container.textContent).not.toMatch(RUPEE);
    });

    it("with a catalogue: its names and prices, the footnote and the worded answer", async () => {
        read.catalog = fakeCatalog();
        const { container } = render(await HomePage());
        const pricing = within(section(container, "pricing"));
        for (const name of ["Plan A", "Plan B", "Plan C"]) {
            expect(pricing.getByRole("heading", { name })).toBeTruthy();
        }
        expect(
            pricing.getByText("Billed monthly. Prices before GST."),
        ).toBeTruthy();
        expect(
            container.querySelector("[data-plan='grow']")?.textContent,
        ).toMatch(RUPEE);
        const faq = within(section(container, "faq"));
        expect(faq.getByText(/^The Plan A plan is/)).toBeTruthy();
    });
});
