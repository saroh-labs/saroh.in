import { toRendered } from "@saroh/block-contract";
import type { TemplateContext, TemplateManifest } from "@saroh/templates";
import {
    developerTemplateV1 as developerTemplate,
    developerTemplate as developerTemplateV2,
    instantiateTemplate,
} from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SectionRenderer from "./section-renderer";

/**
 * The Developer template (industry templates U9) drawn as the live site
 * draws it. One page, in the design's order: the name and the owner's line,
 * the intro, Work as hairline rows, one case study, the rates, availability,
 * and a form. Every block is static, so there is no feed to give it; the form is
 * given the Form id the API adds when it makes the site.
 */

const ctx: TemplateContext = {
    organizationName: "Sample Engineer",
    tagline: "Backend and infrastructure, working independently.",
};

function renderHome(
    template: TemplateManifest = developerTemplate,
    path = "/",
) {
    const page = instantiateTemplate(template, ctx).pages.find(
        (p) => p.path === path,
    );
    if (!page) throw new Error(`No page at ${path}`);
    const resolvePage = () => undefined;
    return render(
        <>
            {page.sections.map((section) => (
                <SectionRenderer
                    key={section.order}
                    siteId="site-developer"
                    section={{
                        type: section.type,
                        content: toRendered(
                            section.type,
                            // The API gives the enquiry its Form when it
                            // makes the site (`site-create.ts`); without one
                            // the block draws nothing.
                            section.type === "enquiry"
                                ? {
                                      ...(section.content as object),
                                      formId: "form-developer",
                                  }
                                : section.content,
                            { resolvePage },
                        ),
                    }}
                />
            ))}
        </>,
    );
}

/** Where `needle` first appears in the page's text; -1 if nowhere. */
function at(container: HTMLElement, needle: string): number {
    return container.textContent.indexOf(needle);
}

describe("the Developer template, rendered live", () => {
    it("draws the design's sections in its order", () => {
        const { container } = renderHome();
        const page = within(container);
        expect(
            page.getByRole("heading", { level: 1, name: "Sample Engineer" }),
        ).toBeVisible();
        expect(
            page.getByText(
                "Backend and infrastructure, working independently.",
            ),
        ).toBeVisible();
        for (const name of [
            "Work",
            /^Your case study — /,
            "What I charge",
            "Availability",
        ]) {
            expect(page.getByRole("heading", { name })).toBeVisible();
        }

        const order = [
            "Sample Engineer",
            "Based",
            "Work",
            "Your most recent engagement",
            "Your case study",
            "The problem",
            "What I would do differently",
            "What changed",
            "What I charge",
            "Day rate",
            "Retainer",
            "Placeholders: replace each",
            "Availability",
            "Your next opening",
            "Not looking for",
            "Work with Sample Engineer",
        ].map((word) => at(container, word));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("lists the work one engagement per row: year, the work and its stack, role", () => {
        const { container } = renderHome();
        const page = within(container);
        // The count beside the title is the block's, from the rows.
        expect(page.getByText("3 projects")).toBeVisible();
        const work = page
            .getByRole("heading", { level: 2, name: "Work" })
            .closest("section");
        if (!work) throw new Error("No work section");
        const rows = within(work).getAllByRole("listitem");
        expect(rows).toHaveLength(3);
        for (const text of [
            "Year",
            "Your most recent engagement",
            "The stack · one word each",
            "Your role",
        ]) {
            expect(rows[0].textContent).toContain(text);
        }
        // No photo and no link were laid down, so neither is drawn.
        expect(container.querySelectorAll("img")).toHaveLength(0);
        expect(within(container).queryByText("View project")).toBeNull();
    });

    it("sets the case study's parts as labels and what changed in a box", () => {
        const { container } = renderHome();
        const result = within(container).getByRole("complementary", {
            name: "What changed",
        });
        expect(result.textContent).toMatch(/A placeholder\./);
        const free = within(container).getByRole("complementary", {
            name: /^Your next opening/,
        });
        expect(free.textContent).toContain("Not looking for");
    });

    it("shows no figure and no brief to a visitor", () => {
        const { container } = renderHome();
        expect(container.textContent).not.toMatch(/₹|\d{2,}|lakh/);
        // The case study's picture brief is the owner's note, not page text.
        expect(container.textContent).not.toMatch(/as shipped/);
    });

    it("ends with the form, asking what is being built", () => {
        const { container } = renderHome();
        const page = within(container);
        expect(
            page.getByLabelText(/What are you building/),
        ).toBeInTheDocument();
        expect(page.getByLabelText(/Email/)).toBeInTheDocument();
    });
});

describe("developer@2, rendered live (U10)", () => {
    it("opens on Work with me, the one main action, then when the owner is free", () => {
        const { container } = renderHome(developerTemplateV2);
        const first = container.querySelectorAll("section")[0];
        const main = within(first)
            .getAllByRole("link")
            .filter((a) => a.textContent.includes("Work with me"));
        expect(main.map((a) => a.getAttribute("href"))).toEqual(["/#hire"]);
        const titles = Array.from(container.querySelectorAll("h1, h2")).map(
            (h) => h.textContent,
        );
        expect(titles.slice(0, 2)).toEqual(["Sample Engineer", "Availability"]);
        // The enquiry Work with me lands on (`#hire`, drawn by the page).
        expect(container.querySelector("form")).not.toBeNull();
    });

    it("tells the case study on its own page, its parts as labels", () => {
        const { container } = renderHome(developerTemplateV2, "/case-study");
        expect(
            within(container).getByRole("heading", {
                level: 1,
                name: "Case study",
            }),
        ).toBeTruthy();
        expect(within(container).getByText("The problem")).toBeTruthy();
        expect(
            within(container)
                .getAllByRole("link", { name: /Work with me/ })
                .map((a) => a.getAttribute("href")),
        ).toContain("/#hire");
    });
});
