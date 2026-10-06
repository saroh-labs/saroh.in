import type { RenderedHero } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import FullBleedHero from "./hero-full-bleed";
import PlainHero from "./hero-plain";
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
 *   reader and a search engine. Its button and photo are not drawn.
 */
export default function HeroSection({
    content,
    siteId,
    apiUrl,
    bookHref,
}: {
    content: RenderedHero;
    /** The live site, for On today's read (G18). See `SectionRenderer`. */
    siteId?: string | null;
    /** Base URL of the public API, for On today's read. */
    apiUrl?: string;
    /** The site's booking page, where On today's rows go (live sites only). */
    bookHref?: string;
}) {
    const look = resolveVariant("hero", content);
    if (look === "fullBleed") {
        return (
            <FullBleedHero content={content} siteId={siteId} apiUrl={apiUrl} />
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
            />
        );
    }
    return <PlainHero content={content} />;
}

/** The `none` look: a page title, not a hero. */
function CompactHeading({ content }: { content: RenderedHero }) {
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 pb-2 pt-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h1 className="font-site-heading text-balance text-[calc(2rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.025em]">
                {content.heading}
            </h1>
            {content.subheading ? (
                <p className="text-site-body mt-2 max-w-[60ch] text-pretty text-base leading-relaxed">
                    {content.subheading}
                </p>
            ) : null}
        </section>
    );
}
