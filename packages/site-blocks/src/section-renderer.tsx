import type {
    RenderedBooking,
    RenderedContact,
    RenderedCtaSection,
    RenderedEnquiry,
    RenderedFaq,
    RenderedFeatures,
    RenderedGallery,
    RenderedHero,
    RenderedHours,
    RenderedJournal,
    RenderedPacks,
    RenderedPerson,
    RenderedPlans,
    RenderedProductGrid,
    RenderedProjects,
    RenderedRichText,
    RenderedServicesList,
    RenderedTestimonials,
    RenderedTimetable,
    RenderedVisitUs,
} from "@saroh/block-contract";
import { resolveVariant, sectionFrameOf } from "@saroh/block-contract";

import BookingSection from "./blocks/booking";
import ContactSection from "./blocks/contact";
import CtaSection from "./blocks/cta";
import type { EnquiryThread } from "./blocks/enquiry";
import EnquirySection from "./blocks/enquiry";
import FaqSection from "./blocks/faq";
import FeaturesSection from "./blocks/features";
import GallerySection from "./blocks/gallery";
import HeroSection from "./blocks/hero";
import HoursSection from "./blocks/hours";
import type { JournalFeed } from "./blocks/journal";
import JournalSection from "./blocks/journal";
import type { PacksFeed } from "./blocks/packs";
import PacksSection from "./blocks/packs";
import PersonSection from "./blocks/person";
import type { PlansFeed } from "./blocks/plans";
import PlansSection from "./blocks/plans";
import type { ProductGridFeed } from "./blocks/product-grid";
import ProductGridSection from "./blocks/product-grid";
import ProjectsSection from "./blocks/projects";
import RichTextSection from "./blocks/rich-text";
import ServicesListSection from "./blocks/services-list";
import TestimonialsSection from "./blocks/testimonials";
import TimetableSection from "./blocks/timetable";
import VisitUsSection from "./blocks/visit-us";
import type { ModulePageTopContent } from "./module-page-top";
import { ModulePageTop } from "./module-page-top";
import type { PricesActions } from "./prices/api";
import type { SiteFixtures } from "./site-fixtures";

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
    packs,
    prices,
    thread,
    productGrid,
    fixtures,
    modulePage = false,
}: {
    section: Section;
    /**
     * The business's live data, given (`site-fixtures.ts`): the blocks that
     * read it in the browser draw these instead and fetch nothing. Only the
     * renderer's template renders pass it.
     */
    fixtures?: SiteFixtures;
    /**
     * The section is on a module page (DEC-073 #9): a rich-text intro lines
     * up with the cards rather than sitting in the centred reading column.
     */
    modulePage?: boolean;
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
     * The business's class packs on sale, read by the page that serves the
     * site (G20), for the Class packs block. Undefined on the editor's
     * canvas, where the block reads them itself.
     */
    packs?: PacksFeed;
    /**
     * Join and Buy's actions (G20), handed in by the live site when the
     * account area is on. Absent: Plans and Class packs offer "Ask about…".
     */
    prices?: PricesActions | null;
    /**
     * A signed-in customer's thread (A13), handed in by the live site while
     * the account area is on: the Contact page's form writes to it.
     */
    thread?: EnquiryThread | null;
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
                    visit={fixtures?.visit}
                    today={fixtures?.today}
                />
            );
        case "richText":
            return (
                <RichTextSection
                    content={section.content as RenderedRichText}
                    align={modulePage ? "cards" : "column"}
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
                    thread={thread}
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
                    services={fixtures?.services}
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
                    visit={fixtures?.visit}
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
                    prices={prices}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "packs":
            return (
                <PacksSection
                    content={section.content as RenderedPacks}
                    feed={packs}
                    prices={prices}
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
        case "projects":
            return (
                <ProjectsSection
                    content={section.content as RenderedProjects}
                />
            );
        case "timetable":
            return (
                <TimetableSection
                    content={section.content as RenderedTimetable}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    bookHref={bookHref}
                    timetable={fixtures?.timetable}
                />
            );
        case "hours":
            return (
                <HoursSection
                    content={section.content as RenderedHours}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    visit={fixtures?.visit}
                />
            );
        case "person":
            return (
                <PersonSection content={section.content as RenderedPerson} />
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
 * Whether a section is a full-bleed hero (U2), which the site header lies
 * over when it opens the page. `PageSections` marks the first section's
 * wrapper with `data-site-first-hero`, and the header's own classes key off
 * the mark (`site-chrome.tsx`), so a page that does not open with one keeps
 * the header exactly as it was.
 */
export function opensOverPhoto(section: Section): boolean {
    return (
        section.type === "hero" &&
        resolveVariant("hero", section.content) === "fullBleed"
    );
}

/**
 * Render an ordered list of sections. Snapshot sections are already in display
 * order, so we key by index (positions are stable within an immutable
 * snapshot).
 *
 * The wrapper exists to carry a per-section padding override. It used to be
 * absent, so a merchant could set a section's padding in the editor, watch the
 * preview honour it, publish, and see the live site ignore it.
 *
 * It also carries the section's frame (`section-frame.ts`): its anchor as the
 * wrapper's `id`, so a header entry or a button can jump to it, and its band
 * as `data-site-band`, whose colours `SiteTheme` writes. `data-site-section`
 * marks every wrapper, for the rules that apply inside sections only (a
 * template's column width, definition lists). A section that sets none of it
 * gets no id and no band: the page is what it was.
 */
export function PageSections({
    sections,
    apiUrl,
    bookHref,
    siteId,
    journal,
    plans,
    packs,
    prices,
    thread,
    productGrids,
    fixtures,
    top = null,
    modulePage = top !== null,
}: {
    sections: Section[];
    /**
     * A module page's title (and lead), drawn above its sections (DEC-073
     * #9), as the design's Book, Prices and Shop pages open. The first
     * section then starts close under it, as the design's list does,
     * instead of a whole section's padding below.
     */
    top?: ModulePageTopContent | null;
    /**
     * Lay the sections out as a module page's (a rich-text intro on the
     * cards' line) without drawing the top: the editor's canvas draws each
     * section on its own and the top once above them. Follows `top`.
     */
    modulePage?: boolean;
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
    /** The business's class packs on sale, for the Class packs block (G20). */
    packs?: PacksFeed;
    /** Join and Buy's actions on a live site (G20). */
    prices?: PricesActions | null;
    /** A signed-in customer's thread, for the Contact page's form (A13). */
    thread?: EnquiryThread | null;
    /**
     * Each Product grid's products (G12), by the section's index in
     * `sections`: every grid asks for its own.
     */
    productGrids?: readonly (ProductGridFeed | undefined)[];
    /**
     * The business's live data, given rather than read (`site-fixtures.ts`):
     * the renderer's template renders only. A live site never passes it.
     */
    fixtures?: SiteFixtures;
}) {
    return (
        <>
            {top ? <ModulePageTop title={top.title} lead={top.lead} /> : null}
            {sections.map((section, i) => {
                const style = paddingOverride(section.content);
                // Close under the page's title, not a section's padding away.
                const className = top && i === 0 ? "[&>*]:!pt-5" : undefined;
                const rendered = (
                    <SectionRenderer
                        section={section}
                        apiUrl={apiUrl}
                        bookHref={bookHref}
                        siteId={siteId}
                        journal={journal}
                        plans={plans}
                        packs={packs}
                        prices={prices}
                        thread={thread}
                        productGrid={productGrids?.[i]}
                        fixtures={fixtures}
                        modulePage={modulePage}
                    />
                );
                const frame = sectionFrameOf(section.content);
                return (
                    <div
                        key={i}
                        id={frame.anchor}
                        className={className}
                        style={style}
                        data-site-section=""
                        data-site-band={frame.band}
                        data-site-first-hero={
                            !top && i === 0 && opensOverPhoto(section)
                                ? "fullBleed"
                                : undefined
                        }
                    >
                        {rendered}
                    </div>
                );
            })}
        </>
    );
}
