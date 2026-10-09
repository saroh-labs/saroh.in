import Link from "next/link";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

/**
 * Saroh's "this didn't load" page, the 5xx twin of `@saroh/ui/not-found`, for
 * every Saroh-branded app's `error.tsx` (never `saroh.app`, whose pages are
 * the merchant's and draw from `--site-*`).
 *
 * The same shape as the 404, so it reads as one family:
 *
 *   eyebrow   "500" (or "503"), Saffron, mono because it is a code
 *   heading   the display face, plain words ("Something went wrong")
 *   sentence  what happened in a visitor's words; it says nothing was lost
 *             only when the caller knows that is true
 *   actions   Try again (Next's `retry`), then the surface's home
 *   reference Next's digest, the one handle support can look up
 *
 * Never the error's message or stack: in production Next has already
 * replaced a server error's message with the digest, and a client error's
 * message is ours, not the visitor's. The boundary reports the error with
 * `reportError` before rendering this.
 *
 * `unavailable` is the "back shortly" page (503): the service is busy or
 * being updated rather than broken.
 *
 * The app keeps its own chrome around it; `mark` puts the wordmark above the
 * words on a page with none. When even the root layout failed, Next renders
 * `global-error.tsx` instead, which uses `CrashDocument` (no CSS loaded).
 */

export interface ErrorPageAction {
    href: string;
    label: string;
}

export interface ErrorPageProps extends Omit<
    React.HTMLAttributes<HTMLElement>,
    "title"
> {
    /** Next's `retry`: fetches and renders the segment again. Omit and there is no Try again. */
    onRetry?: () => void;
    /** The way home for that surface. */
    home?: ErrorPageAction;
    /** Next's `error.digest`, shown as the reference. */
    digest?: string;
    kind?: "error" | "unavailable";
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** Defaults to "500" ("503" when unavailable); `null` hides it. */
    eyebrow?: React.ReactNode | null;
    /** Above the words, for a page that draws no chrome (the wordmark). */
    mark?: React.ReactNode;
    /** The heading's level: 1 unless the page already has an `h1`. */
    level?: 1 | 2;
}

export const ERROR_PAGE_COPY = {
    error: {
        eyebrow: "500",
        title: "Something went wrong",
        description:
            "This page didn’t load. It’s usually temporary, so try again in a moment.",
    },
    unavailable: {
        eyebrow: "503",
        title: "Back shortly",
        description:
            "Saroh is busy or being updated right now. Try again in a minute.",
    },
} as const;

export function ErrorPage({
    onRetry,
    home,
    digest,
    kind = "error",
    title,
    description,
    eyebrow,
    mark,
    level = 1,
    className,
    children,
    ...props
}: ErrorPageProps) {
    const headingId = React.useId();
    const Heading = level === 1 ? "h1" : "h2";
    const copy = ERROR_PAGE_COPY[kind];
    const shownEyebrow = eyebrow === undefined ? copy.eyebrow : eyebrow;

    return (
        <section
            aria-labelledby={headingId}
            data-error-page={kind}
            className={cn(
                "mx-auto flex w-full min-w-0 max-w-[34rem] flex-col items-center gap-3 px-4 py-16 text-center sm:py-24",
                className,
            )}
            {...props}
        >
            {mark ? <div className="mb-5">{mark}</div> : null}
            {shownEyebrow ? (
                <p className="font-mono text-[12px] font-semibold uppercase leading-none tracking-[0.1em] text-brand">
                    {shownEyebrow}
                </p>
            ) : null}
            <Heading
                id={headingId}
                className="text-balance font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[34px]"
            >
                {title ?? copy.title}
            </Heading>
            <p className="mx-auto max-w-[44ch] text-pretty text-[15px] leading-[1.6] text-neutral-600 dark:text-muted-foreground">
                {description ?? copy.description}
            </p>
            {onRetry || home ? (
                <div className="mt-4 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
                    {onRetry ? (
                        <Button type="button" onClick={onRetry}>
                            Try again
                        </Button>
                    ) : null}
                    {home ? (
                        <Button
                            asChild
                            variant={onRetry ? "outline" : "default"}
                        >
                            <Link href={home.href}>{home.label}</Link>
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {digest ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Reference: {digest}
                </p>
            ) : null}
            {children}
        </section>
    );
}
