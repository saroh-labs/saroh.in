"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { NO_CAPTURE_ATTRS, NO_CAPTURE_CLASS } from "../consent-events";
import { cn } from "../lib/utils";

/**
 * The bag's sheet (round-2 G13), as the Customer Site design draws every
 * sheet: from the bottom, at most 560px wide, a title with a round close
 * button, and a scrim behind. The same chrome as the sign-in sheet.
 *
 * It takes focus when it opens, keeps Tab inside, closes on Escape and gives
 * focus back to whatever opened it. Drawn in the site's own tokens only.
 */

export const sheetButton = (off: boolean) =>
    cn(
        "mt-4 block h-[52px] w-full rounded-[calc(var(--site-radius)+10px)] text-base font-bold transition-[opacity,transform] duration-100",
        focusRing,
        off
            ? cn("text-site-muted cursor-not-allowed", quietFill)
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90 active:scale-[0.99]",
    );

export const sheetAltButton = cn(
    "text-site-fg mt-2 block h-11 w-full cursor-pointer rounded-[calc(var(--site-radius)+10px)] text-sm font-semibold underline-offset-2 hover:underline",
    focusRing,
);

export function SheetFrame({
    title,
    lead,
    onClose,
    children,
}: {
    title: string;
    lead?: ReactNode;
    onClose: () => void;
    children: ReactNode;
}) {
    const ids = useId();
    const sheet = useRef<HTMLDivElement>(null);

    // Focus in on open; back to the opener on close.
    useEffect(() => {
        const opener = document.activeElement;
        sheet.current?.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== "Tab" || !sheet.current) return;
        const stops = Array.from(
            sheet.current.querySelectorAll<HTMLElement>(
                "button, input, select, textarea, a[href]",
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
                            "text-site-fg size-[34px] shrink-0 cursor-pointer rounded-full text-base hover:opacity-80 active:scale-95",
                            quietFill,
                            focusRing,
                        )}
                    >
                        ✕
                    </button>
                </div>
                {lead ? (
                    <div className="text-site-body mt-1.5 text-sm leading-normal">
                        {lead}
                    </div>
                ) : null}
                {children}
            </div>
        </>
    );
}
