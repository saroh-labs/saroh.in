import type { HeroContent } from "@/lib/publication";

import { CtaButton } from "./cta";

/**
 * `hero` v1 — a headline block with optional subheading, CTA and image.
 * Responsive: single column on mobile, two columns (copy + image) on large
 * screens when an image is present.
 *
 * Sits on the merchant's HERO BAND colour, not the page ground (#189): it is
 * one of the six colours they pick, and it was previously unreadable by this
 * app so the choice did nothing.
 *
 * The page margin applies from `sm` up only. It goes to 80px, which on a
 * 375px-wide phone would leave the headline about half the screen — §18 makes
 * phone a co-primary scene, so the mobile gutter stays fixed and the merchant's
 * margin governs the widths it was chosen for.
 */
export default function HeroSection({ content }: { content: HeroContent }) {
    const hasImage = Boolean(content.image?.src);
    return (
        <section className="mx-auto w-full max-w-screen-xl bg-site-hero-bg px-5 py-[var(--site-section-padding)] text-site-hero-fg sm:px-[var(--site-page-margin)]">
            <div
                className={
                    hasImage
                        ? "grid items-center gap-10 lg:grid-cols-2"
                        : "mx-auto max-w-3xl text-center"
                }
            >
                <div className={hasImage ? "" : "flex flex-col items-center"}>
                    {/* Headings scale together, so one slider moves the whole
                        page's voice rather than each size separately. */}
                    <h1 className="text-[calc(2.25rem*var(--site-heading-scale))] font-bold leading-tight tracking-tight sm:text-[calc(3rem*var(--site-heading-scale))] md:text-[calc(3.75rem*var(--site-heading-scale))]">
                        {content.heading}
                    </h1>
                    {content.subheading ? (
                        <p className="mt-6 max-w-2xl text-lg opacity-75 sm:text-xl">
                            {content.subheading}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-8">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </div>
                {content.image?.src ? (
                    // Remote publication images from arbitrary tenant origins —
                    // a plain <img> avoids next/image's per-domain allowlist.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={content.image.src}
                        alt={content.image.alt ?? ""}
                        width={content.image.width}
                        height={content.image.height}
                        className="h-auto w-full rounded-[var(--site-radius)] object-cover"
                    />
                ) : null}
            </div>
        </section>
    );
}
