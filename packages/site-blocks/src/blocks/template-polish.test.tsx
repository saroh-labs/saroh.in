import type { RenderedFeatures } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_VISIT } from "../block-fixture-preview";
import FeaturesSection from "./features";
import HoursSection, { groupedHoursRows, hoursRows } from "./hours";
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
