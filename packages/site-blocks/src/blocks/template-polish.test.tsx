import type { RenderedFeatures, RenderedProjects } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    SAMPLE_PLANS,
    SAMPLE_PRODUCTS,
    SAMPLE_VISIT,
} from "../block-fixture-preview";
import FeaturesSection from "./features";
import HoursSection, { groupedHoursRows, hoursRows } from "./hours";
import PlansSection from "./plans";
import ProductGridSection, { availabilityLine } from "./product-grid";
import ProjectsSection from "./projects";
import { rhythmGroups } from "./projects-rhythm";
import { linkText, projectsCount } from "./projects-rows";
import RichTextSection from "./rich-text";

/**
 * The block extensions of the template polish. Every one is absent by
 * default and the G5 snapshots hold the default looks; these test what each
 * draws when it is set, that states are said in words, and that a block with
 * nothing to show renders nothing.
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("features: figures, two columns, a note, the facts row", () => {
    it("draws the facts row as label and figure pairs", () => {
        const { container } = render(
            <FeaturesSection content={BLOCK_META.features.fixtures.facts} />,
        );
        const list = container.querySelector("dl");
        expect(list).not.toBeNull();
        const terms = within(list as HTMLElement)
            .getAllByRole("term")
            .map((t) => t.textContent);
        expect(terms).toEqual([
            "In practice",
            "First consultation",
            "Consultations in",
        ]);
        expect(screen.getByText("14 years").tagName).toBe("DD");
    });

    it("sets each point's figure, two columns and the note", () => {
        const { container } = render(
            <FeaturesSection content={BLOCK_META.features.cases.values} />,
        );
        expect(screen.getByText("Your day rate")).toBeTruthy();
        expect(container.querySelector("ul")?.className).toContain(
            "sm:grid-cols-2",
        );
        expect(screen.getByText(/Scoping weeks are paid/).className).toContain(
            "text-site-muted",
        );
    });

    it("leaves the list in one column, and draws no note, by default", () => {
        const { container } = render(
            <FeaturesSection content={BLOCK_META.features.fixtures.list} />,
        );
        expect(container.querySelector("ul")?.className).not.toContain(
            "sm:grid-cols-2",
        );
        expect(container.querySelectorAll("section > p").length).toBe(1);
    });

    it("renders nothing for a facts row with no titled points", () => {
        const content: RenderedFeatures = {
            variant: "facts",
            items: [{ title: " " }],
        };
        const { container } = render(<FeaturesSection content={content} />);
        expect(container.innerHTML).toBe("");
    });
});

describe("richText: left-aligned, photo above, part labels, a callout", () => {
    it("sits the left look on the page's width, not the centred column", () => {
        const { container } = render(
            <RichTextSection content={BLOCK_META.richText.fixtures.left} />,
        );
        expect(container.querySelector("section")?.className).toContain(
            "max-w-screen-xl",
        );
        const centred = render(
            <RichTextSection content={BLOCK_META.richText.fixtures.default} />,
        );
        expect(centred.container.querySelector("section")?.className).toContain(
            "max-w-screen-md",
        );
    });

    it("puts the photo above the text at 16:9, labels the parts, boxes the result", () => {
        const { container } = render(
            <RichTextSection content={BLOCK_META.richText.cases.caseStudy} />,
        );
        const photo = screen.getByAltText("The dispatch board as shipped");
        expect(photo.className).toContain("aspect-video");
        // The photo comes before the words in reading order.
        const heading = screen.getByRole("heading", {
            name: /Taking a warehouse/,
        });
        expect(
            photo.compareDocumentPosition(heading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(container.querySelector(".prose")?.className).toContain(
            "prose-h3:uppercase",
        );
        const box = screen.getByRole("complementary", { name: "What changed" });
        expect(box.className).toContain("border-site-accent");
        expect(box.textContent).toContain("no day of downtime");
    });

    it("draws no box and no labels by default", () => {
        const { container } = render(
            <RichTextSection content={BLOCK_META.richText.fixtures.default} />,
        );
        expect(container.querySelector("aside")).toBeNull();
        expect(container.querySelector(".prose")?.className).not.toContain(
            "prose-h3:uppercase",
        );
    });
});

describe("hours: grouped days and the address", () => {
    // Tuesday 6 Oct 2026, 10:00 in London.
    const TUESDAY = new Date("2026-10-06T09:00:00.000Z");

    it("joins days in a row with the same hours, and names the range", () => {
        const rows = hoursRows(SAMPLE_VISIT.hours, true) ?? [];
        expect(groupedHoursRows(rows).map((l) => [l.label, l.hours])).toEqual([
            ["Monday to Friday", "7:30am – 5pm"],
            ["Saturday", "8am – 12pm"],
            ["Sunday", null],
        ]);
    });

    it("never joins days across one left out between them", () => {
        const rows = hoursRows(
            [
                { day: "MON", open: "09:00", close: "17:00", closed: false },
                { day: "TUE", open: "09:00", close: "17:00", closed: true },
                { day: "WED", open: "09:00", close: "17:00", closed: false },
                { day: "THU", open: "09:00", close: "17:00", closed: false },
            ],
            false,
        );
        expect(groupedHoursRows(rows ?? []).map((l) => l.label)).toEqual([
            "Monday",
            "Wednesday and Thursday",
        ]);
    });

    it("draws the grouped week with today marked on its line, and the address", () => {
        render(
            <HoursSection
                content={BLOCK_META.hours.cases.grouped}
                visit={SAMPLE_VISIT}
                now={TUESDAY}
            />,
        );
        const today = screen.getByRole("rowheader", {
            name: /Monday to Friday/,
        });
        expect(today.textContent).toContain("Today");
        expect(screen.getByText("Sunday")).toBeTruthy();
        expect(screen.getAllByText("Closed").length).toBe(1);
        expect(screen.getByText(/Riverside Trade Park/).tagName).toBe(
            "ADDRESS",
        );
    });

    it("keeps one row a day and no address by default", () => {
        const { container } = render(
            <HoursSection
                content={BLOCK_META.hours.fixtures.default}
                visit={SAMPLE_VISIT}
                now={TUESDAY}
            />,
        );
        expect(container.querySelectorAll("tbody tr").length).toBe(7);
        expect(container.querySelector("address")).toBeNull();
    });
});

describe("plans: a line under the title", () => {
    it("draws the merchant's line over the plans on sale", () => {
        render(
            <PlansSection
                content={BLOCK_META.plans.cases.intro}
                feed={{ plans: SAMPLE_PLANS, joinHref: "/contact" }}
            />,
        );
        expect(screen.getByText(/No joining fee/)).toBeTruthy();
    });

    it("draws nothing at all with no plan on sale, line or not", () => {
        const { container } = render(
            <PlansSection
                content={BLOCK_META.plans.cases.intro}
                feed={{ plans: [], joinHref: "/contact" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("productGrid: what is left, a note and bare cards", () => {
    it("counts what is left from the products shown, in words", () => {
        const free = { soldOut: false };
        const gone = { soldOut: true };
        expect(availabilityLine([free, gone, free])).toBe("2 of 3 available");
        expect(availabilityLine([free, free])).toBe("All 2 available");
        expect(availabilityLine([gone, gone])).toBe("All sold out");
        expect(availabilityLine([gone])).toBe("Sold out");
        expect(availabilityLine([])).toBeNull();
    });

    it("draws bare cards: tall photos, sold out on the corner, the count and the note", () => {
        const { container } = render(
            <ProductGridSection
                content={BLOCK_META.productGrid.cases.bare}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const shown = SAMPLE_PRODUCTS.slice(0, 4);
        expect(
            container.querySelector("[data-availability]")?.textContent,
        ).toBe(availabilityLine(shown));
        expect(container.querySelector(".aspect-\\[4\\/5\\]")).not.toBeNull();
        // No bordered card around a product.
        expect(container.querySelector("li a")?.className).not.toContain(
            "border",
        );
        const soldOut = shown.filter((p) => p.soldOut).length;
        expect(screen.queryAllByText("Sold out").length).toBe(soldOut);
        expect(screen.getByText(/Baked this morning/)).toBeTruthy();
    });

    it("keeps the card, and no count or note, by default", () => {
        const { container } = render(
            <ProductGridSection
                content={BLOCK_META.productGrid.fixtures.default}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        expect(container.querySelector("[data-availability]")).toBeNull();
        expect(container.querySelector("li a")?.className).toContain("border");
    });

    it("renders nothing with no products, count or not", () => {
        const { container } = render(
            <ProductGridSection
                content={BLOCK_META.productGrid.cases.bare}
                feed={{ products: [], basePath: "/shop" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("projects: rhythm and rows, a count", () => {
    const named = (title: string) => ({ title });

    it("lays the rhythm out as a lead, a pair, an offset, and on", () => {
        const items = ["a", "b", "c", "d", "e", "f", "g", "h"].map(named);
        const { lead, groups } = rhythmGroups(items);
        expect(lead?.title).toBe("a");
        expect(groups.map((g) => g.kind)).toEqual([
            "pair",
            "offset",
            "pair",
            "single",
        ]);
    });

    it("draws the rhythm's lead wide, then a pair, then a portrait beside a landscape", () => {
        const { container } = render(
            <ProjectsSection content={BLOCK_META.projects.fixtures.rhythm} />,
        );
        const frames = Array.from(
            container.querySelectorAll(
                "article > a > div:first-child, article > div:first-child",
            ),
        ).map((el) => el.className);
        expect(frames[0]).toContain("aspect-[21/9]");
        expect(frames[1]).toContain("aspect-[4/3]");
        expect(frames[2]).toContain("aspect-[4/3]");
        expect(frames[3]).toContain("aspect-[3/4]");
        expect(frames[4]).toContain("aspect-video");
        // Words over the photo sit on a band of a fixed height.
        const bands = container.querySelectorAll("[data-plate-band]");
        expect(bands.length).toBe(5);
        expect(bands[0]?.className).toContain("h-[82px]");
    });

    it("draws rows as year | the work | role, with the count beside the title", () => {
        const { container } = render(
            <ProjectsSection content={BLOCK_META.projects.fixtures.rows} />,
        );
        expect(container.querySelector("img")).toBeNull();
        const rows = container.querySelectorAll("ol > li");
        expect(rows.length).toBe(3);
        expect(rows[0]?.textContent).toContain("2026");
        expect(rows[0]?.textContent).toContain("Sole engineer");
        expect(rows[0]?.textContent).toContain("Go · Postgres · React");
        // A web link shows its host, and names the project for a screen reader.
        expect(
            screen.getByRole("link", {
                name: /example\.com.*A dispatch board/,
            }),
        ).toBeTruthy();
        expect(
            container.querySelector("[data-project-count]")?.textContent,
        ).toBe("3 projects across 8 years");
    });

    it("counts projects, and the span of their years when there is one", () => {
        expect(projectsCount([named("a")])).toBe("One project");
        expect(
            projectsCount([
                { title: "a", year: "2024" },
                { title: "b", year: "2024" },
            ]),
        ).toBe("2 projects");
        expect(
            projectsCount([
                { title: "a", year: "2026" },
                { title: "b", year: "2019–2022" },
            ]),
        ).toBe("2 projects across 8 years");
        expect(linkText("/work/one", "View project")).toBe("View project");
    });

    it("renders nothing with no titled project, whatever the look", () => {
        const content: RenderedProjects = {
            variant: "rhythm",
            items: [{ title: "  " }],
        };
        const { container } = render(<ProjectsSection content={content} />);
        expect(container.innerHTML).toBe("");
    });
});
