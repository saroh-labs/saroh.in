"use client";

import { Check } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../buttons/button";
import { cn } from "../cn";
import { Container } from "../layout/container";
import { ring } from "../ring";
import { nextIndex } from "../roving";
import { SectionHeading } from "./section-heading";
import { StepsFoot } from "./steps-showcase";

export interface PlayerStep {
    title: string;
    body: string;
    /** How long its part of the story plays, in ticks of `TICK` ms. */
    ticks: number;
}

/** Where the shared panel's story has got. */
export interface PlayerView {
    /** The step playing (0-based). */
    step: number;
    /** How far through that step's part, 0 to 1. */
    progress: number;
    /** The last step's change has been confirmed. */
    confirmed: boolean;
    /** Confirms it: the panel's button calls this, and stops autoplay. */
    confirm: () => void;
}

const TICK = 80;

interface State {
    at: number;
    tick: number;
    auto: boolean;
    confirmed: boolean;
}

/** One tick of autoplay: run the step, confirm on the last, then go round. */
export function advance(s: State, ticks: readonly number[]): State {
    const len = ticks[s.at] ?? 1;
    if (s.tick < len) return { ...s, tick: s.tick + 1 };
    const last = s.at === ticks.length - 1;
    if (last && !s.confirmed) return { ...s, confirmed: true, tick: 0 };
    return {
        ...s,
        at: last ? 0 : s.at + 1,
        tick: 0,
        confirmed: last ? false : s.confirmed,
    };
}

/**
 * "How it works" as one conversation played through (board "overdrive",
 * #49): the numbered steps left with a Saffron line filling down, and one
 * large panel right whose story every step moves on. The server draws the
 * finished story (the last step, confirmed), so the HTML holds all of it.
 * On the client, with motion allowed, it starts again from step 1 and plays
 * while the section is on screen and the tab is visible. Picking a step
 * jumps there and stops autoplay; reduced motion keeps the finished story.
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
    labels: { pause: string; play: string };
    /** A small line under the panel: the demo business it is shown at. */
    note?: string;
    foot?: ReactNode;
    links?: readonly { href: string; label: string }[];
    className?: string;
}) {
    const ticks = steps.map((s) => s.ticks);
    const last = steps.length - 1;
    const [s, setS] = useState<State>({
        at: last,
        tick: ticks[last] ?? 0,
        auto: false,
        confirmed: true,
    });
    const [motion, setMotion] = useState(false);
    const [seen, setSeen] = useState(false);
    const [awake, setAwake] = useState(true);
    const [minH, setMinH] = useState<number>();
    const section = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const titleId = `${id}-title`;

    useEffect(() => {
        const mq =
            typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
                : null;
        if (!mq || mq.matches) return;
        // shortcut: the finished story's height, held so playing never moves the page; not re-measured on resize.
        setMinH(box.current?.offsetHeight);
        setMotion(true);
        setS({ at: 0, tick: 0, auto: true, confirmed: false });

        const onVis = () => setAwake(!document.hidden);
        document.addEventListener("visibilitychange", onVis);
        const el = section.current;
        let io: IntersectionObserver | undefined;
        if (el && typeof IntersectionObserver !== "undefined") {
            io = new IntersectionObserver(([e]) =>
                setSeen(Boolean(e.isIntersecting)),
            );
            io.observe(el);
        } else setSeen(true);
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            io?.disconnect();
        };
    }, []);

    const running = motion && s.auto && seen && awake;
    const key = ticks.join();
    useEffect(() => {
        if (!running) return;
        const lens = key.split(",").map(Number);
        const t = setInterval(() => setS((x) => advance(x, lens)), TICK);
        return () => clearInterval(t);
    }, [running, key]);

    const pick = (i: number) =>
        setS({ at: i, tick: ticks[i] ?? 0, auto: false, confirmed: false });

    const onKey = (e: KeyboardEvent, i: number) => {
        const to = nextIndex(e.key, i, steps.length);
        if (to === null) return;
        e.preventDefault();
        pick(to);
        buttons.current[to]?.focus();
    };

    const view: PlayerView = {
        step: s.at,
        progress: Math.min(1, s.tick / (ticks[s.at] || 1)),
        confirmed: s.confirmed,
        confirm: () => setS((x) => ({ ...x, confirmed: true, auto: false })),
    };

    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={titleId}
            className={cn("pt-12 min-[760px]:pt-[120px]", className)}
        >
            <div
                ref={section}
                className="grid gap-10 min-[1080px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[1080px]:items-start min-[1080px]:gap-16"
            >
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
                            const done = i < s.at;
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
                        {motion ? (
                            <Button
                                variant="secondary"
                                size="kit"
                                onClick={() =>
                                    setS((x) => ({ ...x, auto: !x.auto }))
                                }
                            >
                                {s.auto ? labels.pause : labels.play}
                            </Button>
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
                        style={minH ? { minHeight: minH } : undefined}
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
