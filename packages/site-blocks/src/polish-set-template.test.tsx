import { toRendered } from "@saroh/block-contract";
import type { TemplateContext, TemplateManifest } from "@saroh/templates";
import {
    BAKERY_PICKUP_WORDS,
    bakeryTemplate,
    blogsTemplate,
    ceramicsTemplate,
    instantiateTemplate,
    studioTemplate,
} from "@saroh/templates";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "./section-renderer";

/**
 * The polish set's version 2 (site templates plan U9), drawn by the real
 * blocks: the first section a phone sees answers the trade's first
 * question and carries at most ONE main action.
 */

function firstScreen(t: TemplateManifest, ctx: TemplateContext) {
    const home = instantiateTemplate(t, ctx).pages[0];
    const resolvePage = () => undefined;
    const hero = home.sections[0];
    const sections = [
        {
            type: hero.type,
            content: toRendered(hero.type, hero.content, { resolvePage }),
        },
    ];
    return render(
        <PageSections
            sections={sections}
            siteId="site-polish"
            apiUrl="https://api.example"
        />,
    );
}

const selling = (name: string): TemplateContext => ({
    organizationName: name,
    modules: ["WEBSITE", "COMMERCE"],
});

/** The section's main buttons: links drawn as the site's primary button. */
function primaryLinks(container: HTMLElement) {
    return Array.from(container.querySelectorAll("a")).filter((a) =>
        a.className.includes("bg-site-accent"),
    );
}

beforeEach(() => {
    // No live read answers: the cached page is what is tested.
    vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("{}", { status: 404 }))),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the polish set's first phone screen (U9)", () => {
    it("bakery: when to order and where to collect, and one Order for pickup", () => {
        const { container } = firstScreen(bakeryTemplate, selling("Rye & Co."));
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Bread worth the walk",
        );
        expect(container.textContent).toContain(BAKERY_PICKUP_WORDS.orderBy);
        expect(container.textContent).toContain(BAKERY_PICKUP_WORDS.where);
        const main = primaryLinks(container);
        expect(main).toHaveLength(1);
        expect(main[0]).toHaveAttribute("href", "/order");
        expect(within(main[0]).getAllByText(/Order/).length).toBeGreaterThan(0);
    });

    it("ceramics: who makes the work, and one Shop the collection", () => {
        const { container } = firstScreen(ceramicsTemplate, selling("Kiln"));
        expect(container.textContent).toContain("Your name");
        const main = primaryLinks(container);
        expect(main).toHaveLength(1);
        expect(main[0]).toHaveAttribute("href", "/#collection");
    });

    it("studio: what it makes and for whom, and one Start a project", () => {
        const { container } = firstScreen(studioTemplate, {
            organizationName: "Studio Neue",
            description: "Identity and print for Mumbai's small brands",
        });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Identity and print for Mumbai's small brands",
        );
        const main = primaryLinks(container);
        expect(main).toHaveLength(1);
        expect(main[0]).toHaveAttribute("href", "/#contact");
    });

    it("blogs: the writer's line, and nothing to sell", () => {
        const { container } = firstScreen(blogsTemplate, {
            organizationName: "Meera Shah",
            tagline: "Meera Shah writes about design practice.",
        });
        expect(container.textContent).toContain(
            "Meera Shah writes about design practice.",
        );
        expect(primaryLinks(container)).toHaveLength(0);
    });
});
