import type {
    LookId,
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
import {
    isSectionType,
    resolveVariant,
    sectionFrameOf,
} from "@saroh/block-contract";

import BookingSection from "./blocks/booking";
import ContactSection from "./blocks/contact";
import CtaSection from "./blocks/cta";
import type { EnquiryThread } from "./blocks/enquiry";
import EnquirySection from "./blocks/enquiry";
import FaqSection from "./blocks/faq";
import FeaturesSection from "./blocks/features";
import GallerySection from "./blocks/gallery";
import HeroSection from "./blocks/hero";
import type { HeroLevel } from "./blocks/hero-level";
import { heroLevels } from "./blocks/hero-level";
import HoursSection from "./blocks/hours";
import type { JournalFeed } from "./blocks/journal";
import JournalSection from "./blocks/journal";
import type { FrontDoor, PageProof } from "./blocks/look-front";
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
import type { CreditFor } from "./booking-flow/api";
import type { LookProps } from "./look-context";
import { lookOf } from "./look-context";
import type { ModulePageTopContent } from "./module-page-top";
import { ModulePageTop } from "./module-page-top";
import type { PricesActions } from "./prices/api";
import type { BusinessReach } from "./reach-links";
import { sectionRendersNothing } from "./section-empty";
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
    reach,
    first = false,
    heroLevel = 1,
    siteName,
    look,
    isOwnerPreview = false,
    frontDoor = null,
    proof = null,
    credit,
    beside = null,
}: LookProps & {
    section: Section;
    /**
     * A Plans section's cards drawn first in its row: Live's class packs
     * (VB01), which `PageSections` folds in. Absent elsewhere.
     */
    beside?: React.ReactNode;
    /**
     * Under a look, the signed-in customer's class credit (the booking
     * page's own read, through the site's server with their session), for
     * the Timetable's "1 pack class" (U7). Called only in the browser.
     */
    credit?: CreditFor;
    /**
     * Under a look, for the page's first hero: its way in beside its
     * button (the booking page or the shop) and the page's proof line
     * (U6). `PageSections` works both out; elsewhere they are absent.
     */
    frontDoor?: FrontDoor | null;
    proof?: PageProof | null;
    /**
     * Which heading a hero's headline is: `1` for the page's first hero,
     * `2` for a later one (`hero-level.ts`). A section drawn on its own is
     * `1`, as every hero was.
     */
    heroLevel?: HeroLevel;
    /**
     * Whose site this is, for the closing band's heading when its content
     * gives none (`ctaBandWords`). Absent, the band's words name no one.
     */
    siteName?: string | null;
    /**
     * The page's first section: a hero here is what the page opens on, and
     * its photo is fetched first (`lib/site-image.ts`).
     */
    first?: boolean;
    /**
     * How to reach the business (the public contact read): the booking
     * block offers a call and a message when it has no time to offer.
     * Absent where no site is live.
     */
    reach?: BusinessReach | null;
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
    // A pinned moment (`SiteFixtures.now`); undefined on a live site, where
    // each block reads the clock.
    const now = fixtures?.now ? new Date(fixtures.now) : undefined;
    // The look (DEC-172): every block is told it, and whether this is the
    // owner's preview. A Classic section's content is handed on untouched,
    // so it draws exactly as before.
    const site: LookProps = { look: lookOf(look), isOwnerPreview };
    const content = withLookVariant(section, site.look);
    switch (section.type) {
        case "hero":
            return (
                <HeroSection
                    {...site}
                    content={content as RenderedHero}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                    siteId={siteId}
                    visit={fixtures?.visit}
                    today={fixtures?.today}
                    now={now}
                    priority={first}
                    level={heroLevel}
                    frontDoor={frontDoor}
                    proof={proof}
                />
            );
        case "richText":
            return (
                <RichTextSection
                    {...site}
                    content={content as RenderedRichText}
                    align={modulePage ? "cards" : "column"}
                />
            );
        case "cta":
            return (
                <CtaSection
                    {...site}
                    content={content as RenderedCtaSection}
                    siteName={siteName}
                />
            );
        case "gallery":
            return (
                <GallerySection
                    {...site}
                    content={content as RenderedGallery}
                />
            );
        case "enquiry":
            return (
                <EnquirySection
                    {...site}
                    content={content as RenderedEnquiry}
                    apiUrl={apiUrl}
                    thread={thread}
                />
            );
        case "features":
            return (
                <FeaturesSection
                    {...site}
                    content={content as RenderedFeatures}
                />
            );
        case "faq":
            return <FaqSection {...site} content={content as RenderedFaq} />;
        case "testimonials":
            return (
                <TestimonialsSection
                    {...site}
                    content={content as RenderedTestimonials}
                />
            );
        case "servicesList":
            return (
                <ServicesListSection
                    {...site}
                    content={content as RenderedServicesList}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                    services={fixtures?.services}
                />
            );
        case "contact":
            return (
                <ContactSection
                    {...site}
                    content={content as RenderedContact}
                />
            );
        case "visitUs":
            return (
                <VisitUsSection
                    {...site}
                    content={content as RenderedVisitUs}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    visit={fixtures?.visit}
                    now={now}
                />
            );
        case "journal":
            return (
                <JournalSection
                    {...site}
                    content={content as RenderedJournal}
                    feed={journal}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    now={now}
                />
            );
        case "plans":
            return (
                <PlansSection
                    {...site}
                    content={content as RenderedPlans}
                    feed={plans}
                    prices={prices}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    beside={beside}
                />
            );
        case "packs":
            return (
                <PacksSection
                    {...site}
                    content={content as RenderedPacks}
                    plansOnPage={(plans?.plans.length ?? 0) > 0}
                    feed={packs}
                    prices={prices}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "productGrid":
            return (
                <ProductGridSection
                    {...site}
                    content={content as RenderedProductGrid}
                    feed={productGrid}
                    apiUrl={apiUrl}
                    siteId={siteId}
                />
            );
        case "projects":
            return (
                <ProjectsSection
                    {...site}
                    content={content as RenderedProjects}
                />
            );
        case "timetable":
            return (
                <TimetableSection
                    {...site}
                    content={content as RenderedTimetable}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    bookHref={bookHref}
                    timetable={fixtures?.timetable}
                    credit={site.look ? credit : undefined}
                />
            );
        case "hours":
            return (
                <HoursSection
                    {...site}
                    content={content as RenderedHours}
                    apiUrl={apiUrl}
                    siteId={siteId}
                    visit={fixtures?.visit}
                    now={now}
                />
            );
        case "person":
            return (
                <PersonSection {...site} content={content as RenderedPerson} />
            );
        case "booking":
            return (
                <BookingSection
                    {...site}
                    content={content as RenderedBooking}
                    apiUrl={apiUrl}
                    bookHref={bookHref}
                    reach={reach}
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
export function opensOverPhoto(section: Section, look?: LookId): boolean {
    return (
        section.type === "hero" &&
        resolveVariant("hero", section.content, lookOf(look)) === "fullBleed"
    );
}

/**
 * A section's content with the look's layout written in (KD2), where the
 * section chose none and the look's default differs from what the block
 * would draw without a look: every block, and every helper inside it that
 * asks `resolveVariant(type, content)`, then draws the look's layout
 * without being told the look. A section's own variant always wins, and
 * Classic's content is returned untouched (the same object).
 */
export function withLookVariant(section: Section, look?: LookId): unknown {
    const { type, content } = section;
    if (!look || !isSectionType(type)) return content;
    if (content === null || typeof content !== "object") return content;
    const named = (content as { variant?: unknown }).variant;
    if (typeof named === "string" && named.trim() !== "") return content;
    const chosen = resolveVariant(type, content, look);
    if (chosen === resolveVariant(type, content)) return content;
    return { ...content, variant: chosen };
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
 *
 * A section known on the server to draw nothing (a feed-backed block with
 * nothing in its feed, `section-empty.ts`) gets no wrapper, so no anchor. A
 * block that reads in the browser and settles on nothing leaves its wrapper
 * empty. The header hides a menu entry whose target is missing or empty
 * (`useShownInPageItems` in `site-header-menu.tsx`).
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
    reach,
    siteName,
    look,
    isOwnerPreview = false,
    frontDoor = null,
    credit,
}: LookProps & {
    sections: Section[];
    /** The signed-in customer's class credit, for a look's Timetable (U7). */
    credit?: CreditFor;
    /**
     * Under a look: the way in the page's first hero offers beside its
     * button (U6), worked out by the live site from what it serves now
     * (the booking page, else the shop). Absent: no slot.
     */
    frontDoor?: FrontDoor | null;
    /** Whose site this is, for the closing band's composed heading. */
    siteName?: string | null;
    /** How to reach the business, for the blocks that offer it. */
    reach?: BusinessReach | null;
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
    const nothing = (i: number) =>
        sectionRendersNothing(sections[i], {
            journal,
            plans,
            packs,
            productGrid: productGrids?.[i],
        });
    // One h1 a page: the first hero's headline, unless the page already
    // opens on its own title (a module page's top).
    const levels = heroLevels(sections, {
        titled: top !== null,
        skip: nothing,
    });
    // Under a look, the page's first hero carries its way in and one proof
    // line from the page's own testimonials (U6). Classic gets neither.
    const lookId = lookOf(look);
    const proof = lookId ? pageProof(sections) : null;
    const opener = lookId
        ? sections.findIndex(
              (s, i) => s.type === "hero" && levels[i] === 1 && !nothing(i),
          )
        : -1;
    // Under Live, plans with class packs straight after them are one row
    // of cards, the packs first (VB01's "Come once, or every day"). Only
    // with both feeds: the editor's canvas draws each on its own.
    const joinsPacks = (i: number) =>
        lookId === "live" &&
        sections[i]?.type === "plans" &&
        sections[i + 1]?.type === "packs" &&
        plans !== undefined &&
        packs !== undefined &&
        !nothing(i) &&
        !nothing(i + 1);
    return (
        <>
            {top ? <ModulePageTop title={top.title} lead={top.lead} /> : null}
            {sections.map((section, i) => {
                const frame = sectionFrameOf(section.content);
                // A feed-backed block with nothing to show (`section-empty`):
                // no wrapper and so no anchor to jump to. The layout already
                // left its entry out of the menu, and the header drops one
                // whose target is missing.
                if (nothing(i) || (i > 0 && joinsPacks(i - 1))) return null;
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
                        reach={reach}
                        first={i === 0}
                        heroLevel={levels[i]}
                        siteName={siteName}
                        look={look}
                        isOwnerPreview={isOwnerPreview}
                        credit={credit}
                        {...(i === opener ? { frontDoor, proof } : {})}
                        beside={
                            joinsPacks(i) ? (
                                <PacksSection
                                    look={lookId}
                                    isOwnerPreview={isOwnerPreview}
                                    content={
                                        sections[i + 1].content as RenderedPacks
                                    }
                                    plansOnPage
                                    feed={packs}
                                    prices={prices}
                                    apiUrl={apiUrl}
                                    siteId={siteId}
                                    bare
                                />
                            ) : null
                        }
                    />
                );
                return (
                    <div
                        key={i}
                        id={frame.anchor}
                        className={className}
                        style={style}
                        data-site-section=""
                        data-site-band={frame.band}
                        data-site-first-hero={
                            !top && i === 0 && opensOverPhoto(section, look)
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

/**
 * The page's one proof line under a look (U6): the first quote of its
 * first testimonials section, as the owner wrote it. Null when the page
 * has none: a proof line is never composed.
 */
export function pageProof(sections: readonly Section[]): PageProof | null {
    for (const section of sections) {
        if (section.type !== "testimonials") continue;
        const items = (section.content as { items?: unknown } | null)?.items;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            const quote = (item as { quote?: unknown } | null)?.quote;
            const name = (item as { name?: unknown } | null)?.name;
            if (
                typeof quote === "string" &&
                quote.trim() !== "" &&
                typeof name === "string" &&
                name.trim() !== ""
            ) {
                return { quote: quote.trim(), name: name.trim() };
            }
        }
    }
    return null;
}
