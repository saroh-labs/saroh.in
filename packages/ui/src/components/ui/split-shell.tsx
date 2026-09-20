import * as React from "react";

import { cn } from "../../lib/utils";
import { Wordmark } from "./wordmark";

export interface SplitShellProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * The reassurance beside the form: why this page exists, in its own words.
     *
     * It is GONE below 760px, not folded underneath — so nothing it says may
     * be the only place something is said. Treat it as a second voice, never
     * as an instruction the form depends on.
     */
    panel?: React.ReactNode;
    /**
     * A control opposite the mark — the theme pill, and nothing heavier. It
     * sits in the form column, so it survives the panel disappearing.
     */
    action?: React.ReactNode;
    /** The form, the step, whatever this page is for. */
    children: React.ReactNode;
}

/**
 * The shape every screen outside the workspace wears: a form on one side and
 * the reason for it on the other.
 *
 * Signing up and setting up run on different hosts — `accounts.saroh.in` owns
 * the account, `app.saroh.in` owns the business — but to the person doing them
 * it is one sitting. One shell in this package is what keeps them from drifting
 * into two products within a release; both apps import it rather than owning a
 * copy.
 *
 * ## The panel is inverted, not dark-scoped
 *
 * The obvious way to make an always-Ink panel is to put `dark` on it. That is
 * wrong here and the mistake has already been made once, in the rail's flyout:
 * a `dark` class re-points the tokens the element itself reads, so
 * `bg-primary` on a `dark` node resolves to Paper and the panel comes out
 * white. The panel instead uses the primary pair — Ink on a light page — and
 * RECEDES under `dark:` rather than stepping up. The design's dark table is
 * explicit about this: the form side is the surface (#1F1F1C) and the panel
 * is the shell behind it (#141412), which is our `--background`. Reaching for
 * the inset surface instead put the panel two steps the wrong way and left it
 * sitting lighter than the form it is supposed to sit behind.
 *
 * `accounts.saroh.in` has no theme provider at all (dark mode there is a
 * pre-hydration script reading the OS preference), so there is nothing to scope
 * against even if scoping were right.
 */
export function SplitShell({
    panel,
    action,
    children,
    className,
    ...props
}: SplitShellProps) {
    return (
        <div
            className={cn("flex min-h-screen w-full bg-card", className)}
            {...props}
        >
            {/* The form takes the room that is left, and its column stays
                372px wide wherever that lands — a field stretched across a
                1400px monitor is not a field, it is a horizon. The mark sits
                in the same column so it lines up with what it introduces. */}
            <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10">
                <div className="mx-auto w-full max-w-[372px]">
                    <div className="mb-8 flex items-center justify-between gap-4">
                        <Wordmark style={{ fontSize: "1rem" }} />
                        {action}
                    </div>
                    {children}
                </div>
            </div>

            {panel ? (
                <aside
                    /* Gone below 760 — the same boundary the workspace rail
                       collapses at — so one number decides what "narrow"
                       means across the product. `hidden` is display:none,
                       which takes it away from assistive technology too;
                       `sr-only` or an opacity treatment would leave it being
                       read out to exactly the people who cannot see it. */
                    className="hidden w-[38%] min-w-[320px] max-w-[560px] flex-col justify-center bg-primary px-10 py-12 text-primary-foreground dark:bg-background dark:text-foreground min-[760px]:flex"
                >
                    <div className="mx-auto w-full max-w-[392px]">{panel}</div>
                </aside>
            ) : null}
        </div>
    );
}

export interface SplitPanelProps {
    /** The small uppercase line above the heading. */
    eyebrow?: string;
    heading: React.ReactNode;
    body?: React.ReactNode;
    /** Short reassurances, each with a Saffron tick. Three is the design's count. */
    points?: React.ReactNode[];
}

/**
 * The panel's contents, so five pages cannot each invent their own spacing.
 * The words are the caller's; the shape is not.
 */
export function SplitPanel({
    eyebrow,
    heading,
    body,
    points,
}: SplitPanelProps) {
    return (
        <>
            {eyebrow ? (
                <p className="mb-[15px] text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">
                    {eyebrow}
                </p>
            ) : null}
            <p className="mb-3.5 text-pretty font-display text-[25px] font-semibold leading-[1.25] tracking-[-0.025em]">
                {heading}
            </p>
            {body ? (
                <p className="mb-6 text-pretty text-[13px] leading-[1.6] opacity-85">
                    {body}
                </p>
            ) : null}
            {points?.length ? (
                <ul className="flex flex-col gap-[11px]">
                    {points.map((point, index) => (
                        <li key={index} className="flex items-start gap-2.5">
                            <svg
                                aria-hidden
                                viewBox="0 0 24 24"
                                fill="none"
                                className="mt-0.5 size-[15px] shrink-0"
                            >
                                <path
                                    d="M4 12.5 L9.5 18 L20 6.5"
                                    stroke="hsl(var(--highlight))"
                                    strokeWidth={2.4}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <span className="text-pretty text-[12.5px] leading-[1.55] opacity-85">
                                {point}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </>
    );
}
