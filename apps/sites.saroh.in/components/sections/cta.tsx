import Link from "next/link";

import type { CtaContent } from "@/lib/publication";
import { cn } from "@/lib/utils";

/**
 * Tailwind classes for a CTA by visual style. Shared by the standalone `cta`
 * section and the `hero` section's embedded button.
 */
export function ctaClasses(style: CtaContent["style"]): string {
    const base =
        "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-400";
    switch (style) {
        case "secondary":
            return cn(
                base,
                "px-5 py-2.5 border border-stone-300 text-stone-900 hover:bg-stone-100 dark:border-stone-700 dark:text-white dark:hover:bg-stone-800",
            );
        case "link":
            return cn(
                base,
                "underline underline-offset-4 text-stone-900 hover:text-stone-600 dark:text-white dark:hover:text-stone-300",
            );
        case "primary":
        default:
            return cn(
                base,
                "px-5 py-2.5 bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200",
            );
    }
}

/** True for an off-site (absolute) href — rendered as a plain anchor. */
function isExternal(href: string): boolean {
    return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:");
}

/** A single CTA button/link, used standalone and embedded in the hero. */
export function CtaButton({ content }: { content: CtaContent }) {
    const className = ctaClasses(content.style);
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

/** `cta` v1 — a standalone, centered call-to-action button. */
export default function CtaSection({ content }: { content: CtaContent }) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-12 text-center sm:px-8">
            <CtaButton content={content} />
        </section>
    );
}
