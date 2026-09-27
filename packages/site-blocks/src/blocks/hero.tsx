import type { RenderedHero } from "@saroh/block-contract";

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
