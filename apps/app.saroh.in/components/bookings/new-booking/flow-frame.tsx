"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import type { Step } from "@/lib/services/new-booking";
import { QUESTION, STEP_COUNT, STEP_NAME } from "@/lib/services/new-booking";

/** A picked value the phone header shows, to change it in one tap. */
export interface Crumb {
    label: string;
    onPress: () => void;
}

/** One line of the desk's step list. */
export interface RailStep {
    n: Step;
    key: string;
    value: string;
    /** Earlier steps jump back; later ones wait. */
    onPress: (() => void) | null;
}

/**
 * The phone's header (BKMNewBooking): Back, "Step 2 of 5 · Service", the
 * question, a bar for each step and the choices so far as chips that
 * change them. Room is left on the right for the sheet's own close.
 */
export function PhoneHeader({
    step,
    onBack,
    crumbs,
    headingRef,
}: {
    step: Step;
    onBack: (() => void) | null;
    crumbs: readonly Crumb[];
    headingRef: RefObject<HTMLHeadingElement | null>;
}) {
    return (
        <div className="shrink-0 border-b border-border bg-background px-2 pb-2.5 pt-2 min-[760px]:hidden">
            <div className="flex min-h-11 items-center gap-1 pr-12">
                {onBack ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Back"
                        className="size-11 shrink-0"
                        onClick={onBack}
                    >
                        <ArrowLeft className="size-5" />
                    </Button>
                ) : null}
                <div className={cn("min-w-0 flex-1", !onBack && "pl-2")}>
                    <p className="text-[12px] font-semibold text-muted-foreground">
                        Step {step} of {STEP_COUNT} · {STEP_NAME[step]}
                    </p>
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        className="mt-0.5 font-display text-[21px] font-semibold tracking-[-0.02em] outline-none"
                    >
                        {QUESTION[step]}
                    </h2>
                </div>
            </div>
            <div aria-hidden className="mx-2 mt-2 flex gap-1">
                {Array.from({ length: STEP_COUNT }, (_, i) => (
                    <span
                        key={i}
                        className={cn(
                            "h-1 flex-1 rounded-full",
                            i < step ? "bg-foreground" : "bg-border",
                        )}
                    />
                ))}
            </div>
            {crumbs.length > 0 ? (
                <div className="-mx-2 mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                    {crumbs.map((c) => (
                        <button
                            key={c.label}
                            type="button"
                            data-ph-mask=""
                            aria-label={`Change ${c.label}`}
                            onClick={c.onPress}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                        >
                            {c.label}
                            <Pencil aria-hidden className="size-[13px]" />
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** The desk's header (BKDNewBooking): "New booking · Step 2 of 5 · Service". */
export function DeskHeader({ step }: { step: Step | null }) {
    return (
        <div className="hidden shrink-0 items-baseline gap-3.5 border-b border-border px-6 pb-3.5 pr-16 pt-[18px] min-[760px]:flex">
            <p className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                New booking
            </p>
            {step ? (
                <span className="text-[13px] text-muted-foreground">
                    Step {step} of {STEP_COUNT} · {STEP_NAME[step]}
                </span>
            ) : null}
        </div>
    );
}

/**
 * The desk's step list (BKDNewBooking): Who, What, With, When, Pay and
 * book, each with what is chosen. It doubles as the check card, and an
 * earlier step is a button back to it.
 */
export function StepRail({
    step,
    steps,
    note,
}: {
    step: Step;
    steps: readonly RailStep[];
    /** Under the list: why money is out of reach, for the front desk. */
    note: ReactNode;
}) {
    return (
        <nav
            aria-label="Steps"
            className="hidden min-h-0 overflow-y-auto border-r border-border bg-muted/40 px-2.5 py-3.5 min-[760px]:block"
        >
            <ol className="grid gap-1">
                {steps.map((s) => {
                    const on = s.n === step;
                    const done = s.n < step;
                    const inner = (
                        <>
                            <span
                                aria-hidden
                                className={cn(
                                    "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] font-bold",
                                    done
                                        ? "border-foreground bg-foreground text-background"
                                        : on
                                          ? "border-foreground text-foreground"
                                          : "border-border-strong text-muted-foreground",
                                )}
                            >
                                {done ? <Check className="size-3" /> : s.n}
                            </span>
                            <span className="grid min-w-0">
                                <span className="text-[13.5px] font-semibold">
                                    {s.key}
                                </span>
                                <span
                                    data-ph-mask=""
                                    className="truncate text-[12.5px] text-muted-foreground"
                                >
                                    {s.value}
                                </span>
                            </span>
                        </>
                    );
                    const cls = cn(
                        "flex w-full items-start gap-2.5 rounded-[10px] p-2.5 text-left",
                        on &&
                            "bg-card shadow-[0_1px_3px_hsl(var(--shadow-color)/0.12),inset_0_0_0_1px_hsl(var(--border))]",
                        !on && !done && "text-muted-foreground",
                    );
                    return (
                        <li key={s.n}>
                            {s.onPress && !on ? (
                                <button
                                    type="button"
                                    onClick={s.onPress}
                                    aria-label={`${s.key}: ${s.value}. Change`}
                                    className={cn(
                                        cls,
                                        "transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    )}
                                >
                                    {inner}
                                </button>
                            ) : (
                                <div
                                    aria-current={on ? "step" : undefined}
                                    className={cls}
                                >
                                    {inner}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            {note}
        </nav>
    );
}

/**
 * The sticky foot: what is missing (or, at Check and book, the booking in
 * one line), Back at a desk, and the one button. A phone's Back is in its
 * header.
 */
export function FlowFoot({
    footRef,
    message,
    summary,
    onBack,
    label,
    busy,
}: {
    footRef: RefObject<HTMLDivElement | null>;
    message: string | null;
    summary: string | null;
    onBack: (() => void) | null;
    label: string;
    busy: boolean;
}) {
    return (
        <div
            ref={footRef}
            data-overlay-foot
            className="grid shrink-0 gap-2 border-t border-border bg-card px-4 pb-5 pt-3 min-[760px]:flex min-[760px]:items-center min-[760px]:px-6 min-[760px]:py-3"
        >
            {onBack ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="hidden min-[760px]:inline-flex"
                    onClick={onBack}
                >
                    <ArrowLeft aria-hidden className="size-4" />
                    Back
                </Button>
            ) : null}
            <span className="hidden flex-1 min-[760px]:block" />
            {message ? (
                <p
                    role="alert"
                    className="text-[13px] font-medium text-destructive-subtle-foreground"
                >
                    {message}
                </p>
            ) : summary ? (
                <p
                    data-ph-mask=""
                    className="text-[12.5px] text-muted-foreground min-[760px]:max-w-[360px] min-[760px]:text-right"
                >
                    {summary}
                </p>
            ) : null}
            <Button
                type="submit"
                size="lg"
                busy={busy}
                busyLabel="Booking…"
                className="w-full min-[760px]:w-auto"
            >
                {label}
            </Button>
        </div>
    );
}
