import type { RenderedProjects } from "@saroh/block-contract";
import { blockFixture } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSections } from "../section-renderer";
import ProjectsSection from "./projects";

/**
 * K11 — the Projects block: the merchant's own work, as they typed it.
 *
 * What a visitor meets is asserted here rather than left to the snapshot:
 * each photo says what it shows, each link says which project it opens, a
 * project with no photo leaves no hole, and a link that is not safe to
 * follow is never drawn.
 */

const fixture = (look: "cards" | "list") =>
    blockFixture("projects", look) as RenderedProjects;

describe("the Projects block", () => {
    it.each(["cards", "list"] as const)(
        "%s: each photo carries its description",
        (look) => {
            render(<ProjectsSection content={fixture(look)} />);
            const photos = screen.getAllByRole("img");
            expect(photos.map((img) => img.getAttribute("alt"))).toEqual([
                "The new booking page for a physiotherapy clinic, on a laptop",
                "The cover of a printed menu, in terracotta",
            ]);
        },
    );

    it.each(["cards", "list"] as const)(
        "%s: each link is named for its project",
        (look) => {
            render(<ProjectsSection content={fixture(look)} />);
            const links = screen.getAllByRole("link");
            expect(links.map((a) => a.textContent)).toEqual([
                "View project: A booking site for a physio clinic→",
                "View project: Writing: how I price a small job→",
            ]);
        },
    );

    it("opens another site in the same tab, without handing it this page", () => {
        render(<ProjectsSection content={fixture("cards")} />);
        const [external, internal] = screen.getAllByRole("link");
        expect(external.getAttribute("href")).toBe(
            "https://example.com/physio-clinic",
        );
        expect(external.getAttribute("rel")).toBe("noopener");
        expect(external.getAttribute("target")).toBeNull();
        expect(internal.getAttribute("href")).toBe("/blog/pricing-a-small-job");
        expect(internal.getAttribute("rel")).toBeNull();
    });

    it("draws a project with no photo without a gap where one would be", () => {
        render(<ProjectsSection content={fixture("cards")} />);
        const cards = screen.getAllByRole("article");
        const bare = cards[2];
        expect(within(bare).queryByRole("img")).toBeNull();
        // The words start at the card's top padding, not under a hole.
        expect(bare.className).toContain("pt-4");
        expect(cards[0].className).not.toContain("pt-4");
    });

    it("gives a list row a photo column only when it has a photo", () => {
        render(<ProjectsSection content={fixture("list")} />);
        const rows = screen.getAllByRole("article");
        expect(rows[0].className).toContain("grid-template-columns");
        expect(rows[2].className).not.toContain("grid-template-columns");
    });

    it("draws no link for a project that has none", () => {
        render(<ProjectsSection content={fixture("cards")} />);
        const second = screen.getAllByRole("article")[1];
        expect(within(second).queryByRole("link")).toBeNull();
    });

    it("never draws a link that is not safe to follow", () => {
        const scheme = ["java", "script:"].join("");
        render(
            <ProjectsSection
                content={{
                    items: [{ title: "Menus", link: `${scheme}alert(1)` }],
                }}
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("heading", { name: "Menus" })).toBeTruthy();
    });

    it("draws nothing when there is no project to show", () => {
        const { container } = render(
            <ProjectsSection content={{ title: "Work", items: [] }} />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("is drawn by the page's renderer, with its own padding", () => {
        const { container } = render(
            <PageSections
                sections={[
                    {
                        type: "projects",
                        content: { ...fixture("list"), padding: 40 },
                    },
                ]}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Selected work" }),
        ).toBeTruthy();
        expect(container.innerHTML).toContain("--site-section-padding: 40px");
    });
});
