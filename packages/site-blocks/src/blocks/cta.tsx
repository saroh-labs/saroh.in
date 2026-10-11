import Link from "next/link";

import type { RenderedCta, RenderedCtaSection } from "@saroh/block-contract";
import { cn } from "../lib/utils";
import { ctaBandWords } from "./cta-words";

/**
 * Which surface a CTA sits on, because that decides what it may be coloured
 * with.
 *
 * `page` — the page ground. The merchant's ACCENT is the right emphasis
 * here: it is the colour they chose to stand out.
 *
 * `hero` — the hero band. The accent still fills the primary button, as the
 * editor preview paints it, so the two agree; but everything else about the
 * button (its outline, a quieter button's words, the focus ring) is drawn
 * from the hero's own text colour, because the hero band is a colour the
 * merchant picks separately from the page and the page's ink is not checked
 * against it.
 *
 * `band` — the call-to-action band. The accent is NOT safe here. `accent` and
 * `ctaBand` are two independently chosen rows and their swatches overlap: both
 * offer Clay at `18 45% 45%`, byte-identical. A merchant picking Clay in both
 * would get an accent button in exactly the band's own colour — an invisible
 * button on their live site, while the editor preview showed it perfectly. On a
 * band the button derives from the band's own foreground instead, which cannot
 * collide with the band by construction, whatever either row grows later.
 */
export type CtaSurface = "page" | "hero" | "band" | "photo";

/**
 * Tailwind classes for a CTA by visual style and the surface it sits on.
 * Shared by the standalone `cta` section, the `hero` section's embedded
 * button, and every button a merchant's page draws in the site's own look.
 *
 * STATES, the same on every surface:
 * - hover: the fill or the words ease a step;
 * - focus-visible: a 2px ring set off from the button by a 2px gap. Both
 *   follow the surface for the same reason the fill does: a ring offset in
 *   the page ground, drawn around a button in the middle of a coloured
 *   band, is a white halo on terracotta. The ring is always the surface's
 *   own text colour or the accent, each of which the palette holds to
 *   4.5:1 on that surface, so it is seen on every colourway;
 * - pressed: the button gives a little under the finger (scale and
 *   opacity, nothing that moves the page);
 * - disabled (`disabled` or `aria-disabled`): faded, and it takes no press.
 *
 * Movement is short and on one curve; a visitor who asked for less motion
 * gets none (`SiteTheme`).
 */
export function ctaClasses(
    style: RenderedCta["style"],
    surface: CtaSurface = "page",
): string {
    /*
     * `coarse:min-h-11`: 44px on a touch pointer, the target the design system
     * sets (frontend-design-system.md). `text-sm` plus `py-2.5` is 40px, which
     * is fine under a mouse and short under a thumb. `coarse:` is a pointer
     * query, not a width, so a desk keeps today's size. Link-style buttons get
     * the same height with no padding change: the tap area grows, the underline
     * does not move.
     */
    const base =
        "inline-flex cursor-pointer items-center justify-center rounded-[var(--site-radius)] text-sm font-semibold transition-[color,background-color,border-color,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:cursor-default disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:cursor-default aria-disabled:opacity-55 coarse:min-h-11";
    const ring =
        surface === "band"
            ? "focus-visible:ring-site-cta-fg focus-visible:ring-offset-site-cta-bg"
            : surface === "photo"
              ? "focus-visible:ring-site-bg focus-visible:ring-offset-site-fg"
              : surface === "hero"
                ? "focus-visible:ring-site-hero-fg focus-visible:ring-offset-site-hero-bg"
                : "focus-visible:ring-site-accent focus-visible:ring-offset-site-bg";

    /*
     * `photo` — over the full-bleed hero's wash (U2). The wash is the page's
     * ink, so its words are the page's paper; the accent still fills the
     * primary button, which the merchant chose to stand out.
     */
    if (surface === "photo") {
        switch (style) {
            case "secondary":
                return cn(
                    base,
                    ring,
                    "border-site-bg text-site-bg hover:bg-site-bg/15 border px-5 py-2.5 active:opacity-80",
                );
            case "link":
                return cn(
                    base,
                    ring,
                    "text-site-bg underline underline-offset-4 hover:opacity-80 active:opacity-70",
                );
            case "primary":
            default:
                return cn(
                    base,
                    ring,
                    "bg-site-accent text-site-accent-fg px-5 py-2.5 hover:opacity-90 active:opacity-80",
                );
        }
    }

    if (surface === "band") {
        switch (style) {
            case "secondary":
                return cn(
                    base,
                    ring,
                    "border-site-cta-fg text-site-cta-fg hover:bg-site-cta-fg/15 border px-5 py-2.5 active:opacity-80",
                );
            case "link":
                return cn(
                    base,
                    ring,
                    "text-site-cta-fg underline underline-offset-4 hover:opacity-80 active:opacity-70",
                );
            case "primary":
            default:
                return cn(
                    base,
                    ring,
                    "bg-site-cta-fg text-site-cta-bg px-5 py-2.5 hover:opacity-90 active:opacity-80",
                );
        }
    }

    if (surface === "hero") {
        switch (style) {
            case "secondary":
                return cn(
                    base,
                    ring,
                    "border-site-hero-fg text-site-hero-fg hover:bg-site-hero-fg/10 border px-5 py-2.5 active:opacity-80",
                );
            case "link":
                return cn(
                    base,
                    ring,
                    "text-site-hero-fg underline underline-offset-4 hover:opacity-80 active:opacity-70",
                );
            case "primary":
            default:
                return cn(
                    base,
                    ring,
                    "bg-site-accent text-site-accent-fg px-5 py-2.5 hover:opacity-90 active:opacity-80",
                );
        }
    }

    switch (style) {
        case "secondary":
            return cn(
                base,
                ring,
                "border-site-border text-site-fg hover:bg-site-border/40 active:bg-site-border/70 border px-5 py-2.5",
            );
        case "link":
            return cn(
                base,
                ring,
                "text-site-fg hover:text-site-body underline underline-offset-4 active:opacity-70",
            );
        case "primary":
        default:
            return cn(
                base,
                ring,
                "bg-site-accent text-site-accent-fg px-5 py-2.5 hover:opacity-90 active:opacity-80",
            );
    }
}

/**
 * True for anything that is not a route in this app — rendered as a plain
 * anchor so next/link never tries to route it. `tel:` used to fall through to
 * a <Link> and worked only because next/link declines to intercept non-local
 * URLs; it is named now rather than relied on.
 */
function isExternal(href: string): boolean {
    return /^(https?:)?\/\//i.test(href) || /^(mailto|tel|sms):/i.test(href);
}

/** A single CTA button/link, used standalone and embedded in the hero. */
export function CtaButton({
    content,
    surface = "page",
}: {
    content: RenderedCta;
    surface?: CtaSurface;
}) {
    const className = ctaClasses(content.style, surface);
    if (content.href.trim() === "") {
        // A v2 button whose page was hidden or removed after it was set. The
        // flag engine told the merchant before publish; here the label draws
        // and goes nowhere, which is the honest rendering of "nowhere": it
        // says it is unavailable and looks it, rather than a button that
        // seems to work and does nothing under the finger.
        return (
            <span role="link" aria-disabled="true" className={className}>
                {content.label}
            </span>
        );
    }
    if (isExternal(content.href)) {
        return (
            <a
                href={content.href}
                className={className}
                rel="noopener noreferrer"
            >
                {content.label}
            </a>
        );
    }
    return (
        <Link href={content.href} className={className}>
            {content.label}
        </Link>
    );
}

/**
 * `cta` v1 — the closing band: a heading, one line and a button.
 *
 * Rendered as a BAND in the merchant's call-to-action colour (#189) rather than
 * a button floating on the page ground. That colour is one of the six they
 * choose, and until now nothing read it.
 *
 * THE BAND ALWAYS HAS WORDS. Its content may give a heading and a line; a
 * band published with a button alone gets both composed from what the
 * button does and whose site it is (`ctaBandWords`), so the last thing on
 * a page never asks without saying what for. The words sit on the page's
 * left edge with the button beside them at the desk, and above it on a
 * phone: a row, not one more centred stack.
 *
 * The band's colour runs edge to edge; its words keep the page's column and
 * margins, as every section's do. `data-site-ground` tells `SiteTheme` the
 * block paints its own ground, so the page's rhythm never tucks it up
 * against the section above.
 */
export default function CtaSection({
    content,
    siteName,
}: {
    content: RenderedCtaSection;
    /** Whose site this is, for a band whose content gives no heading. */
    siteName?: string | null;
}) {
    const { heading, text } = ctaBandWords(content, siteName);
    return (
        <section
            data-site-ground="cta"
            className="bg-site-cta-bg text-site-cta-fg w-full py-[var(--site-section-padding)]"
        >
            <div className="mx-auto flex w-full max-w-screen-xl flex-col items-start gap-6 px-5 sm:px-[var(--site-page-margin)] md:flex-row md:items-center md:justify-between md:gap-12">
                <div className="min-w-0">
                    <h2 className="font-site-heading text-balance text-[calc(clamp(1.5rem,2.4vw_+_0.9rem,2.25rem)*var(--site-heading-scale))] font-semibold leading-[1.12] tracking-[-0.02em]">
                        {heading}
                    </h2>
                    {text ? (
                        <p className="mt-2 max-w-[52ch] text-pretty text-[length:var(--site-body-size,1rem)] leading-relaxed">
                            {text}
                        </p>
                    ) : null}
                </div>
                <div className="shrink-0">
                    <CtaButton content={content} surface="band" />
                </div>
            </div>
        </section>
    );
}
