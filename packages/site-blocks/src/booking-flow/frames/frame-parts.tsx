"use client";

import type { LookId } from "@saroh/block-contract";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";
import { lookIcon, lookPrimary } from "../look-styles";

/**
 * What every look's booking frame shares (DEC-172, KD8, plan U10). A frame
 * owns layout only: the steps, their API calls and their words are the
 * same in all three (`look-flow.tsx`).
 */

/** The step's one filled button. */
export interface FrameAction {
    label: string;
    onPress: () => void;
    /** Shown quiet, and pressing it says what is missing instead. */
    blocked: boolean;
    busy?: boolean;
}

export interface FrameBarProps {
    /** "Thu 22 Oct, 8 am · with Meera", or the service while choosing. */
    summary: string;
    /** "₹2,500", or "" for none. */
    price: string;
    /** What is still missing, or a booking error, said by the bar. */
    status?: string | null;
    action: FrameAction | null;
}

export interface FrameProps {
    look: LookId;
    business: string;
    /** The frame's name, its dialog label: "Book a time". */
    label: string;
    /** "Step 2 of 4"; null on a screen past choosing. */
    countText: string | null;
    /** Where on the way: for the progress hairlines. */
    count: { at: number; of: number } | null;
    /** The step's short name, for Live: "Who". */
    stepName: string | null;
    onBack: (() => void) | null;
    onClose: () => void;
    /** Folio's sentence, the others' line of choices. */
    top?: ReactNode;
    /** The step's heading (an `h2` that takes focus). */
    heading: ReactNode;
    /** The step's contents. */
    children: ReactNode;
    /**
     * Live on a desk: the steps already answered, shown above the one
     * being asked (What, Who and When together, B16). Hidden on a phone.
     */
    earlier?: ReactNode;
    bar: FrameBarProps | null;
}

/**
 * Escape closes the booking (plan U10), unless something inside took it
 * first — a list open in the sentence, a sheet over the frame — which
 * stops it on its way.
 */
export function useFrameEscape(onClose: () => void, active = true): void {
    const latest = useRef(onClose);
    useEffect(() => {
        latest.current = onClose;
    });
    useEffect(() => {
        if (!active) return;
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            // A dialog drawn over the frame (signing in, a test release's
            // stop) closes itself first.
            const top = document.querySelectorAll(
                '[role="dialog"][aria-modal="true"]:not([data-booking-frame])',
            );
            if (top.length > 0) return;
            latest.current();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [active]);
}

/** Tab and Shift+Tab stay inside a dialog frame (Folio's panel). */
export function holdTab(
    event: KeyboardEvent<HTMLElement>,
    box: HTMLElement | null,
): void {
    if (event.key !== "Tab" || !box) return;
    const stops = Array.from(
        box.querySelectorAll<HTMLElement>(
            'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
        ),
    ).filter(
        (el) =>
            !(el as HTMLButtonElement).disabled &&
            el.getAttribute("aria-hidden") !== "true",
    );
    const first = stops.at(0);
    const last = stops.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

export function BackButton({ onBack }: { onBack: () => void }) {
    return (
        <button
            type="button"
            onClick={onBack}
            aria-label="Back a step"
            className={lookIcon}
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
            >
                <path
                    d="M19 12H5m6-6-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </button>
    );
}

export function CloseButton({
    onClose,
    withWord = false,
}: {
    onClose: () => void;
    /** "Close" beside the cross (Live's desk). */
    withWord?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClose}
            aria-label={withWord ? undefined : "Close booking"}
            className={cn(lookIcon, withWord && "w-auto gap-1.5 px-3")}
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
            >
                <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                />
            </svg>
            {withWord ? (
                <span className="text-[14.5px] font-semibold">Close</span>
            ) : null}
        </button>
    );
}

/** Hairlines, one per step, the ones done in ink. */
export function Progress({
    count,
    className,
    segment,
}: {
    count: { at: number; of: number };
    className?: string;
    /** Each hairline's size, per look's board. */
    segment?: string;
}) {
    return (
        <div aria-hidden="true" className={cn("flex gap-1.5", className)}>
            {Array.from({ length: count.of }, (_, i) => (
                <span
                    key={i}
                    className={cn(
                        "h-[3px] flex-1 rounded-full",
                        segment,
                        i < count.at ? "bg-site-fg" : "bg-site-border",
                    )}
                />
            ))}
        </div>
    );
}

/**
 * The bar's words and button as each look's board sets them: Quiet's price
 * 18/500 (VD08), Folio's 12.5px muted line and 17px price (VA08), Live's
 * condensed 26px price (40px in its desk card) and 58px button (VB08).
 */
const BAR_STYLE: Record<
    LookId,
    { summary?: string; price?: string; stackPrice?: string; action?: string }
> = {
    quiet: { price: "text-[18px] font-medium" },
    folio: {
        summary: "text-site-muted text-[12.5px]",
        price: "text-[17px]",
    },
    live: {
        price: "font-site-heading text-[26px] font-extrabold leading-[0.9] tracking-[-0.03em] [font-stretch:80%]",
        stackPrice: "text-[40px]",
        action: "min-h-[58px] px-[26px] text-[17px]",
    },
};

/** The summary and the step's one filled button. */
export function BarContent({
    bar,
    look,
    className,
    stack = false,
}: {
    bar: FrameBarProps;
    look: LookId;
    className?: string;
    /** The button under the words, full width (Live's desk card). */
    stack?: boolean;
}) {
    const { action } = bar;
    const style = BAR_STYLE[look];
    return (
        <div
            className={cn(
                stack ? "grid gap-3" : "flex items-center gap-4",
                className,
            )}
        >
            <div className="min-w-0 flex-1">
                {bar.summary ? (
                    <p
                        className={cn(
                            "text-site-body truncate text-[13.5px]",
                            style.summary,
                        )}
                    >
                        {bar.summary}
                    </p>
                ) : null}
                {bar.price ? (
                    <p
                        className={cn(
                            "text-site-fg text-[19px] font-semibold tabular-nums leading-tight",
                            style.price,
                            stack && style.stackPrice,
                        )}
                    >
                        {bar.price}
                    </p>
                ) : null}
                {bar.status ? (
                    <p
                        role="status"
                        className="text-site-fg mt-0.5 text-[13px] font-medium"
                    >
                        {bar.status}
                    </p>
                ) : null}
            </div>
            {action ? (
                <button
                    type="button"
                    data-booking-action=""
                    onClick={action.onPress}
                    aria-disabled={
                        action.blocked || action.busy === true
                            ? true
                            : undefined
                    }
                    className={cn(
                        lookPrimary(action.blocked),
                        style.action,
                        stack ? "w-full" : "shrink-0",
                    )}
                >
                    {action.busy ? "Booking…" : action.label}
                </button>
            ) : null}
        </div>
    );
}
