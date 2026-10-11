import type { ReactNode } from "react";

/**
 * A page of the site's own that holds no block: "We can't find that page",
 * "This page isn't loading", "There's no website at this address". One
 * frame for the family, so a visitor who meets two of them meets one look.
 *
 * Held to the same bar as a block: the site's heading face at a display
 * size that runs with the screen and the merchant's heading scale, the
 * tracking drawn in and the lines balanced; a sentence in the body face at
 * the template's body size and a width that reads; a section's own padding
 * above and below, from the merchant's Section padding. It sits on the
 * page's left edge, in the column and margins the header's name sits in,
 * rather than floating in the middle of the screen.
 *
 * `data-site-page` puts it inside the craft layer (`site-craft.ts`): its
 * links and buttons get the site's focus ring and easing.
 *
 * Drawn from `--site-*` only. No `"use client"`: a server page draws it,
 * and so does an error boundary in the browser.
 */
export function SitePageMessage({
    eyebrow,
    title,
    children,
    actions,
    note,
    fill = false,
}: {
    /** What kind of page this is, small, above the heading. */
    eyebrow: string;
    /** The page's `h1`. */
    title: ReactNode;
    /** One sentence under the heading. */
    children: ReactNode;
    /** The ways on: buttons in the site's own look (`ctaClasses`). */
    actions?: ReactNode;
    /** A small line under the ways on (an error's reference). */
    note?: ReactNode;
    /** Fill the screen: where there is no header or footer around it. */
    fill?: boolean;
}) {
    return (
        <main
            data-site-page=""
            className={`max-w-site-content mx-auto flex w-full flex-col justify-center px-5 py-[calc(var(--site-section-padding,52px)*1.5)] sm:px-[var(--site-page-margin,38px)] ${fill ? "min-h-screen" : "min-h-[60vh]"}`}
        >
            <div className="max-w-[40rem]">
                {/* The body colour, not the quiet one: at this size the
                    quiet colour of an unstyled site is under 4.5:1. */}
                <p className="font-site-mono text-site-body text-xs font-medium uppercase tracking-[0.16em]">
                    {eyebrow}
                </p>
                <h1 className="font-site-heading text-site-fg mt-4 text-balance text-[calc(clamp(2rem,5vw_+_0.75rem,3.25rem)*var(--site-heading-scale,1))] font-semibold leading-[1.05] tracking-[-0.03em]">
                    {title}
                </h1>
                <p className="text-site-body mt-4 max-w-[52ch] text-pretty text-[length:var(--site-body-size,1rem)] leading-relaxed">
                    {children}
                </p>
                {actions ? (
                    <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        {actions}
                    </div>
                ) : null}
                {note ? (
                    <p className="font-site-mono text-site-body mt-6 text-xs">
                        {note}
                    </p>
                ) : null}
            </div>
        </main>
    );
}
