import type { LookId } from "@saroh/block-contract";
import type { ReactNode } from "react";

import { cn } from "./lib/utils";

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
    look,
    mark,
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
    /**
     * Folio, Quiet or Live (DEC-172, plan U15): the page as that look's
     * board draws it ({@link LookPageMessage}). Absent is Classic, drawn
     * exactly as before.
     */
    look?: LookId;
    /** A look's large mark beside the words ("404"); decoration only. */
    mark?: string;
}) {
    if (look) {
        return (
            <LookPageMessage
                look={look}
                eyebrow={eyebrow}
                title={title}
                actions={actions}
                note={note}
                fill={fill}
                mark={mark}
            >
                {children}
            </LookPageMessage>
        );
    }
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

/** Each look's type for a state page, as its boards draw it (VA26, VD26, VB26). */
export const LOOK_PAGE: Record<
    LookId,
    { eyebrow: string; title: string; lead: string; mark: string }
> = {
    folio: {
        eyebrow:
            "text-[12px] font-semibold uppercase tracking-[0.18em] text-site-muted",
        title: "font-site-heading text-[calc(40px*var(--site-heading-scale,1))] font-light leading-[1.04] tracking-[-0.03em] text-site-fg [text-wrap:balance] min-[700px]:text-[calc(64px*var(--site-heading-scale,1))]",
        lead: "font-site-heading text-[20px] font-light leading-[1.38] text-site-body [text-wrap:pretty] min-[700px]:text-[26px]",
        mark: "font-site-heading text-[72px] font-light leading-[0.9] tracking-[-0.04em] text-site-fg tabular-nums min-[700px]:text-[120px]",
    },
    quiet: {
        eyebrow:
            "text-[12px] font-medium uppercase tracking-[0.22em] text-site-muted",
        title: "font-site-heading text-[calc(40px*var(--site-heading-scale,1))] font-normal leading-[1.08] tracking-[-0.01em] text-site-fg [text-wrap:balance] [font-variant-numeric:lining-nums] min-[700px]:text-[calc(60px*var(--site-heading-scale,1))] min-[700px]:font-light",
        lead: "text-[17px] leading-[1.6] text-site-body [text-wrap:pretty] min-[700px]:text-[19px]",
        mark: "font-site-heading text-[96px] font-light leading-[0.9] text-site-accent-text [font-variant-numeric:lining-nums] min-[700px]:text-[160px]",
    },
    live: {
        eyebrow: "text-[13px] font-bold tracking-[0.02em] text-site-muted",
        title: "font-site-heading text-[calc(36px*var(--site-heading-scale,1))] font-extrabold leading-none tracking-[-0.03em] text-site-fg [font-stretch:80%] [text-wrap:balance] min-[700px]:text-[calc(56px*var(--site-heading-scale,1))]",
        lead: "text-[17px] leading-[1.5] text-site-body [text-wrap:pretty]",
        mark: "font-site-heading text-[44px] font-extrabold leading-[0.9] tracking-[-0.035em] text-site-accent-text [font-stretch:80%] tabular-nums min-[700px]:text-[96px]",
    },
};

/**
 * A state page under a look (DEC-172, plan U15, #1108): the 404, the page
 * that didn't load, a page taken off. The board's layout: the large mark
 * (the 404) beside the words on a desk, above them on a phone; the heading
 * in the look's display type; one sentence; the ways on, of which the
 * caller makes at most one filled. In the page column, from `--site-*`
 * only, inside the craft layer (`data-site-page`).
 */
function LookPageMessage({
    look,
    eyebrow,
    title,
    children,
    actions,
    note,
    fill,
    mark,
}: {
    look: LookId;
    eyebrow: string;
    title: ReactNode;
    children: ReactNode;
    actions?: ReactNode;
    note?: ReactNode;
    fill: boolean;
    mark?: string;
}) {
    const type = LOOK_PAGE[look];
    return (
        <main
            data-site-page=""
            data-site-state-look={look}
            className={cn(
                "max-w-site-content mx-auto flex w-full flex-col justify-center px-[var(--site-page-margin,20px)] pb-16 pt-14 min-[700px]:pb-40 min-[700px]:pt-32",
                fill ? "min-h-screen" : "min-h-[60vh]",
            )}
        >
            <div
                className={cn(
                    "grid gap-8",
                    mark &&
                        "min-[700px]:grid-cols-[5fr_7fr] min-[700px]:items-start min-[700px]:gap-[72px]",
                )}
            >
                {mark ? (
                    <p aria-hidden="true" className={type.mark}>
                        {mark}
                    </p>
                ) : null}
                <div className="grid max-w-[40rem] gap-5">
                    <p className={type.eyebrow}>{eyebrow}</p>
                    <h1 className={type.title}>{title}</h1>
                    <p className={cn("max-w-[52ch]", type.lead)}>{children}</p>
                    {actions ? (
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                            {actions}
                        </div>
                    ) : null}
                    {note ? (
                        <p className="font-site-mono text-site-muted text-xs">
                            {note}
                        </p>
                    ) : null}
                </div>
            </div>
        </main>
    );
}
