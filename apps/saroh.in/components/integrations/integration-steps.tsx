"use client";

import { cn } from "@/lib/cn";
import type { KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import type { IntegrationStep } from "@/content/integrations";

/**
 * "Connect it in N steps" (Integrations › provider design): the steps as a
 * list of buttons beside a drawing of the screen each one happens on. The
 * chosen step is `aria-current="step"`; Up/Down (or Left/Right), Home and
 * End move between them as well as Tab and a click. Every step's drawing is
 * in the page, only the chosen one shown, so the words are there without
 * script too.
 *
 * The drawing is words and boxes, not a screenshot: it says "Settings ›
 * Providers" and the fields' own labels, so it reads the same as the app.
 */
export function IntegrationSteps({
    steps,
    panelPath,
    initialStep = 0,
}: {
    steps: readonly IntegrationStep[];
    /** The panel's breadcrumb, as the app names the screens. */
    panelPath: readonly string[];
    initialStep?: number;
}) {
    const [current, setCurrent] = useState(initialStep);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const baseId = useId();

    function go(next: number) {
        const i = (next + steps.length) % steps.length;
        setCurrent(i);
        buttons.current[i]?.focus();
    }

    function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
        const moves: Partial<Record<string, number>> = {
            ArrowDown: i + 1,
            ArrowRight: i + 1,
            ArrowUp: i - 1,
            ArrowLeft: i - 1,
            Home: 0,
            End: steps.length - 1,
        };
        const next = moves[e.key];
        if (next === undefined) return;
        e.preventDefault();
        go(next);
    }

    return (
        <div className="mx-auto grid w-full max-w-[1040px] grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-7">
            <ol aria-label="Steps" className="m-0 grid list-none gap-1.5 p-0">
                {steps.map((step, i) => {
                    const on = i === current;
                    return (
                        <li key={step.title}>
                            <button
                                ref={(el) => {
                                    buttons.current[i] = el;
                                }}
                                type="button"
                                aria-current={on ? "step" : undefined}
                                aria-controls={`${baseId}-panel-${i}`}
                                onClick={() => setCurrent(i)}
                                onKeyDown={(e) => onKeyDown(e, i)}
                                className={cn(
                                    "flex w-full cursor-pointer items-center gap-3.5 rounded-mk-btn border px-4 py-3.5 text-left transition-[background-color,border-color,color] duration-fast ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.99]",
                                    on
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border bg-card text-foreground hover:border-border-strong",
                                )}
                            >
                                <span
                                    className={cn(
                                        "font-mono text-[13px]",
                                        on
                                            ? "text-mk-saffron"
                                            : "text-brand-700",
                                    )}
                                >
                                    <span className="sr-only">Step </span>
                                    {i + 1}
                                </span>
                                <span className="text-[15px] font-semibold">
                                    {step.title}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            <div>
                {steps.map((step, i) => (
                    <div
                        key={step.title}
                        id={`${baseId}-panel-${i}`}
                        hidden={i !== current}
                        className={cn(
                            "gap-3.5",
                            i === current ? "grid" : "hidden",
                        )}
                    >
                        <StepPanel step={step} path={panelPath} n={i + 1} />
                        <p className="m-0 max-w-[62ch] text-[16px] leading-[1.65] text-mk-prose [text-wrap:pretty]">
                            {step.body}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

const NOTE_TONE = {
    muted: "text-muted-foreground",
    ok: "text-mk-ok",
    required: "text-brand-700",
} as const;

/** The drawing of the screen a step happens on. */
function StepPanel({
    step,
    path,
    n,
}: {
    step: IntegrationStep;
    path: readonly string[];
    n: number;
}) {
    return (
        <figure
            aria-label={`Step ${n} in ${path.join(" › ")}`}
            className="m-0 overflow-hidden rounded-[14px] border border-border bg-card shadow-mk-panel"
        >
            <div className="flex flex-wrap gap-2 border-b border-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
                {path.map((part, i) => (
                    <span key={part} className="contents">
                        {i > 0 ? <span aria-hidden>›</span> : null}
                        <span
                            className={cn(
                                i === 0 && "font-semibold text-foreground",
                            )}
                        >
                            {part}
                        </span>
                    </span>
                ))}
            </div>
            <div className="grid min-h-[230px] content-start gap-3 p-[22px]">
                {step.rows.map((row) => (
                    <div key={row.label} className="grid gap-[5px]">
                        <span className="text-[12.5px] font-semibold text-muted-foreground">
                            {row.label}
                        </span>
                        <div
                            className={cn(
                                "flex min-h-10 items-center justify-between gap-3 rounded-mk-control border px-3 py-2 text-[14px]",
                                row.done ? "border-mk-ok" : "border-border",
                                row.mono && "font-mono",
                            )}
                        >
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                {row.value}
                            </span>
                            {row.note ? (
                                <span
                                    className={cn(
                                        "shrink-0 font-sans text-[12px] font-semibold",
                                        NOTE_TONE[row.tone],
                                    )}
                                >
                                    {row.note}
                                </span>
                            ) : null}
                        </div>
                    </div>
                ))}
                {step.cta ? (
                    <span
                        aria-hidden
                        className="inline-flex h-9 items-center justify-self-end rounded-mk-control bg-foreground px-4 text-[13.5px] font-semibold text-background"
                    >
                        {step.cta}
                    </span>
                ) : null}
            </div>
        </figure>
    );
}
