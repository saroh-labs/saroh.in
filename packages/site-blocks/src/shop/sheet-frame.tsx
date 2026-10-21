"use client";

import type { LookId } from "@saroh/block-contract";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { NO_CAPTURE_ATTRS, NO_CAPTURE_CLASS } from "../consent-events";
import {
    SHEET_CLOSE_SIZE,
    SHEET_HEIGHT,
    useScrollLock,
} from "../lib/sheet-shell";
import { cn } from "../lib/utils";

/**
 * The bag's sheet (round-2 G13), as the Customer Site design draws every
 * sheet: from the bottom, at most 560px wide, a title with a round close
 * button, and a scrim behind. The same chrome as the sign-in sheet.
 *
 * It takes focus when it opens, keeps Tab inside, closes on Escape and gives
 * focus back to whatever opened it. Drawn in the site's own tokens only.
 *
 * A `footer` is pinned to the sheet's foot while the rest scrolls above it:
 * the bag's total and its button stay under the thumb however long the bag
 * is. The page behind is held still while the sheet is open.
 *
 * `mark="done"` opens the sheet on a tick in the site's accent, over its
 * title: an order placed is a moment of success, and reads as one.
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
    mark,
    onClose,
    footer,
    look,
    children,
}: {
    title: string;
    lead?: ReactNode;
    /** A tick in the accent over the title: it worked. */
    mark?: "done";
    onClose: () => void;
    /** Pinned to the foot of the sheet; the rest scrolls above it. */
    footer?: ReactNode;
    /**
     * A look's sheet (DEC-172, U11): a drawer from the right from 700px and
     * a sheet from the foot on a phone, in the look's small corner (never a
     * pill), fading and rising over the look's slow step. Absent: Classic's
     * sheet, exactly as before.
     */
    look?: LookId;
    children: ReactNode;
}) {
    const ids = useId();
    const sheet = useRef<HTMLDivElement>(null);
    useScrollLock();

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
                data-site-rise={look ? "" : undefined}
                data-sheet-look={look}
                className={
                    look
                        ? `bg-site-surface text-site-fg font-site-body rounded-t-site-s fixed inset-x-0 bottom-0 z-[61] flex flex-col overflow-hidden shadow-[0_-12px_40px_hsl(var(--site-fg)/0.2)] outline-none min-[700px]:inset-y-0 min-[700px]:left-auto min-[700px]:right-0 min-[700px]:max-h-none min-[700px]:w-[min(480px,100vw)] min-[700px]:rounded-none min-[700px]:supports-[height:100dvh]:max-h-none ${SHEET_HEIGHT} ${NO_CAPTURE_CLASS}`
                        : `bg-site-surface text-site-fg font-site-body fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-w-[560px] flex-col overflow-hidden rounded-t-[calc(var(--site-radius)+18px)] shadow-[0_-12px_40px_hsl(var(--site-fg)/0.2)] outline-none ${SHEET_HEIGHT} ${NO_CAPTURE_CLASS}`
                }
            >
                <div
                    data-sheet-scroll=""
                    className={cn(
                        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-[18px]",
                        footer
                            ? "pb-4"
                            : "pb-[calc(20px+env(safe-area-inset-bottom))]",
                    )}
                >
                    <div
                        className={cn(
                            "flex gap-2.5",
                            mark ? "items-start" : "items-center",
                        )}
                    >
                        <div className="min-w-0 flex-1">
                            {mark ? (
                                <div
                                    aria-hidden="true"
                                    data-sheet-mark=""
                                    className="bg-site-accent text-site-accent-fg mb-3 flex size-11 items-center justify-center rounded-full"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        width="20"
                                        height="20"
                                        fill="none"
                                    >
                                        <path
                                            d="M5 12.5 10 17.5 19 7.5"
                                            stroke="currentColor"
                                            strokeWidth="2.25"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                            ) : null}
                            <h2
                                id={`${ids}-title`}
                                className={cn(
                                    "font-site-heading font-semibold tracking-[-0.015em] [text-wrap:balance]",
                                    mark
                                        ? "text-[calc(1.625rem*var(--site-heading-scale,1))] leading-[1.15]"
                                        : "text-[calc(1.3125rem*var(--site-heading-scale,1))]",
                                )}
                            >
                                {title}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className={cn(
                                "text-site-fg shrink-0 cursor-pointer rounded-full text-base hover:opacity-80 active:scale-95",
                                look ? "size-11" : SHEET_CLOSE_SIZE,
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
                {footer ? (
                    <div
                        data-sheet-footer=""
                        className="border-site-border bg-site-surface shrink-0 border-t px-[18px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-1"
                    >
                        {footer}
                    </div>
                ) : null}
            </div>
        </>
    );
}
