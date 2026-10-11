import * as React from "react";

import type { SarohLink } from "../../lib/saroh-links";
import { sarohFooterLinks } from "../../lib/saroh-links";
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
    /** The form, the step, whatever this page is for. */
    children: React.ReactNode;
    /**
     * The quiet line under the form. Defaults to {@link SplitFooter}: Privacy,
     * Terms and Help. Pass `null` only for a screen that must not link out.
     */
    footer?: React.ReactNode;
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
 * ## There is no theme control here, deliberately
 *
 * There was one, briefly. It came off because it could not keep its promise:
 * `next-themes` stores the choice in `localStorage`, which is per-origin, so a
 * choice made on `accounts.saroh.in` does not reach `app.saroh.in`. It looked
 * like a preference and behaved like a page-local override that expired one
 * navigation later.
 *
 * Both hosts now default to `system`, so these screens follow the machine, and
 * the explicit choice lives where a preference belongs — the workspace user
 * menu's Appearance submenu, which persists for the person rather than for the
 * page. This is also what the rest of the industry does: of fourteen SaaS
 * sign-in screens surveyed, none carried a theme control, and WorkOS ships
 * "System" as the default appearance for the auth pages it hosts.
 *
 * If a control comes back here, it needs somewhere to write that both hosts
 * can read — the user record, not the browser.
 */
export function SplitShell({
    panel,
    children,
    footer = <SplitFooter />,
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
            <div className="flex flex-1 flex-col px-6 sm:px-10">
                <div className="flex flex-1 flex-col justify-center py-12">
                    <div className="mx-auto w-full max-w-[372px]">
                        {/* The mark, and then the page. There was a theme
                            pill opposite it; it is gone, along with the slot
                            that held it, because a slot nothing fills is an
                            invitation to put something there. See the theme
                            note below. */}
                        <div className="mb-8">
                            <Wordmark style={{ fontSize: "1rem" }} />
                        </div>
                        {children}
                    </div>
                </div>
                {/* In the form's column, not the panel's: the panel is gone
                    below 760px, and Privacy, Terms and Help have to be
                    reachable on a phone too. */}
                {footer ? (
                    <div className="mx-auto w-full max-w-[372px] pb-6">
                        {footer}
                    </div>
                ) : null}
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

/**
 * Privacy · Terms · Help: the one quiet line under every screen from
 * signing up to Home, which had no way to any of them (UX audit, 10 Oct).
 * Each opens Saroh's own page (`lib/saroh-links.ts`), and only those that
 * are published are drawn.
 *
 * Quiet in colour and size, not in reach: each link is a full-height target
 * on a phone (`py-2.5`, with the gap between them).
 */
export function SplitFooter({
    links = sarohFooterLinks(),
    className,
}: {
    links?: SarohLink[];
    className?: string;
}) {
    if (links.length === 0) return null;
    return (
        <nav
            aria-label="Legal and help"
            className={cn(
                "flex flex-wrap items-center gap-x-1 text-[12px] text-muted-foreground",
                className,
            )}
        >
            {links.map((link, index) => (
                <React.Fragment key={link.href}>
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <a
                        href={link.href}
                        className="rounded-sm px-1.5 py-2.5 underline-offset-4 transition-colors first:pl-0 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground"
                    >
                        {link.label}
                    </a>
                </React.Fragment>
            ))}
        </nav>
    );
}

export interface SplitPanelProps {
    /** The small uppercase line above the heading. */
    eyebrow?: string;
    heading: React.ReactNode;
    body?: React.ReactNode;
    /** Short reassurances, each with a Saffron tick. Three is the design's count. */
    points?: React.ReactNode[];
    /**
     * The plan, as numbered steps: what the person is doing now and what
     * comes after. Drawn in place of ticks, because a tick beside a step
     * still ahead says it is done.
     */
    steps?: React.ReactNode[];
    /** Which of `steps` they are on, from 1. Earlier ones are ticked. */
    currentStep?: number;
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
    steps,
    currentStep = 1,
}: SplitPanelProps) {
    return (
        <>
            {eyebrow ? (
                // The panel's own colour: `.label` is muted Ink, which on
                // the dark panel is dark on dark.
                <p className="label mb-[15px] text-inherit opacity-70">
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
            {steps?.length ? (
                <ol className="mb-6 flex flex-col gap-[11px] last:mb-0">
                    {steps.map((step, index) => {
                        const number = index + 1;
                        const done = number < currentStep;
                        const current = number === currentStep;
                        return (
                            <li
                                key={index}
                                aria-current={current ? "step" : undefined}
                                className="flex items-start gap-2.5"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border border-current text-[10.5px] font-semibold tabular-nums",
                                        current ? "opacity-100" : "opacity-60",
                                    )}
                                >
                                    {done ? (
                                        <Tick className="size-3" />
                                    ) : (
                                        number
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        "text-pretty text-[12.5px] leading-[1.55]",
                                        current
                                            ? "font-semibold"
                                            : "opacity-85",
                                    )}
                                >
                                    {/* The badge is decoration to a screen
                                        reader, so the place in the plan is
                                        said here in words. */}
                                    <span className="sr-only">
                                        {done
                                            ? "Done: "
                                            : current
                                              ? "Now: "
                                              : "Next: "}
                                    </span>
                                    {step}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            ) : null}
            {points?.length ? (
                <ul className="flex flex-col gap-[11px]">
                    {points.map((point, index) => (
                        <li key={index} className="flex items-start gap-2.5">
                            <Tick className="mt-0.5 size-[15px] shrink-0" />
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

/** The Saffron tick beside a reassurance, and inside a finished step. */
function Tick({ className }: { className?: string }) {
    return (
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className={className}>
            <path
                d="M4 12.5 L9.5 18 L20 6.5"
                stroke="hsl(var(--highlight))"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
