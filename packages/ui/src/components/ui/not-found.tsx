import Link from "next/link";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

/**
 * Saroh's "not here" page, for every Saroh-branded app (never `saroh.app`,
 * whose 404s are the merchant's and draw from `--site-*`).
 *
 * Before this each app either had a one-off 404 or fell through to Next's
 * default black "404 | This page could not be found.", which reads as a
 * crash, not as a wrong turn. The shape is one everywhere, so a person who
 * meets it in the workspace, the console or on saroh.in knows it on sight:
 *
 *   eyebrow   "404", Saffron text (the screen's one accent), mono because it
 *             is a code, not a label
 *   heading   the display face, plain words ("Page not found")
 *   sentence  what most likely happened
 *   actions   the obvious home for that surface, and at most one more
 *
 * Two shapes:
 *
 * - `page` — the whole page is the 404: an app root, the workspace shell's
 *   work area, the console, the marketing site. Centred, with an eyebrow.
 * - `card` — a record that isn't here, under its own page's crumbs: the
 *   workspace designs' dashed card, quieter type and an outline way back,
 *   and no eyebrow unless one is asked for.
 *
 * The app keeps its own chrome around it (the rail, the console shell, the
 * marketing nav and footer). `mark` puts something above the words — the
 * wordmark on a page with no chrome — and `children` below the actions.
 *
 * No illustration and no joke: someone who has lost their way wants the way
 * on, and on a phone the actions stack full width, each at least 44px under a
 * finger (the Button's `coarse:` sizes).
 */

export interface NotFoundAction {
    href: string;
    label: string;
}

export interface NotFoundProps extends Omit<
    React.HTMLAttributes<HTMLElement>,
    "title"
> {
    title: React.ReactNode;
    description: React.ReactNode;
    /** The obvious way on — that surface's home, or the list a record is in. */
    primary: NotFoundAction;
    /** At most one more. */
    secondary?: NotFoundAction;
    /** Defaults to "404" on a page and to none on a card; `null` hides it. */
    eyebrow?: React.ReactNode | null;
    variant?: "page" | "card";
    /** Above the words, for a page that draws no chrome (the wordmark). */
    mark?: React.ReactNode;
    /** The heading's level: 1 unless the page already has an `h1`. */
    level?: 1 | 2;
}

export function NotFound({
    title,
    description,
    primary,
    secondary,
    eyebrow,
    variant = "page",
    mark,
    level = 1,
    className,
    children,
    ...props
}: NotFoundProps) {
    const headingId = React.useId();
    const Heading = level === 1 ? "h1" : "h2";
    const card = variant === "card";
    const shownEyebrow =
        eyebrow === undefined ? (card ? null : "404") : eyebrow;

    return (
        <section
            aria-labelledby={headingId}
            data-not-found={variant}
            // Fixed words: a recording may read them.
            data-ph-unmask=""
            className={cn(
                "mx-auto flex w-full min-w-0 flex-col items-center text-center",
                card
                    ? // The workspace designs' not-found card: dashed, 12px,
                      // a strong edge so it reads on white and on the ground.
                      "gap-[9px] rounded-[12px] border border-dashed border-border-strong px-5 py-[34px]"
                    : // The page shape: enough of the screen that the words
                      // sit where the eye lands, never so much that a phone
                      // has to scroll to reach the button.
                      "max-w-[34rem] gap-3 px-4 py-16 sm:py-24",
                className,
            )}
            {...props}
        >
            {mark ? <div className={card ? "mb-1" : "mb-5"}>{mark}</div> : null}
            {shownEyebrow ? (
                <p className="font-mono text-[12px] font-semibold uppercase leading-none tracking-[0.1em] text-brand">
                    {shownEyebrow}
                </p>
            ) : null}
            <Heading
                id={headingId}
                className={cn(
                    "text-balance font-display font-semibold text-foreground",
                    card
                        ? "text-[17px] tracking-[-0.02em]"
                        : "text-[28px] leading-[1.15] tracking-[-0.03em] sm:text-[34px]",
                )}
            >
                {title}
            </Heading>
            <p
                className={cn(
                    // A step darker than meta text on light: this is the
                    // sentence someone reads to know what happened.
                    "mx-auto text-pretty text-neutral-600 dark:text-muted-foreground",
                    card
                        ? "max-w-[46ch] text-[13px] leading-[1.55]"
                        : "max-w-[44ch] text-[15px] leading-[1.6]",
                )}
            >
                {description}
            </p>
            <div
                className={cn(
                    "flex justify-center gap-2",
                    card
                        ? // A record's way back stays the quiet button it is.
                          "mt-1.5 flex-wrap items-center"
                        : // A page's actions stack full width on a phone,
                          // where the thumb is, and sit side by side after.
                          "mt-4 w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center",
                )}
            >
                <Button
                    asChild
                    variant={card ? "outline" : "default"}
                    size={card ? "sm" : "default"}
                >
                    <Link href={primary.href}>{primary.label}</Link>
                </Button>
                {secondary ? (
                    <Button
                        asChild
                        variant={card ? "ghost" : "outline"}
                        size={card ? "sm" : "default"}
                    >
                        <Link href={secondary.href}>{secondary.label}</Link>
                    </Button>
                ) : null}
            </div>
            {children}
        </section>
    );
}
