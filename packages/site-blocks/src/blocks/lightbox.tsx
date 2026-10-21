"use client";

import type { LookId } from "@saroh/block-contract";
import type { KeyboardEvent, TouchEvent } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../lib/sheet-shell";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { LookIcon } from "../look-icons";
import { FRONT_RING, said } from "./look-front";

/**
 * A gallery's photo, large, as a real dialog (DEC-172, plan U7, #1096;
 * VA05, VD05 and VB05 "Lightbox open").
 *
 * - `role="dialog"`, `aria-modal`, named "Photo 4 of 9". Focus goes to
 *   Close as it opens and is kept inside: Tab and Shift+Tab go round its
 *   three buttons. Every other child of the body is `inert` while it is
 *   open, and the page behind is held still.
 * - Escape, Close and a downward swipe close it, and focus goes back to
 *   the photo that was open (`onClose` hands back its index; the gallery
 *   focuses that photo's button).
 * - The arrow keys, the Previous and Next buttons and a sideways swipe
 *   move between photos, round from the last to the first.
 * - It fades in over the look's base step (`data-site-fade`, 140ms); with
 *   reduced motion that is a short fade too. Nothing slides.
 * - Folio and Live open on the page's ink, Quiet on its own ground, as
 *   their boards draw it. Colours from `--site-*` only (G2, G7).
 *
 * The caption under the photo is the merchant's own; with none, the
 * photo's description is read out and nothing is written.
 */

export interface LightboxPhoto {
    src: string;
    alt?: string | null;
    caption?: string | null;
    width?: number;
    height?: number;
}

/** "4 of 9": where the open photo is in the set. */
export function photoPlace(index: number, total: number): string {
    return `${index + 1} of ${total}`;
}

/** The index after a move of `by`, round the set. */
export function stepPhoto(index: number, by: number, total: number): number {
    if (total <= 0) return 0;
    return (((index + by) % total) + total) % total;
}

/** What Tab moves between inside the open photo. */
const FOCUSABLE = "button:not([disabled])";

/** How far a finger must travel to count as a swipe. */
const SWIPE_PX = 48;

const GROUND: Record<LookId, string> = {
    folio: "bg-site-fg text-site-bg",
    quiet: "bg-site-bg text-site-fg",
    live: "bg-site-fg text-site-bg",
};

/** A round 44px button on the lightbox's ground. */
const ICON_BUTTON: Record<LookId, string> = {
    folio: "border border-site-bg/40 text-site-bg hover:border-site-bg",
    quiet: "border border-site-rule text-site-fg hover:border-site-fg",
    live: "bg-site-bg/15 text-site-bg hover:bg-site-bg/25",
};

/** The ring on the lightbox's ground: the ground's opposite. */
const RING: Record<LookId, string> = {
    folio: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-bg focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg",
    quiet: FRONT_RING,
    live: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-bg focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg",
};

export function Lightbox({
    photos,
    index,
    look,
    onIndex,
    onClose,
}: {
    photos: readonly LightboxPhoto[];
    /** The open photo; null while closed. */
    index: number | null;
    look: LookId;
    onIndex: (index: number) => void;
    /** Closed: the photo that was open, to give focus back to. */
    onClose: (index: number) => void;
}) {
    const open = index !== null && photos.length > 0;
    const titleId = useId();
    const dialog = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const touch = useRef<{ x: number; y: number } | null>(null);
    useScrollLock(open);

    // The page behind can't be reached while a photo is open.
    useEffect(() => {
        if (!open) return;
        const own = dialog.current?.parentElement ?? null;
        const others = Array.from(document.body.children).filter(
            (el) => el !== own && !el.hasAttribute("inert"),
        );
        others.forEach((el) => el.setAttribute("inert", ""));
        closeButton.current?.focus();
        return () => {
            others.forEach((el) => el.removeAttribute("inert"));
        };
    }, [open]);

    if (!open || typeof document === "undefined") return null;
    const at = Math.min(Math.max(index, 0), photos.length - 1);
    const photo = photos[at];
    const total = photos.length;
    const caption = said(photo.caption);
    const move = (by: number) => onIndex(stepPhoto(at, by, total));

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose(at);
            return;
        }
        if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
            return;
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
            return;
        }
        if (event.key !== "Tab" || !dialog.current) return;
        const stops = Array.from(
            dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE),
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

    function onTouchStart(event: TouchEvent<HTMLDivElement>) {
        const t = event.touches.item(0);
        touch.current = { x: t.clientX, y: t.clientY };
    }

    function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
        const start = touch.current;
        touch.current = null;
        if (!start || event.changedTouches.length === 0) return;
        const t = event.changedTouches.item(0);
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
            move(dx < 0 ? 1 : -1);
        } else if (dy > SWIPE_PX * 2 && Math.abs(dy) > Math.abs(dx)) {
            onClose(at);
        }
    }

    const button = cn(
        "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,background-color,border-color] duration-[var(--site-motion-base,140ms)] active:opacity-80",
        ICON_BUTTON[look],
        RING[look],
    );

    return createPortal(
        <div data-site-lightbox-layer="">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={onKeyDown}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                data-site-fade=""
                data-site-lightbox={look}
                className={cn(
                    "font-site-body fixed inset-0 z-[80] grid grid-rows-[auto_minmax(0,1fr)_auto] overscroll-contain pb-[env(safe-area-inset-bottom)]",
                    GROUND[look],
                )}
            >
                <div className="flex items-center justify-between gap-3 px-4 py-3 min-[700px]:px-6 min-[700px]:py-4">
                    <p
                        id={titleId}
                        className="text-[14px] tabular-nums tracking-[0.04em]"
                    >
                        <span className="sr-only">Photo </span>
                        {photoPlace(at, total)}
                    </p>
                    <button
                        ref={closeButton}
                        type="button"
                        aria-label="Close"
                        onClick={() => onClose(at)}
                        className={button}
                    >
                        <LookIcon name="close" look={look} />
                    </button>
                </div>
                <div className="flex min-h-0 items-center justify-center px-0 min-[700px]:px-[72px]">
                    {/* The photo at its own shape inside the room left:
                    never cropped, never wider than the screen. */}
                    <img
                        key={photo.src}
                        src={photo.src}
                        alt={photo.alt ?? ""}
                        width={photo.width}
                        height={photo.height}
                        {...siteImage("above", {
                            src: photo.src,
                            width: photo.width,
                            sizes: "100vw",
                        })}
                        data-site-fade=""
                        className="rounded-site-photo block h-auto max-h-full w-auto max-w-full object-contain"
                    />
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 min-[700px]:px-6 min-[700px]:py-4">
                    <button
                        type="button"
                        aria-label="Previous photo"
                        onClick={() => move(-1)}
                        disabled={total < 2}
                        className={cn(button, "disabled:opacity-40")}
                    >
                        <span className="block rotate-180">
                            <LookIcon name="arrow" look={look} />
                        </span>
                    </button>
                    <p className="text-center text-[14px] leading-snug [overflow-wrap:anywhere]">
                        {caption ?? ""}
                    </p>
                    <button
                        type="button"
                        aria-label="Next photo"
                        onClick={() => move(1)}
                        disabled={total < 2}
                        className={cn(button, "disabled:opacity-40")}
                    >
                        <LookIcon name="arrow" look={look} />
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
