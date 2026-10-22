"use client";

import { useId, useRef } from "react";

import { useScrollLock } from "../../lib/sheet-shell";
import { FRAME_PILL, FRAME_RADII } from "../look-styles";
import type { FrameProps } from "./frame-parts";
import {
    BackButton,
    BarContent,
    CloseButton,
    holdTab,
    useFrameEscape,
} from "./frame-parts";

/**
 * Folio's frame (DEC-172, KD8, VA08a–e): a panel on the right of a desk,
 * 600px, over the page it was opened from (here, the booking page's own
 * header behind a scrim); the whole screen on a phone. A dialog: labelled
 * "Book a time", focus held inside, Escape and Close leave the booking.
 * The sentence is the progress; the step's button sits at the panel's
 * foot, the one fixed bar on a phone. It fades and rises into place over
 * the look's 200ms (`data-site-rise`).
 */
export function PanelFrame(props: FrameProps) {
    const {
        look,
        label,
        countText,
        onBack,
        onClose,
        top,
        heading,
        children,
        bar,
    } = props;
    const labelId = useId();
    const box = useRef<HTMLDivElement>(null);
    useFrameEscape(onClose);
    useScrollLock(true);
    return (
        <>
            <div
                aria-hidden="true"
                data-site-fade=""
                onClick={onClose}
                className="fixed inset-0 z-[55] bg-[hsl(var(--site-fg)/0.42)] max-[699px]:hidden"
            />
            <div
                ref={box}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelId}
                data-booking-frame="panel"
                data-site-rise=""
                onKeyDown={(e) => holdTab(e, box.current)}
                style={FRAME_PILL}
                className="bg-site-surface text-site-fg border-site-border fixed inset-y-0 right-0 z-[56] flex w-full max-w-[600px] flex-col min-[700px]:border-l"
            >
                <div className="border-site-border flex items-center gap-2 border-b px-3 py-2 min-[700px]:pb-[18px] min-[700px]:pl-9 min-[700px]:pr-7 min-[700px]:pt-[22px]">
                    {onBack ? (
                        <BackButton onBack={onBack} />
                    ) : (
                        <span aria-hidden="true" className="size-11" />
                    )}
                    <p
                        id={labelId}
                        className="font-site-heading flex-1 text-[22px] font-light tracking-[-0.01em]"
                    >
                        {label}
                    </p>
                    {countText ? (
                        <p className="text-site-muted text-[12.5px]">
                            {countText}
                        </p>
                    ) : null}
                    <CloseButton onClose={onClose} />
                </div>
                <div
                    style={FRAME_RADII}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-6 min-[700px]:px-9 min-[700px]:pb-7 min-[700px]:pt-7"
                >
                    {top ? <div className="mb-6">{top}</div> : null}
                    {heading}
                    <div className="mt-4">{children}</div>
                </div>
                {bar ? (
                    <div
                        data-booking-bar=""
                        className="border-site-fg bg-site-surface border-t px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3.5 min-[700px]:px-9 min-[700px]:pb-[22px] min-[700px]:pt-[18px]"
                    >
                        <BarContent bar={bar} look={look} />
                    </div>
                ) : null}
            </div>
        </>
    );
}
