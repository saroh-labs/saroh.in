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
 * Live's frame (DEC-172, KD8, VB08a–e). On a phone, a full-height sheet
 * per step: Back, "Step 2 of 5 · Who" and Close, a segment per step, the
 * choices so far as chips, the question, and the step's button in the one
 * bar fixed at the thumb. On a desk, one page: the steps already answered
 * above the one being asked (What, Who and When together, B16), and "Your
 * booking" beside them with the button. Both are drawn and CSS shows one
 * (`max-[699px]:` / `min-[700px]:`), never a width read in script.
 */
/** VB08's hairlines: 4px, 2px corners, 4px apart (`.prog`, `.pg`). */
const LIVE_SEGMENT = "h-1 rounded-[2px]";
/** VB08's step title: 40px on a phone (`.d3`), 56px on a desk (`.d2`). */
const TITLE =
    "[&>h2]:text-[calc(2.5rem*var(--site-heading-scale,1))] min-[700px]:[&>h2]:text-[calc(3.5rem*var(--site-heading-scale,1))]";

export function SheetsFrame(props: FrameProps) {
    const {
        look,
        business,
        label,
        countText,
        count,
        stepName,
        onBack,
        onClose,
        top,
        heading,
        children,
        bar,
        earlier,
    } = props;
    useFrameEscape(onClose);
    const where = [countText, stepName].filter(Boolean).join(" · ");
    return (
        <div
            data-booking-frame="sheets"
            style={FRAME_PILL}
            className="bg-site-bg text-site-fg max-[699px]:min-h-[100dvh]"
        >
            {/* The phone's sheet head. */}
            <div className="px-4 pb-2.5 min-[700px]:hidden">
                <div className="grid h-[60px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
                    {onBack ? (
                        <BackButton onBack={onBack} />
                    ) : (
                        <span aria-hidden="true" />
                    )}
                    <p className="text-center text-[14.5px] font-bold">
                        {where || label}
                    </p>
                    <CloseButton onClose={onClose} />
                </div>
                {count ? (
                    <Progress
                        count={count}
                        className="gap-1"
                        segment={LIVE_SEGMENT}
                    />
                ) : null}
            </div>
            {/* The desk's page head. */}
            <div className="mx-auto max-w-[1180px] px-10 max-[699px]:hidden">
                <div className="flex h-[76px] items-center gap-4">
                    {onBack ? <BackButton onBack={onBack} /> : null}
                    <p className="font-site-heading flex-1 truncate text-[22px] font-extrabold tracking-[-0.02em]">
                        {business}
                    </p>
                    <p className="text-[16px] font-bold">{label}</p>
                    <div className="flex flex-1 justify-end">
                        <CloseButton onClose={onClose} withWord />
                    </div>
                </div>
                {count ? (
                    <Progress
                        count={count}
                        className="gap-1"
                        segment={LIVE_SEGMENT}
                    />
                ) : null}
            </div>

            <div
                style={FRAME_RADII}
                className="mx-auto grid max-w-[1180px] gap-8 px-4 pb-40 pt-5 min-[700px]:grid-cols-[minmax(0,1fr)_420px] min-[700px]:gap-12 min-[700px]:px-10 min-[700px]:pb-16 min-[700px]:pt-7"
            >
                <div data-site-fade="" className="min-w-0">
                    {top ? <div className="mb-4">{top}</div> : null}
                    {earlier ? (
                        <div className="mb-4 grid gap-3 max-[699px]:hidden">
                            {earlier}
                        </div>
                    ) : null}
                    <div className={TITLE}>{heading}</div>
                    <div className="mt-5">{children}</div>
                </div>
                {bar ? (
                    <aside
                        aria-label="Your booking"
                        className="bg-site-surface rounded-site-photo sticky top-6 self-start p-6 shadow-[0_1px_0_rgba(0,0,0,.04),0_18px_40px_-24px_rgba(0,0,0,.35)] max-[699px]:hidden"
                    >
                        <p className="text-site-muted mb-3 text-[13px] font-bold tracking-[0.02em]">
                            Your booking
                        </p>
                        <BarContent bar={bar} look={look} stack />
                    </aside>
                ) : null}
            </div>
            {bar ? (
                <div
                    data-booking-bar=""
                    className="bg-site-bg fixed inset-x-0 bottom-[var(--site-consent-offset,0px)] z-50 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_24px_-16px_rgba(0,0,0,.25)] min-[700px]:hidden"
                >
                    <BarContent bar={bar} look={look} />
                </div>
            ) : null}
        </div>
    );
}
