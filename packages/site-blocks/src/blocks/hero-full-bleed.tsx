"use client";

import type { RenderedHero } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import { openState, openStateText } from "../lib/opening-hours";
import type { PublicVisit } from "../lib/public-visit";
import { usePublicVisit } from "../lib/use-public-visit";
import { cn } from "../lib/utils";
import { CtaButton } from "./cta";

/**
 * The hero's `fullBleed` look (industry templates U2): the photo fills the
 * band edge to edge under a wash, and the headline, its line, the button and
 * an open-or-closed line sit over it, low on the left — the bakery design's
 * opening.
 *
 * THE WASH IS THE PAGE'S INK and the words its paper (`--site-fg` under
 * `--site-bg`), never a fixed black and white: on a light theme that is a
 * dark wash with light words, on a dark theme the reverse, and in both the
 * words keep their contrast with whatever is in the photo. Without a photo
 * yet (a template's brief, KTD-5) the band is the ink itself, so the hero
 * still reads; the pre-publish check asks for the photo.
 *
 * With `onToday` on, the line under the button says whether the business is
 * open now — "Open now · closes 3pm" — from the public visit read and the
 * one rule for it (`opening-hours.ts`). The panel of times On today draws
 * beside a centred or split hero does not fit over a photo, so this look
 * shows the line alone. No hours saved, or the read failed: no line, never
 * "Closed".
 *
 * When this hero opens the page, `PageSections` marks its wrapper and the
 * site header lies over the photo (`site-chrome.tsx`); the band leaves room
 * for it at the top.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */
export default function FullBleedHero({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    visit,
    now,
}: {
    content: RenderedHero;
    /** The live site, for the open line's read. See `SectionRenderer`. */
    siteId?: string | null;
    apiUrl?: string;
    /** A sample place for the open line instead of fetching (catalog, tests). */
    visit?: PublicVisit;
    /** The moment "Open now" is worked out for. Tests pin it. */
    now?: Date;
}) {
    const { state } = usePublicVisit({
        siteId,
        apiUrl,
        given: visit,
        enabled: Boolean(content.onToday),
    });
    const place = state.kind === "ready" ? state.visit : null;
    const status =
        content.onToday && place
            ? openState(
                  place.hours,
                  now ?? new Date(),
                  place.timezone,
                  place.closedDates,
              )
            : null;
    const src = content.image?.src.trim();

    return (
        <section
            data-hero-look="fullBleed"
            className="bg-site-fg text-site-bg relative isolate flex min-h-[min(88vh,760px)] w-full items-end overflow-hidden [[data-site-first-hero]_&]:pt-24"
        >
            {src ? (
                // Remote images from any tenant origin: a plain <img>, as
                // every hero's.
                <img
                    src={src}
                    alt={content.image?.alt ?? ""}
                    width={content.image?.width}
                    height={content.image?.height}
                    className="absolute inset-0 -z-20 size-full object-cover"
                />
            ) : null}
            {/* The wash: deepest at the foot, where the words sit, and a
                lighter veil over the whole photo. */}
            <span
                aria-hidden="true"
                className="from-site-fg/85 via-site-fg/45 to-site-fg/25 absolute inset-0 -z-10 bg-gradient-to-t"
            />
            <div className="mx-auto w-full max-w-screen-xl px-5 py-[calc(var(--site-section-padding)*1.25)] sm:px-[var(--site-page-margin)]">
                <div className="max-w-[40rem]">
                    {status ? (
                        <p className="mb-4 flex items-center gap-2 text-[13.5px] font-semibold">
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "inline-block size-2 rounded-full",
                                    status.open
                                        ? "bg-site-accent"
                                        : "bg-site-bg/60",
                                )}
                            />
                            {openStateText(status)}
                        </p>
                    ) : null}
                    <h1 className="font-site-heading text-balance text-[clamp(calc(40px*var(--site-heading-scale)),8vw,calc(76px*var(--site-heading-scale)))] font-semibold leading-[1.02] tracking-[-0.035em]">
                        {content.heading}
                    </h1>
                    {content.subheading ? (
                        <p className="mt-4 max-w-[46ch] text-pretty text-base leading-[1.55] opacity-90 sm:text-lg">
                            {content.subheading}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-6">
                            <CtaButton content={content.cta} surface="photo" />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
