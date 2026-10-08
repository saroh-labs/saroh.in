"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { NO_CAPTURE_ATTRS, NO_CAPTURE_CLASS } from "../consent-events";
import { cn } from "../lib/utils";

/**
 * A sheet from the bottom of the page, the account area's dialog (round-2
 * plan A, A5), drawn as the sign-in sheet is: it takes focus, keeps Tab
 * inside, closes on Escape or a tap outside, and gives focus back to what
 * opened it. Site tokens only.
 */
export function Sheet({
    open,
    onClose,
    title,
    lead,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    lead?: string;
    children: ReactNode;
}) {
    const ids = useId();
    const sheet = useRef<HTMLDivElement>(null);
    const opener = useRef<Element | null>(null);

    useEffect(() => {
        if (!open) return;
        opener.current = document.activeElement;
        const first = sheet.current?.querySelector<HTMLElement>(
            "input, textarea, button:not([aria-label='Close'])",
        );
        (first ?? sheet.current)?.focus();
        return () => {
            if (opener.current instanceof HTMLElement) opener.current.focus();
        };
    }, [open]);

    if (!open) return null;

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== "Tab" || !sheet.current) return;
        const stops = Array.from(
            sheet.current.querySelectorAll<HTMLElement>(
                "button, input, textarea, a[href]",
            ),
        ).filter((el) => !(el as HTMLButtonElement).disabled);
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

    return (
        <>
            <div
                aria-hidden="true"
                onClick={onClose}
                className="fixed inset-0 z-[60] bg-[hsl(var(--site-fg)/0.45)]"
            />
            <div
                ref={sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${ids}-title`}
                aria-describedby={lead ? `${ids}-lead` : undefined}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                {...NO_CAPTURE_ATTRS}
                className={`bg-site-surface text-site-fg font-site-body fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[88vh] max-w-[560px] overflow-y-auto rounded-t-[calc(var(--site-radius)+18px)] px-[18px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[18px] shadow-[0_-12px_40px_hsl(var(--site-fg)/0.2)] outline-none ${NO_CAPTURE_CLASS}`}
            >
                <div className="flex items-center gap-2.5">
                    <h2
                        id={`${ids}-title`}
                        className="font-site-heading flex-1 text-[21px] font-semibold tracking-[-0.015em]"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className={cn(
                            "text-site-fg size-[34px] shrink-0 cursor-pointer rounded-full text-base hover:opacity-80",
                            quietFill,
                            focusRing,
                        )}
                    >
                        ✕
                    </button>
                </div>
                {lead ? (
                    <p
                        id={`${ids}-lead`}
                        className="text-site-body mt-1.5 text-sm leading-normal"
                    >
                        {lead}
                    </p>
                ) : null}
                {children}
            </div>
        </>
    );
}

/** A sheet's text field. */
export const sheetInput = cn(
    "border-site-border bg-site-bg text-site-fg mt-1.5 block h-[50px] w-full rounded-[calc(var(--site-radius)+10px)] border px-3.5 text-[17px]",
    focusRing,
);

/** A sheet's second way out, under its main button ("Pause instead"). */
export const sheetAltButton = cn(
    "text-site-fg mt-2 block h-11 w-full cursor-pointer text-sm font-semibold underline hover:opacity-80 active:opacity-70 disabled:cursor-default disabled:opacity-60",
    focusRing,
);

/** A sheet's main button: the accent when it can go, quiet when not. */
export function sheetButton(off: boolean): string {
    return cn(
        "mt-4 block h-[52px] w-full rounded-[calc(var(--site-radius)+10px)] text-base font-bold",
        focusRing,
        off
            ? cn("text-site-muted cursor-default", quietFill)
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90 active:opacity-80",
    );
}
