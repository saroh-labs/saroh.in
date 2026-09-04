import Link from "next/link";

import type { CtaContent } from "@/lib/publication";
import { cn } from "@/lib/utils";

/**
 * Which surface a CTA sits on, because that decides what it may be coloured
 * with.
 *
 * `page` — the page ground and the hero band. The merchant's ACCENT is the
 * right emphasis here: it is the colour they chose to stand out, and the editor
 * preview paints the hero's button with it too, so the two agree.
 *
 * `band` — the call-to-action band. The accent is NOT safe here. `accent` and
 * `ctaBand` are two independently chosen rows and their swatches overlap: both
 * offer Clay at `18 45% 45%`, byte-identical. A merchant picking Clay in both
 * would get an accent button in exactly the band's own colour — an invisible
 * button on their live site, while the editor preview showed it perfectly. On a
 * band the button derives from the band's own foreground instead, which cannot
 * collide with the band by construction, whatever either row grows later.
 */
export type CtaSurface = "page" | "band";

/**
 * Tailwind classes for a CTA by visual style and the surface it sits on.
 * Shared by the standalone `cta` section and the `hero` section's embedded
 * button.
 *
 * The focus ring follows the surface for the same reason the fill does: a ring
 * offset in the page ground, drawn around a button in the middle of a coloured
 * band, is a white halo on terracotta.
 */
export function ctaClasses(
    style: CtaContent["style"],
    surface: CtaSurface = "page",
): string {
    const base =
        "inline-flex items-center justify-center rounded-[var(--site-radius)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
    const ring =
        surface === "band"
            ? "focus-visible:ring-site-cta-fg focus-visible:ring-offset-site-cta-bg"
            : "focus-visible:ring-site-accent focus-visible:ring-offset-site-bg";

    if (surface === "band") {
        switch (style) {
            case "secondary":
                return cn(
                    base,
                    ring,
                    "border-site-cta-fg text-site-cta-fg border px-5 py-2.5 hover:opacity-80",
                );
            case "link":
                return cn(
                    base,
                    ring,
                    "text-site-cta-fg underline underline-offset-4 hover:opacity-80",
                );
            case "primary":
            default:
                return cn(
                    base,
                    ring,
                    "bg-site-cta-fg text-site-cta-bg px-5 py-2.5 hover:opacity-90",
                );
        }
    }

    switch (style) {
        case "secondary":
            return cn(
                base,
                ring,
                "border-site-border text-site-fg hover:bg-site-border/40 border px-5 py-2.5",
            );
        case "link":
            return cn(
                base,
                ring,
                "text-site-fg hover:text-site-body underline underline-offset-4",
            );
        case "primary":
        default:
            return cn(
                base,
                ring,
                "bg-site-accent text-site-accent-fg px-5 py-2.5 hover:opacity-90",
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
    content: CtaContent;
    surface?: CtaSurface;
}) {
    const className = ctaClasses(content.style, surface);
    if (content.href.trim() === "") {
        // A v2 button whose page was hidden or removed after it was set. The
        // flag engine told the merchant before publish; here the label draws
        // and goes nowhere, which is the honest rendering of "nowhere".
        return <span className={className}>{content.label}</span>;
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
 * `cta` v1 — a standalone, centered call-to-action.
 *
 * Rendered as a BAND in the merchant's call-to-action colour (#189) rather than
 * a button floating on the page ground. That colour is one of the six they
 * choose, and until now nothing read it.
 */
export default function CtaSection({ content }: { content: CtaContent }) {
    return (
        <section className="w-full bg-site-cta-bg px-5 py-[var(--site-section-padding)] text-center text-site-cta-fg sm:px-[var(--site-page-margin)]">
            <CtaButton content={content} surface="band" />
        </section>
    );
}
