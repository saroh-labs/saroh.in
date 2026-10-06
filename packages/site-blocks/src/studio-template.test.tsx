import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { instantiateTemplate, studioTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSections } from "./section-renderer";

/**
 * The studio template (the gallery's "Portfolio", U10) on a live site, drawn
 * with the real blocks.
 *
 * The design's first question is "is this studio any good": the work is the
 * top of the page, under nothing but the name, and the studio introduces
 * itself second. Everything here is the owner's to write over; the
 * photographs are briefs, never drawn for a visitor.
 */

const full: TemplateContext = {
    organizationName: "Sample Studio",
    tagline: "Identity, packaging and signage.",
    contactEmail: "hello@studio.example",
    modules: ["WEBSITE", "CRM"],
};

function renderHome(ctx: TemplateContext) {
    const page = instantiateTemplate(studioTemplate, ctx).pages[0];
    const resolvePage = () => undefined;
    // The API gives every enquiry its Form when it makes the site
    // (`site-create.ts`); a section without one draws nothing.
    const sections = page.sections.map((s) => ({
        type: s.type,
        content: toRendered(
            s.type,
            s.type === "enquiry"
                ? { ...(s.content as object), formId: "form-studio" }
                : s.content,
            { resolvePage },
        ),
    }));
    return render(<PageSections sections={sections} siteId="site-studio" />);
}

function headings(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("h1, h2")).map(
        (h) => `${h.tagName} ${h.textContent.trim()}`,
    );
}

describe("the studio template, rendered live", () => {
    it("opens on the name and goes straight to the work, then the studio and the brief", () => {
        const { container } = renderHome(full);
        expect(headings(container)).toEqual([
            "H1 Sample Studio",
            "H2 Work",
            "H2 Studio",
            "H2 If you have something that needs drawing, describe it badly.",
        ]);
        expect(
            container.querySelector("h1")?.nextElementSibling?.textContent,
        ).toBe("Identity, packaging and signage.");
    });

    it("draws the five projects in the design's order, as placeholders, with no photo or link", () => {
        const { container } = renderHome(full);
        const work = within(container)
            .getByRole("heading", { level: 2, name: "Work" })
            .closest("section");
        if (!work) throw new Error("No work section");
        const projects = within(work).getAllByRole("article");
        expect(
            projects.map(
                (p) => within(p).getByRole("heading", { level: 3 }).textContent,
            ),
        ).toEqual([
            "Your lead project",
            "Your second project",
            "Your third project",
            "Your fourth project",
            "Your fifth project",
        ]);
        expect(within(work).getAllByText(/^A placeholder\./)).toHaveLength(5);
        expect(within(work).queryByRole("link")).toBeNull();
        // The briefs are notes to the owner, never drawn for a visitor.
        expect(container.textContent).not.toMatch(
            /concrete surface|van livery|foot rings/,
        );
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("introduces the studio second, with its three facts", () => {
        const { container } = renderHome(full);
        const page = within(container);
        expect(page.getByText(/Who:/)).toBeTruthy();
        expect(page.getByText(/Since:/)).toBeTruthy();
        expect(page.getByText(/^This is a placeholder for who/)).toBeTruthy();
    });

    it("takes the brief in a form, with the business's own email beside it", () => {
        const { container } = renderHome(full);
        const page = within(container);
        expect(page.getByLabelText(/What needs drawing\?/)).toBeTruthy();
        expect(page.getByRole("button", { name: "Send" })).toBeTruthy();
        const email = page.getByRole("link", { name: "hello@studio.example" });
        expect(email.getAttribute("href")).toBe("mailto:hello@studio.example");
    });

    it("without an email, the form stands alone and nothing else claims a way in", () => {
        const { container } = renderHome({ organizationName: "Sample Maker" });
        expect(headings(container)).toEqual([
            "H1 Sample Maker",
            "H2 Work",
            "H2 Studio",
            "H2 If you have something that needs drawing, describe it badly.",
        ]);
        expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
        expect(container.textContent).not.toMatch(/worked with|clients/i);
        expect(container.textContent).not.toMatch(/₹|\d{3,}/);
    });
});
