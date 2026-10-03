// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";

import HomePage, { metadata } from "./page";

/** A currency sign (written as an escape: no sign in the repo). */
const RUPEE = new RegExp("\\u20B9");

afterEach(cleanup);

describe("/ (Home)", () => {
    it("reads the headline whole and has the anchors other pages link to", () => {
        const { container } = render(HomePage());
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Services, Appointments, Retail, Orders. Handled.",
            }),
        ).toBeTruthy();
        for (const id of ["features", "solutions", "faq"]) {
            expect(container.querySelector(`#${id}`)).not.toBeNull();
        }
        expect(metadata.alternates?.canonical).toBe("/");
    });

    it("lists the eight features, Dashboard first, and the three solutions", () => {
        const { container } = render(HomePage());
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

    it("no tour video: no 'See it in action' and no #video", () => {
        const { container } = render(HomePage());
        expect(container.textContent).not.toContain("See it in action");
        expect(container.querySelector("#video")).toBeNull();
    });

    it("names no plan, price or limit: no #pricing and no plan cards", () => {
        const { container } = render(HomePage());
        expect(container.querySelector("#pricing")).toBeNull();
        expect(container.querySelectorAll("[data-plan]")).toHaveLength(0);
        expect(container.textContent).not.toMatch(RUPEE);
        expect(container.textContent).not.toContain("Compare every plan");
        expect(
            Array.from(container.querySelectorAll("a")).map((a) =>
                a.getAttribute("href"),
            ),
        ).not.toContain("/pricing");
    });

    it("the free-plan line under the hero is the neutral one", () => {
        render(HomePage());
        expect(
            screen.getByText("Free to start. Move up when you need more."),
        ).toBeTruthy();
    });
});
