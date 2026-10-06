import type { RenderedFeatures } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FeaturesSection from "./features";
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
