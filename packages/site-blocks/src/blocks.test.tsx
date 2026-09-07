import type {
    RenderedBooking,
    RenderedCtaSection,
    RenderedEnquiry,
    RenderedFeatures,
    RenderedGallery,
    RenderedHero,
    RenderedRichText,
} from "@saroh/block-contract";
import { BLOCK_META, blockFixture } from "@saroh/block-contract";
import { act, render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import BookingSection from "./blocks/booking";
import CtaSection from "./blocks/cta";
import EnquirySection from "./blocks/enquiry";
import FeaturesSection from "./blocks/features";
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
    /*
     * The booking block asks for availability on mount now that its fixture
     * names a Service. Stubbed rather than left to hit the network: a snapshot
     * suite that depends on an API being up is a suite that fails for reasons
     * that have nothing to do with the markup.
     *
     * It resolves to no slots, which is the state the catalog shows too — the
     * fixture's Service id belongs to no Service.
     */
    const realFetch = globalThis.fetch;
    beforeAll(() => {
        globalThis.fetch = vi.fn(() =>
            Promise.resolve(
                // A BARE ARRAY: that is what the availability endpoint
                // returns. The first version of this stub sent
                // `{ slots: [] }` and the component crashed with "slots is not
                // iterable" — see #264, which is that crash, not this stub.
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            ),
        );
    });
    afterAll(() => {
        globalThis.fetch = realFetch;
    });

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

    // `blockFixture` narrows the literal-keyed fixture map, so a look id
    // coming from an array does not need a cast at every call site.
    // One per look: what changes between them is the arrangement, not the
    // content, so a snapshot each is what proves the variant does anything.
    it.each(["grid", "carousel", "masonry"])("gallery/%s", (look) => {
        const { container } = render(
            <GallerySection
                content={blockFixture("gallery", look) as RenderedGallery}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    /*
     * The #254 guarantee that matters most: a gallery@1 section carries
     * `layout` and no `variant`, and must keep the look it was published with.
     * Defaulting it to `grid` would silently restyle every published carousel.
     */
    it("renders a gallery@1 section on its old `layout` field", () => {
        const legacy = {
            layout: "carousel",
            images: [...BLOCK_META.gallery.fixtures.grid.images],
        };
        const { container } = render(
            <GallerySection content={legacy as unknown as RenderedGallery} />,
        );
        expect(container.innerHTML).toContain("snap-x");
    });

    /*
     * And the hero equivalent: a hero with an image and no variant was
     * two-column before #254 and must stay so. `centered` is hero's FIRST
     * declared variant, so a naive default would have flipped every published
     * hero carrying an image.
     */
    it("renders a variant-less hero with an image as split", () => {
        const legacy = {
            heading: "Fresh bread",
            image: { src: "data:image/svg+xml;utf8,%3Csvg/%3E", alt: "" },
        };
        const { container } = render(
            <HeroSection content={legacy as unknown as RenderedHero} />,
        );
        expect(container.innerHTML).toContain("lg:grid-cols-2");
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

    it.each(["grid", "list"])("features/%s", (look) => {
        const { container } = render(
            <FeaturesSection
                content={blockFixture("features", look) as RenderedFeatures}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    /*
     * The two looks must actually differ. A variant system whose variants draw
     * the same markup is a field nobody needs — and the catalog would be
     * showing two pictures of one thing.
     */
    it("draws the two features looks differently", () => {
        const grid = render(
            <FeaturesSection
                content={blockFixture("features", "grid") as RenderedFeatures}
            />,
        ).container.innerHTML;
        const list = render(
            <FeaturesSection
                content={blockFixture("features", "list") as RenderedFeatures}
            />,
        ).container.innerHTML;
        expect(grid).toContain("lg:grid-cols-3");
        expect(list).not.toContain("lg:grid-cols-3");
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
