import type { RenderedHero } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import type { PublicVisit } from "../lib/public-visit";
import FullBleedHero from "./hero-full-bleed";
import { HeroHeading } from "./hero-heading";
import type { HeroLevel } from "./hero-level";
import PlainHero from "./hero-plain";
import type { PublicToday } from "./on-today";
import OnTodayHero from "./on-today";

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
 * ONE H1 A PAGE. Only the page's first hero draws its headline as the `h1`;
 * a later one is an `h2` (`level`, from `hero-level.ts`), whichever look it
 * wears.
 */
export default function HeroSection({
    content,
    siteId,
    apiUrl,
    bookHref,
    visit,
    today,
    now,
    priority = false,
    level = 1,
}: {
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
    /** The moment "Open now" is worked out for (fixtures, tests). */
    now?: Date;
}) {
    const look = resolveVariant("hero", content);
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
    return <PlainHero content={content} priority={priority} level={level} />;
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
                    {content.subheading}
                </p>
            ) : null}
        </section>
    );
}
