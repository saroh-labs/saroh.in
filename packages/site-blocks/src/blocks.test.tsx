import type {
    RenderedBooking,
    RenderedCtaSection,
    RenderedEnquiry,
    RenderedGallery,
    RenderedHero,
    RenderedRichText,
} from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BookingSection from "./blocks/booking";
import CtaSection from "./blocks/cta";
import EnquirySection from "./blocks/enquiry";
import GallerySection from "./blocks/gallery";
import HeroSection from "./blocks/hero";
import RichTextSection from "./blocks/rich-text";

/**
 * Gate G5 (#252) — what these blocks draw must not change.
 *
 * They moved out of `apps/saroh.app/components/sections/` into this package,
 * and that path serves every published merchant site. A publication is
 * immutable: a site published last year renders through this code today, so a
 * change here is a change to pages their owners can no longer edit.
 *
 * The move itself was verbatim — `git mv`, then import lines only — so the diff
 * is its own proof. These snapshots are what protects the property AFTERWARDS,
 * when the next person edits a block for a good reason and does not realise
 * they moved a heading. A snapshot changing is not a failure; a snapshot
 * changing without anyone noticing is.
 *
 * Fixtures come from `@saroh/block-contract` — the same ones the catalog
 * previews and CI parses against each block's schema. One example, three jobs.
 */
describe("block rendering", () => {
    it("hero/centered", () => {
        const { container } = render(
            <HeroSection
                content={BLOCK_META.hero.fixtures.centered as RenderedHero}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("hero/split", () => {
        const { container } = render(
            <HeroSection
                content={BLOCK_META.hero.fixtures.split as RenderedHero}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("richText", () => {
        const { container } = render(
            <RichTextSection
                content={
                    BLOCK_META.richText.fixtures.default as RenderedRichText
                }
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("cta", () => {
        const { container } = render(
            <CtaSection
                content={BLOCK_META.cta.fixtures.default as RenderedCtaSection}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("gallery", () => {
        const { container } = render(
            <GallerySection
                content={BLOCK_META.gallery.fixtures.default as RenderedGallery}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("enquiry", () => {
        const { container } = render(
            <EnquirySection
                content={BLOCK_META.enquiry.fixtures.default as RenderedEnquiry}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Async because the slot loader settles in an effect even with no
    // `serviceId` — it resolves straight to "ready, no slots" rather than
    // fetching, but it still lands after mount.
    it("booking", async () => {
        const { container } = render(
            <BookingSection
                content={BLOCK_META.booking.fixtures.default as RenderedBooking}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(container.innerHTML).toMatchSnapshot();
    });

    /**
     * The forward-compatibility property, asserted rather than assumed: a
     * snapshot published against a newer contract, carrying a section type this
     * build has never heard of, degrades to nothing instead of crashing the
     * whole page.
     */
    it("renders nothing for an unknown block type", async () => {
        const { SectionRenderer } = await import("./index");
        const { container } = render(
            <SectionRenderer
                section={{ type: "notAThing", content: { heading: "x" } }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});
