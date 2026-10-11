import type { ReactNode } from "react";

import type { RenderedHero } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { siteImage } from "../lib/site-image";
import { CtaButton } from "./cta";
import { HeroHeading } from "./hero-heading";
import type { HeroLevel } from "./hero-level";

/**
 * The hero as it has always drawn: centred, or copy beside its image
 * (split). `hero.tsx` draws it, and so does On today (G18) whenever it has
 * no panel to put beside the headline — a shop-only business, or a read that
 * failed — so the hero never changes shape for a panel that isn't there.
 *
 * `below` is a line under the button: On today's "Open now · closes 9pm".
 *
 * Sits on the merchant's HERO BAND colour, not the page ground (#189): it is
 * one of the six colours they pick, and it was previously unreadable by this
 * app so the choice did nothing. The colour runs edge to edge; the words
 * keep the page's column and margins inside it, as every section's do, so a
 * template's column width (`--site-content-width`) holds the hero too.
 *
 * WITH NO PHOTO it has to carry the page on type alone, so it takes more
 * room than a section (half as much again above and below), sets the
 * headline at the template's display size with the tracking drawn in and
 * the lines balanced, and holds the line under it to a width that reads.
 * Nothing is tinted: the headline and its line are the hero's own text
 * colour at full strength, told apart by size and weight, so the pairing is
 * the one the palette checked.
 *
 * THE HEADLINE'S SIZE runs with the screen up to the template's display
 * size (`--site-display-size`, 60px without one) and never below 36px, then
 * times the merchant's heading scale, so one slider still moves the whole
 * page's voice.
 *
 * The page margin applies from `sm` up only. It goes to 80px, which on a
 * 375px-wide phone would leave the headline about half the screen — §18 makes
 * phone a co-primary scene, so the mobile gutter stays fixed and the merchant's
 * margin governs the widths it was chosen for.
 */
export default function PlainHero({
    content,
    below,
    priority = false,
    level = 1,
}: {
    content: RenderedHero;
    below?: ReactNode;
    /** The page opens on this hero: its photo is fetched first. */
    priority?: boolean;
    /** `1` for the page's first hero, `2` for any later one (`hero.tsx`). */
    level?: HeroLevel;
}) {
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
    const photo = content.image?.src ? content.image : null;
    // A split hero still needs something to put beside the copy.
    const hasImage = split && photo !== null;
    return (
        <section
            data-site-ground="hero"
            data-hero-photo={photo ? "" : undefined}
            className={
                photo
                    ? "bg-site-hero-bg text-site-hero-fg border-site-hero-fg/10 w-full border-b py-[var(--site-section-padding)]"
                    : "bg-site-hero-bg text-site-hero-fg border-site-hero-fg/10 w-full border-b py-[calc(var(--site-section-padding)*1.5)]"
            }
        >
            <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-[var(--site-page-margin)]">
                <div
                    className={
                        hasImage
                            ? "grid items-center gap-10 lg:grid-cols-2"
                            : "mx-auto max-w-[52rem] text-center"
                    }
                >
                    <div
                        className={hasImage ? "" : "flex flex-col items-center"}
                    >
                        <HeroHeading
                            level={level}
                            className="font-site-heading text-balance text-[calc(clamp(2.25rem,6vw_+_0.75rem,var(--site-display-size,3.75rem))*var(--site-heading-scale))] font-bold leading-[1.05] tracking-[-0.03em]"
                        >
                            {content.heading}
                        </HeroHeading>
                        {content.subheading ? (
                            <p className="mt-5 max-w-[54ch] text-pretty text-[length:calc(var(--site-body-size,1rem)*1.125)] leading-relaxed sm:text-[length:calc(var(--site-body-size,1rem)*1.25)]">
                                {content.subheading}
                            </p>
                        ) : null}
                        {content.cta ? (
                            <div className="mt-8">
                                <CtaButton
                                    content={content.cta}
                                    surface="hero"
                                />
                            </div>
                        ) : null}
                        {below ?? null}
                    </div>
                    {photo ? (
                        // Remote publication images from arbitrary tenant origins —
                        // a plain <img> avoids next/image's per-domain allowlist.

                        <img
                            src={photo.src}
                            alt={photo.alt ?? ""}
                            width={photo.width}
                            height={photo.height}
                            {...siteImage(priority ? "first-hero" : "below")}
                            className={
                                hasImage
                                    ? "h-auto w-full rounded-[var(--site-radius)] object-cover"
                                    : "mt-10 h-auto w-full rounded-[var(--site-radius)] object-cover"
                            }
                        />
                    ) : null}
                </div>
            </div>
        </section>
    );
}
