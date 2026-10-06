import type { RenderedHero } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import type { PublicVisit } from "../lib/public-visit";
import FullBleedHero from "./hero-full-bleed";
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
 *   The heading stays an `h1`, so the page still has one for a screen
 *   reader and a search engine. Its button and photo are not drawn. With
 *   `titleVisible: false` the h1 is for those readers only — the header
 *   already shows the business's name, and a page opening on it twice reads
 *   as a mistake — and with no line under it the section takes no room.
 */
export default function HeroSection({
    content,
    siteId,
    apiUrl,
    bookHref,
    visit,
    today,
}: {
    content: RenderedHero;
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
}) {
    const look = resolveVariant("hero", content);
    if (look === "fullBleed") {
        return (
            <FullBleedHero
                content={content}
                siteId={siteId}
                apiUrl={apiUrl}
                visit={visit}
            />
        );
    }
    if (look === "none") return <CompactHeading content={content} />;
    if (content.onToday) {
        return (
            <OnTodayHero
                content={content}
                siteId={siteId}
                apiUrl={apiUrl}
                bookHref={bookHref}
                today={today}
            />
        );
    }
    return <PlainHero content={content} />;
}

/** The `none` look: a page title, not a hero. */
function CompactHeading({ content }: { content: RenderedHero }) {
    const visible = content.titleVisible !== false;
    if (!visible && !content.subheading) {
        // Only the page's h1, for screen readers and search engines.
        return <h1 className="sr-only">{content.heading}</h1>;
    }
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 pb-2 pt-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h1
                className={
                    visible
                        ? "font-site-heading text-balance text-[calc(2rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.025em]"
                        : "sr-only"
                }
            >
                {content.heading}
            </h1>
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
