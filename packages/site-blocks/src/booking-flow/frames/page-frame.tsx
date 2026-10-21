"use client";

import { FRAME_PILL, FRAME_RADII } from "../look-styles";
import type { FrameProps } from "./frame-parts";
import {
    BackButton,
    BarContent,
    CloseButton,
    Progress,
    useFrameEscape,
} from "./frame-parts";

/**
 * Quiet's frame (DEC-172, KD8, VD08a–e): its own page, one question at a
 * time. Back, the business's name and Close across the top; a hairline
 * per step; "Step 4 of 5", the question set large and centred, the line of
 * what is chosen under it, and the answer in a 666px column. The step's
 * button is the one bar fixed at the foot of a phone, and sits under the
 * column on a desk, held at the foot of the window while a long step (a
 * fortnight of times) runs past it, so the step's one filled button is
 * always in view. Escape and Close leave the booking.
 */
export function PageFrame(props: FrameProps) {
    const {
        business,
        countText,
        count,
        onBack,
        onClose,
        top,
        heading,
        children,
        bar,
    } = props;
    useFrameEscape(onClose);
    return (
        <div
            data-booking-frame="page"
            style={FRAME_PILL}
            className="bg-site-bg text-site-fg"
        >
            <div className="mx-auto max-w-[1060px] px-4 pt-3 min-[700px]:px-10">
                <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center">
                    {onBack ? (
                        <BackButton onBack={onBack} />
                    ) : (
                        <span aria-hidden="true" />
                    )}
                    <p className="font-site-heading truncate text-center text-[22px]">
                        {business}
                    </p>
                    <CloseButton onClose={onClose} />
                </div>
                {count ? (
                    <Progress
                        count={count}
                        className="mx-auto mt-3 max-w-[666px]"
                    />
                ) : null}
            </div>
            <div
                data-site-fade=""
                style={FRAME_RADII}
                className="mx-auto max-w-[666px] px-5 pb-40 pt-8 min-[700px]:pb-16 min-[700px]:pt-12"
            >
                {countText ? (
                    <p className="text-site-muted mb-3 text-center text-[12.5px] font-semibold uppercase tracking-[0.18em]">
                        {countText}
                    </p>
                ) : null}
                {heading}
                {top ? <div className="mt-3 text-center">{top}</div> : null}
                <div className="mt-8">{children}</div>
                {bar ? (
                    <div
                        data-booking-bar=""
                        className="border-site-border bg-site-bg max-[699px]:fixed max-[699px]:inset-x-0 max-[699px]:bottom-[var(--site-consent-offset,0px)] max-[699px]:z-50 max-[699px]:border-t max-[699px]:px-5 max-[699px]:pb-[calc(12px+env(safe-area-inset-bottom))] max-[699px]:pt-3 min-[700px]:sticky min-[700px]:bottom-0 min-[700px]:z-10 min-[700px]:mt-10 min-[700px]:border-t min-[700px]:pb-5 min-[700px]:pt-5"
                    >
                        <BarContent bar={bar} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
