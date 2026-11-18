import type { LookId, RenderedHero } from "@saroh/block-contract";
import { LOOKS, resolveVariant } from "@saroh/block-contract";

import type { PublicVisit } from "../lib/public-visit";
import type { LookProps } from "../look-context";
import { AnswerRow, VisitStamp } from "./answer-row";
import { HeroByline } from "./byline";
import type { PanelService } from "./hero-answer-panel";
import AnswerHero from "./hero-answer-panel";
import FullBleedHero from "./hero-full-bleed";
import { HeroHeading } from "./hero-heading";
import type { HeroLevel } from "./hero-level";
import LookHero from "./hero-look";
import { panelHasWords } from "./hero-panel";
import PlainHero from "./hero-plain";
import type { FrontDoor, PageProof } from "./look-front";
import type { PublicToday } from "./on-today";
import OnTodayHero from "./on-today";
import { PhoneText } from "./phone-text";

/**
 * `hero` v1/v2 — a headline block with optional subheading, CTA and image.
 * Responsive: single column on mobile, two columns (copy + image) on large
 * screens when an image is present (`hero-plain.tsx`).
 *
 * With `onToday` on (G18) the headline sits beside "On today" — today's
 * classes and free times, read live — and says whether the business is open
 * now (`on-today.tsx`). Without it, the hero is exactly what it always was.
 *
 * Two looks added for the industry templates (U2):
 * - `fullBleed` — the photo edge to edge under a wash, the words over it
 *   (`hero-full-bleed.tsx`); `onToday` there is the open line alone.
 * - `none` — no band at all: the page's heading and its line, small, in the
 *   page column, for pages that go straight to a list (a blog, a portfolio).
 *   The heading stays the page's `h1`, so the page still has one for a
 *   screen reader and a search engine. Its button and photo are not drawn. With
 *   `titleVisible: false` the h1 is for those readers only — the header
 *   already shows the business's name, and a page opening on it twice reads
 *   as a mistake — and with no line under it the section takes no room.
 *
 * UNDER A LOOK (DEC-172, U6) a hero that chose no layout, or chose the
 * look's own, is drawn as the look's hero (`hero-look.tsx`): its layout,
 * its no-photo layout, the next booking's place and the page's proof line.
 * A section's own other choice wins (KD2): a split hero under Quiet, a
 * full-bleed or `none` hero, and one with On today keep their layouts,
 * restyled by the look's tokens. Classic is unchanged.
 *
 * THE ANSWER PANEL (`answer`, DEC-228, `hero-answer-panel.tsx`) is its own
 * layout on every look: the heading beside a card that answers first. A
 * panel with nothing true to say draws this hero's Centered layout.
 *
 * THE ANSWER ROW AND THE BYLINE (`answerRow`, `byline`) go on every layout
 * but `none` and full-bleed: Open now, Directions and Call under the
 * buttons, read in the browser (`answer-row.tsx`), and who is behind the
 * business under the line (`byline.tsx`). A Classic split hero with no
 * photo puts the Stamp in its image slot (`stamp.tsx`).
 *
 * ONE H1 A PAGE. Only the page's first hero draws its headline as the `h1`;
 * a later one is an `h2` (`level`, from `hero-level.ts`), whichever look it
 * wears.
 */
type HeroProps = LookProps & {
    content: RenderedHero;
    /**
     * `1`: this is the page's first hero, and its headline is the page's
     * `h1`. `2`: a later hero, whose headline is an `h2` (`hero-level.ts`).
     * A hero drawn on its own (the catalog, the editor's canvas) is `1`.
     */
    level?: HeroLevel;
    /**
     * The page opens on this hero (it is the first section): its photo is
     * fetched ahead of everything else. Any other hero's waits its turn.
     */
    priority?: boolean;
    /** The live site, for On today's read (G18). See `SectionRenderer`. */
    siteId?: string | null;
    /** Base URL of the public API, for On today's read. */
    apiUrl?: string;
    /** The site's booking page, where On today's rows go (live sites only). */
    bookHref?: string;
    /** A place to draw the open line from instead of reading (fixtures). */
    visit?: PublicVisit;
    /** A day to draw On today from instead of reading (fixtures). */
    today?: PublicToday;
    /** A service to draw the Consultation panel from instead of reading (fixtures). */
    service?: PanelService;
    /** The moment "Open now" is worked out for (fixtures, tests). */
    now?: Date;
    /**
     * Under a look: the hero's way in beside its button, the booking page
     * or the shop (`FrontDoor`). Live sites only; none draws no slot.
     */
    frontDoor?: FrontDoor | null;
    /** Under a look: the page's first testimonial, as one proof line. */
    proof?: PageProof | null;
    /**
     * Whose site and which town, for the no-photo Stamp, given by the page
     * that serves the site so the Stamp is in its HTML. Absent: read.
     */
    siteName?: string | null;
    town?: string | null;
};

export default function HeroSection(props: HeroProps) {
    const {
        content,
        siteId,
        apiUrl,
        bookHref,
        visit,
        today,
        now,
        priority = false,
        level = 1,
        look: siteLook,
        isOwnerPreview = false,
        frontDoor = null,
        proof = null,
        siteName = null,
        town = null,
    } = props;
    const look = resolveVariant("hero", content);
    if (look === "answer") {
        const centered = (
            <HeroSection
                {...props}
                content={{ ...content, variant: "centered" }}
            />
        );
        if (!panelHasWords(content)) return centered;
        return (
            <AnswerHero
                content={content}
                look={siteLook}
                level={level}
                siteId={siteId}
                apiUrl={apiUrl}
                bookHref={bookHref}
                visit={visit}
                today={today}
                service={props.service}
                now={now}
                fallback={centered}
            />
        );
    }
    const row = (className?: string, center = false) =>
        content.answerRow ? (
            <AnswerRow
                siteId={siteId}
                apiUrl={apiUrl}
                visit={visit}
                now={now}
                look={siteLook}
                center={center}
                className={className}
            />
        ) : null;
    const byline = (className?: string) =>
        content.byline ? (
            <HeroByline byline={content.byline} className={className} />
        ) : null;
    if (siteLook && wearsLookHero(content, look, siteLook)) {
        return (
            <LookHero
                content={content}
                look={siteLook}
                level={level}
                priority={priority}
                isOwnerPreview={isOwnerPreview}
                frontDoor={frontDoor}
                proof={proof}
                siteId={siteId}
                apiUrl={apiUrl}
                today={today}
                now={now}
                row={row(
                    siteLook === "quiet"
                        ? "min-[700px]:justify-center"
                        : undefined,
                )}
                byline={byline(
                    siteLook === "quiet"
                        ? "min-[700px]:justify-center"
                        : undefined,
                )}
            />
        );
    }
    if (look === "fullBleed") {
        return (
            <FullBleedHero
                content={content}
                siteId={siteId}
                apiUrl={apiUrl}
                visit={visit}
                now={now}
                priority={priority}
                level={level}
            />
        );
    }
    if (look === "none") {
        return <CompactHeading content={content} level={level} />;
    }
    if (content.onToday) {
        return (
            <OnTodayHero
                content={content}
                level={level}
                siteId={siteId}
                apiUrl={apiUrl}
                bookHref={bookHref}
                today={today}
                now={now}
            />
        );
    }
    const split = look === "split";
    const under = row("mt-6", !split);
    return (
        <PlainHero
            content={content}
            priority={priority}
            level={level}
            afterLine={byline(split ? "mt-6" : "mt-6 justify-center")}
            below={under ?? undefined}
            noPhoto={
                <VisitStamp
                    siteId={siteId}
                    apiUrl={apiUrl}
                    visit={visit}
                    isOwnerPreview={isOwnerPreview}
                    imageBrief={content.imageBrief}
                    name={siteName}
                    town={town}
                />
            }
        />
    );
}

/** The `none` look: a page title, not a hero. */
function CompactHeading({
    content,
    level,
}: {
    content: RenderedHero;
    level: HeroLevel;
}) {
    const visible = content.titleVisible !== false;
    if (!visible && !content.subheading) {
        // Only the page's heading, for screen readers and search engines.
        return (
            <HeroHeading level={level} className="sr-only">
                {content.heading}
            </HeroHeading>
        );
    }
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 pb-2 pt-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <HeroHeading
                level={level}
                className={
                    visible
                        ? "font-site-heading text-balance text-[calc(2rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.025em]"
                        : "sr-only"
                }
            >
                {content.heading}
            </HeroHeading>
            {content.subheading ? (
                <p
                    className={`text-site-body max-w-[60ch] text-pretty text-base leading-relaxed ${visible ? "mt-2" : ""}`}
                >
                    <PhoneText
                        text={content.subheading}
                        phone={content.phoneLine}
                    />
                </p>
            ) : null}
        </section>
    );
}

/**
 * Whether a hero is drawn as its look's own (U6): a centred or split hero
 * whose section named no layout, or named the look's default (Quiet's
 * centred, Folio's split; Live sets none, so either of the two). Never one
 * with On today, whose panel is its own layout.
 */
export function wearsLookHero(
    content: RenderedHero,
    resolved: string,
    look: LookId,
): boolean {
    if (content.onToday) return false;
    if (resolved !== "split" && resolved !== "centered") return false;
    const named =
        typeof content.variant === "string" ? content.variant.trim() : "";
    if (named === "") return true;
    const own = LOOKS[look].defaultVariants.hero;
    return own === undefined || named === own;
}
