"use client";

import { Check } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import { ring } from "../ring";
import { nextIndex } from "../roving";
import { useBrowserValue } from "../use-browser-value";
import { SectionHeading } from "./section-heading";
import { StepsFoot } from "./steps-showcase";

export interface PlayerStep {
    title: string;
    body: string;
}

/** Where the shared panel's story has got, and the visitor's moves on it. */
export interface PlayerView {
    /** The step shown (0-based). */
    step: number;
    /** The last step's change has been confirmed. */
    confirmed: boolean;
    /**
     * Moves the story to `to`; with `via`, it shows that step for a short
     * beat first (none with reduced motion).
     */
    go: (to: number, via?: number) => void;
    /** Confirms the change: the step list ends, ticked to the last. */
    confirm: () => void;
    /** Takes the confirmed change back (the card's Undo). */
    undo: () => void;
}

/** Reduced motion: a beat is skipped, its result shown at once. */
const reducedMotion = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How long a `via` step shows before the story goes on. */
export const BEAT = 900;

interface State {
    at: number;
    confirmed: boolean;
    /** Where the story goes after this step's beat. */
    then?: number;
}

/**
 * "How it works" as one conversation the visitor plays (board "overdrive",
 * #49; hands-on, owner 16 Nov): the numbered steps left with a Saffron line
 * filling down, and one large panel right whose story the visitor moves on,
 * by acting in the panel or picking a step. Nothing plays by itself. The
 * server draws the finished story (the last step, confirmed), so the HTML
 * holds all of it; with script it starts still at step 1. Reduced motion
 * skips the beats: results appear at once.
 */
export function StepsPlayer({
    id,
    title,
    lede,
    steps,
    panel,
    panelLabel,
    labels,
    note,
    foot,
    links = [],
    className,
}: {
    id: string;
    title: ReactNode;
    lede?: ReactNode;
    steps: readonly PlayerStep[];
    panel: (view: PlayerView) => ReactNode;
    /** The panel region's accessible name. */
    panelLabel: string;
    labels: { startOver: string };
    /** A small line under the panel: the demo business it is shown at. */
    note?: string;
    foot?: ReactNode;
    links?: readonly { href: string; label: string }[];
    className?: string;
}) {
    const last = steps.length - 1;
    // The server (and no script) shows the finished story; once the page's
    // script runs, the story starts at step 1 and waits for the visitor.
    const live = useBrowserValue(() => true, false);
    const [state, setS] = useState<State>({ at: 0, confirmed: false });
    const s: State = live ? state : { at: last, confirmed: true };
    const box = useRef<HTMLDivElement>(null);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const titleId = `${id}-title`;

    // A beat's step shows briefly, then the story goes on; any move cancels it.
    useEffect(() => {
        const to = s.then;
        if (to === undefined) return;
        const t = setTimeout(() => setS({ at: to, confirmed: false }), BEAT);
        return () => clearTimeout(t);
    }, [s]);

    const pick = (i: number) => setS({ at: i, confirmed: false });
    const go = (to: number, via?: number) =>
        setS(
            via === undefined || reducedMotion()
                ? { at: to, confirmed: false }
                : { at: via, confirmed: false, then: to },
        );

    const onKey = (e: KeyboardEvent, i: number) => {
        const to = nextIndex(e.key, i, steps.length);
        if (to === null) return;
        e.preventDefault();
        pick(to);
        buttons.current[to]?.focus();
    };

    const view: PlayerView = {
        step: s.at,
        confirmed: s.confirmed,
        go,
        confirm: () => setS({ at: last, confirmed: true }),
        undo: () => setS({ at: last, confirmed: false }),
    };

    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={titleId}
            className={cn("pt-12 min-[760px]:pt-[120px]", className)}
        >
            <div className="grid gap-10 min-[1080px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[1080px]:items-start min-[1080px]:gap-16">
                <div className="grid gap-7">
                    <SectionHeading
                        id={titleId}
                        title={title}
                        lead={lede}
                        size="kit-h2"
                    />
                    <ol className="m-0 grid list-none p-0">
                        {steps.map((step, i) => {
                            const on = i === s.at;
                            const done =
                                i < s.at || (s.confirmed && i === last);
                            return (
                                <li key={step.title} className="relative">
                                    {/* From this step's circle to the next: Saffron once passed. */}
                                    {i < last ? (
                                        <span
                                            aria-hidden
                                            className="absolute left-[19px] top-8 h-full w-[3px] bg-border"
                                        >
                                            <span
                                                className={cn(
                                                    "block size-full origin-top bg-brand-500 transition-transform duration-500 ease-out motion-reduce:transition-none",
                                                    done
                                                        ? "scale-y-100"
                                                        : "scale-y-0",
                                                )}
                                            />
                                        </span>
                                    ) : null}
                                    <button
                                        ref={(el) => {
                                            buttons.current[i] = el;
                                        }}
                                        type="button"
                                        aria-pressed={on}
                                        tabIndex={on ? 0 : -1}
                                        onClick={() => pick(i)}
                                        onKeyDown={(e) => onKey(e, i)}
                                        className={cn(
                                            "relative grid min-h-11 w-full cursor-pointer grid-cols-[40px_1fr] items-start gap-4 border-none bg-transparent px-0 py-3 text-left text-foreground",
                                            ring({ offset: 2 }),
                                        )}
                                    >
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "relative grid size-10 place-items-center rounded-full font-mono text-[14px] font-bold transition-colors duration-300 motion-reduce:transition-none",
                                                done
                                                    ? "bg-brand-500 text-foreground"
                                                    : on
                                                      ? "bg-foreground text-background ring-[6px] ring-brand-500/25"
                                                      : "border border-border bg-card text-muted-foreground",
                                            )}
                                        >
                                            {done ? (
                                                <Check className="size-4" />
                                            ) : (
                                                i + 1
                                            )}
                                        </span>
                                        <span className="grid gap-1 pt-2">
                                            <span
                                                className={cn(
                                                    "font-display text-[19px] font-bold leading-tight tracking-[-0.02em]",
                                                    i > s.at &&
                                                        "text-muted-foreground",
                                                )}
                                            >
                                                <span className="sr-only">
                                                    Step {i + 1}:{" "}
                                                </span>
                                                {step.title}
                                            </span>
                                            <span
                                                className={cn(
                                                    "text-[15px] leading-normal [text-wrap:pretty]",
                                                    on
                                                        ? "text-mk-copy"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {step.body}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                        {live && s.at > 0 ? (
                            <button
                                type="button"
                                onClick={() => pick(0)}
                                className={cn(
                                    "min-h-11 cursor-pointer border-none bg-transparent px-0 text-[14px] font-semibold text-foreground underline underline-offset-4",
                                    ring({ offset: 2 }),
                                )}
                            >
                                {labels.startOver}
                            </button>
                        ) : null}
                        <StepsFoot foot={foot} links={links} />
                    </div>
                </div>
                <div className="relative">
                    {/* The soft Saffron glow behind the panel. */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-6 rounded-[24px] bg-[radial-gradient(ellipse_at_60%_40%,hsl(var(--brand-500)/0.16),transparent_65%)]"
                    />
                    <div
                        ref={box}
                        role="region"
                        aria-label={panelLabel}
                        data-step-panel={s.at}
                        // A grid, so the panel fills the held height.
                        className="relative grid"
                    >
                        {panel(view)}
                    </div>
                    {note ? (
                        <p className="relative m-0 mt-3 text-[13px] text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </div>
            </div>
        </Container>
    );
}
