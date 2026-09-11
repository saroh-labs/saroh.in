import type { RenderedHero } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

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
export default function HeroSection({ content }: { content: RenderedHero }) {
    /*
     * The look is declared now (#254). `resolveVariant` keeps this identical for
     * content of any age: a hero with no variant resolves through hero's own
     * legacy rule, which IS `Boolean(content.image?.src)` — so every already
     * published hero renders exactly as it did.
     *
     * Naming it is the point. That switch was a real choice, invisible in the
     * editor, unnameable in a template and unshowable in a catalog.
     */
    const variant = resolveVariant("hero", content);
    const split = variant === "split";
    // A split hero still needs something to put beside the copy.
    const hasImage = split && Boolean(content.image?.src);
    return (
        <section className="bg-site-hero-bg text-site-hero-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
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
