import type {
    RenderedBooking,
    RenderedContact,
    RenderedCtaSection,
    RenderedEnquiry,
    RenderedFaq,
    RenderedFeatures,
    RenderedGallery,
    RenderedHero,
    RenderedJournal,
    RenderedPlans,
    RenderedProductGrid,
    RenderedRichText,
    RenderedServicesList,
    RenderedTestimonials,
    RenderedVisitUs,
} from "@saroh/block-contract";

import BookingSection from "./blocks/booking";
import ContactSection from "./blocks/contact";
import CtaSection from "./blocks/cta";
import EnquirySection from "./blocks/enquiry";
import FaqSection from "./blocks/faq";
import FeaturesSection from "./blocks/features";
import GallerySection from "./blocks/gallery";
import HeroSection from "./blocks/hero";
import type { JournalFeed } from "./blocks/journal";
import JournalSection from "./blocks/journal";
import type { PlansFeed } from "./blocks/plans";
import PlansSection from "./blocks/plans";
import type { ProductGridFeed } from "./blocks/product-grid";
import ProductGridSection from "./blocks/product-grid";
import RichTextSection from "./blocks/rich-text";
import ServicesListSection from "./blocks/services-list";
import TestimonialsSection from "./blocks/testimonials";
import VisitUsSection from "./blocks/visit-us";

/**
 * One section of a published page, as the snapshot carries it.
 *
 * `content` is `unknown` because it arrives as JSON. It is narrowed per `type`
 * at the point of use — see the note on {@link SectionRenderer}.
 */
export interface Section {
    type: string;
    content: unknown;
}

/**
 * Maps a publication {@link Section} to its presentational component by
 * `section.type`.
 *
 * A section's `content` arrives from the public snapshot API as `unknown`
 * (it is JSON), so we narrow it per `type` at the point of use before handing
 * it to the typed section component. The content itself is trusted, controlled
 * data: it was validated against the v1 section contract AND (for `richText`)
 * sanitized server-side at publish, so this renderer never handles raw author
 * input — see the safety note in `components/sections/rich-text.tsx`.
 *
 * Forward-compatibility: an unknown/unsupported `type` renders `null` rather
 * than throwing, so a snapshot published against a newer contract (with a
 * section type this build does not know) degrades gracefully instead of
 * crashing the whole page.
 */
export default function SectionRenderer({
    section,
    apiUrl,
    bookHref,
    siteId,
    journal,
    plans,
    productGrid,
}: {
    section: Section;
    /**
     * Base URL of the public API, for the blocks that talk to it. Optional:
     * each defaults to production, which is what the app-level env fallback did
     * before these components moved into a package (#252).
     */
    apiUrl?: string;
    /** The site's booking page (U19); live sites only. */
    bookHref?: string;
    /**
     * The site being shown, for the blocks that read its business's live
     * data by site (Visit us, G8; the hero's On today, G18). Undefined where no site is live — the
     * editor's canvas — and those blocks then say what they will show.
     */
    siteId?: string | null;
    /**
     * The site's latest posts, read by the page that serves it (G10), for the
     * Journal block. Undefined on the editor's canvas, where the block reads
     * them itself and says so when there are none.
     */
    journal?: JournalFeed;
    /**
     * The business's plans on sale, read by the page that serves the site
     * (G9), for the Plans block. Undefined on the editor's canvas, where the
     * block reads them itself and says why when there are none.
     */
    plans?: PlansFeed;
    /**
     * This section's products, read by the page that serves the site (G12),
     * for a Product grid. Undefined on the editor's canvas, where the block
     * reads them itself and says why when there are none.
     */
    productGrid?: ProductGridFeed;
}) {
    switch (section.type) {
        case "hero":
            return (
                <HeroSection
                    content={section.content as RenderedHero}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                    siteId={siteId}
                />
            );
        case "richText":
            return (
                <RichTextSection
                    content={section.content as RenderedRichText}
                />
            );
        case "cta":
            return (
                <CtaSection content={section.content as RenderedCtaSection} />
            );
        case "gallery":
            return (
                <GallerySection content={section.content as RenderedGallery} />
            );
        case "enquiry":
            return (
                <EnquirySection
                    content={section.content as RenderedEnquiry}
                    apiUrl={apiUrl}
                />
            );
        case "features":
            return (
                <FeaturesSection
                    content={section.content as RenderedFeatures}
                />
            );
        case "faq":
            return <FaqSection content={section.content as RenderedFaq} />;
        case "testimonials":
            return (
                <TestimonialsSection
                    content={section.content as RenderedTestimonials}
                />
            );
        case "servicesList":
            return (
                <ServicesListSection
                    content={section.content as RenderedServicesList}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                />
            );
        case "contact":
            return (
                <ContactSection content={section.content as RenderedContact} />
            );
        case "visitUs":
            return (
                <VisitUsSection
                    content={section.content as RenderedVisitUs}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "journal":
            return (
                <JournalSection
                    content={section.content as RenderedJournal}
                    feed={journal}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "plans":
            return (
                <PlansSection
                    content={section.content as RenderedPlans}
                    feed={plans}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "productGrid":
            return (
                <ProductGridSection
                    content={section.content as RenderedProductGrid}
                    feed={productGrid}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "booking":
            return (
                <BookingSection
                    content={section.content as RenderedBooking}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                />
            );
        default:
            // Unknown section type (e.g. from a newer contract version) —
            // render nothing rather than crash.
            return null;
    }
}

/**
 * A section's own padding override, if it set one (#189).
 *
 * Read defensively: `content` is JSON from a snapshot, so the field may be
 * absent, of the wrong type, or from an older contract that had no such thing.
 * The contract bounds it to 24–96px on the way in; re-clamping here means a
 * value that predates those bounds cannot produce a section a page-length tall.
 */
function paddingOverride(content: unknown): React.CSSProperties | undefined {
    if (content === null || typeof content !== "object") return undefined;
    const value = (content as { padding?: unknown }).padding;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const px = Math.min(96, Math.max(24, Math.round(value)));
    // Set one level down from the site variable, so a section that overrides
    // padding does so for its own subtree and hands the setting back after.
    return { "--site-section-padding": `${px}px` } as React.CSSProperties;
}

/**
 * Render an ordered list of sections. Snapshot sections are already in display
 * order, so we key by index (positions are stable within an immutable
 * snapshot).
 *
 * The wrapper exists to carry a per-section padding override. It used to be
 * absent, so a merchant could set a section's padding in the editor, watch the
 * preview honour it, publish, and see the live site ignore it.
 */
export function PageSections({
    sections,
    apiUrl,
    bookHref,
    siteId,
    journal,
    plans,
    productGrids,
}: {
    sections: Section[];
    /** Passed through to the blocks that talk to the public API. */
    apiUrl?: string;
    /** The site's booking page (U19), linked from services; live sites only. */
    bookHref?: string;
    /** The live site's id, for the blocks that read by site (G8). */
    siteId?: string | null;
    /** The site's latest posts, for the Journal block (G10). */
    journal?: JournalFeed;
    /** The business's plans on sale, for the Plans block (G9). */
    plans?: PlansFeed;
    /**
     * Each Product grid's products (G12), by the section's index in
     * `sections`: every grid asks for its own.
     */
    productGrids?: readonly (ProductGridFeed | undefined)[];
}) {
    return (
        <>
            {sections.map((section, i) => {
                const style = paddingOverride(section.content);
                const rendered = (
                    <SectionRenderer
                        section={section}
                        apiUrl={apiUrl}
                        bookHref={bookHref}
                        siteId={siteId}
                        journal={journal}
                        plans={plans}
                        productGrid={productGrids?.[i]}
                    />
                );
                return style === undefined ? (
                    <div key={i}>{rendered}</div>
                ) : (
                    <div key={i} style={style}>
                        {rendered}
                    </div>
                );
            })}
        </>
    );
}
