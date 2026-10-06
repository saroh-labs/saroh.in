import type { RenderedHours, RenderedTimetable } from "@saroh/block-contract";
import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { gymTemplate, instantiateTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    SAMPLE_PACKS,
    SAMPLE_PLANS,
    SAMPLE_TIMETABLE,
    SAMPLE_VISIT,
} from "./block-fixture-preview";
import HoursSection from "./blocks/hours";
import TimetableSection from "./blocks/timetable";
import type { PublicTimetable } from "./lib/timetable-read";
import SectionRenderer from "./section-renderer";

/**
 * The Gym template (industry templates U6), drawn by the real blocks with
 * sample feeds, as the live site draws it with the business's own: the
 * timetable is the top of Home, sessions say Full and Fills fast in words,
 * prices come only from the plans and packs on sale, and the coaches are
 * placeholders, never people.
 */

const everythingOn: TemplateContext = {
    organizationName: "Iron & Oak",
    modules: ["WEBSITE", "APPOINTMENTS", "PAYMENTS", "CLASS_PACKS"],
};

const EMPTY_WEEK: PublicTimetable = {
    timezone: "UTC",
    days: SAMPLE_TIMETABLE.days,
    sessions: [],
};

/** Draw a page as the live site does, with the feeds the server read. */
function renderPage(
    path: string,
    ctx: TemplateContext = everythingOn,
    week: PublicTimetable = SAMPLE_TIMETABLE,
) {
    const page = instantiateTemplate(gymTemplate, ctx).pages.find(
        (p) => p.path === path,
    );
    if (!page) throw new Error(`No page at ${path}`);
    const resolvePage = () => undefined;
    return render(
        <main>
            {page.sections.map((section) => {
                const content = toRendered(section.type, section.content, {
                    resolvePage,
                });
                // The two blocks that read their own feed are handed it.
                if (section.type === "timetable") {
                    return (
                        <TimetableSection
                            key={section.order}
                            content={content as RenderedTimetable}
                            timetable={week}
                            bookHref="/book"
                        />
                    );
                }
                if (section.type === "hours") {
                    return (
                        <HoursSection
                            key={section.order}
                            content={content as RenderedHours}
                            visit={SAMPLE_VISIT}
                        />
                    );
                }
                return (
                    <SectionRenderer
                        key={section.order}
                        siteId="site-gym"
                        plans={{
                            plans: SAMPLE_PLANS,
                            joinHref: "/contact#enquiry",
                        }}
                        packs={{
                            packs: SAMPLE_PACKS,
                            payOnline: false,
                            askHref: "/contact#enquiry",
                        }}
                        section={{ type: section.type, content }}
                    />
                );
            })}
        </main>,
    );
}

function headings(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("h1, h2")).map((h) =>
        h.textContent.trim(),
    );
}

describe("the gym template, rendered live", () => {
    it("Home: the name, then the week, then what it costs, the first visit and the hours", () => {
        const { container } = renderPage("/");
        expect(headings(container)).toEqual([
            "Iron & Oak",
            "This week",
            "What it costs",
            "Class packs",
            "Your first visit",
            "Where and when",
        ]);
        // One h1, the name; the timetable is the first thing after it.
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        const page = within(container);
        expect(
            page.getByText(/Book from your phone on the way in\./),
        ).toBeVisible();
        // The sessions are the business's own, and fullness is in words.
        expect(page.getAllByText("Strength").length).toBeGreaterThan(0);
        expect(page.getAllByText("Full").length).toBeGreaterThan(0);
        expect(page.getAllByText(/Fills fast · 2 left/).length).toBeGreaterThan(
            0,
        );
        // Prices come from the plans and packs on sale, not the template.
        expect(container.textContent).toContain(SAMPLE_PLANS[0]?.name);
        expect(container.textContent).toContain(SAMPLE_PACKS[0]?.name);
        // The first visit's three steps, in the design's order.
        const text = container.textContent;
        const order = [
            "Arrive ten minutes early",
            "Bring indoor shoes and a towel",
            "Tell the coach what hurts",
        ].map((t) => text.indexOf(t));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // No member quote and no photograph on Home.
        expect(container.querySelectorAll("blockquote, img")).toHaveLength(0);
    });

    it("Home with no class this week: the timetable says nothing, never an empty grid", () => {
        const { container } = renderPage("/", everythingOn, EMPTY_WEEK);
        expect(headings(container)).not.toContain("This week");
        expect(headings(container)[0]).toBe("Iron & Oak");
        expect(container.textContent).not.toMatch(/no classes/i);
    });

    it("Timetable: the same week, day by day, and the hours", () => {
        const { container } = renderPage("/timetable");
        const h = headings(container);
        expect(h.slice(0, 2)).toEqual(["Timetable", "Day by day"]);
        expect(h.at(-1)).toBe("Opening hours");
        expect(within(container).getAllByText("Full").length).toBeGreaterThan(
            0,
        );
    });

    it("Membership: the plans and packs on sale, then the first visit", () => {
        const { container } = renderPage("/membership");
        expect(headings(container)).toEqual([
            "Membership",
            "Memberships",
            "Class packs",
            "Your first visit",
        ]);
    });

    it("Trainers: placeholders that say what to write, with no photo", () => {
        const { container } = renderPage("/trainers");
        expect(headings(container)).toEqual([
            "Who is coaching",
            "Your first coach",
            "Another coach",
        ]);
        expect(container.textContent).toContain("A placeholder.");
        // A photo brief is a note to the owner, never drawn for a visitor.
        expect(container.textContent).not.toContain("loaded bar");
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("with no module on, Home is the name, the first visit and the hours", () => {
        const { container } = renderPage("/", {
            organizationName: "Iron & Oak",
        });
        expect(headings(container)).toEqual([
            "Iron & Oak",
            "Your first visit",
            "Where and when",
        ]);
    });
});
