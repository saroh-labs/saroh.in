import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { developerTemplate, instantiateTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SectionRenderer from "./section-renderer";

/**
 * The Developer template (industry templates U9) drawn as the live site
 * draws it. One page, in the design's order: the name and the owner's line,
 * the intro, Work as a list, one case study, the rates, availability, and a
 * form. Every block is static, so there is no feed to give it; the form is
 * given the Form id the API adds when it makes the site.
 */

const ctx: TemplateContext = {
    organizationName: "Sample Engineer",
    tagline: "Backend and infrastructure, working independently.",
};

function renderHome() {
    const [page] = instantiateTemplate(developerTemplate, ctx).pages;
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
            "One in detail",
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
            "One in detail",
            "The problem",
            "What I would do differently",
            "What changed",
            "What I charge",
            "Day rate",
            "Retainer",
            "Availability",
            "Not looking for",
            "Work with Sample Engineer",
        ].map((word) => at(container, word));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("lists the work one engagement per row, the facts on their own line", () => {
        const { container } = renderHome();
        const work = container.querySelectorAll("article");
        expect(work).toHaveLength(3);
        expect(work[0].textContent).toContain("Year · your role · the stack");
        // No photo and no link were laid down, so neither is drawn.
        expect(container.querySelectorAll("img")).toHaveLength(0);
        expect(within(container).queryByText("View project")).toBeNull();
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
