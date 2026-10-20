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
export function SheetsFrame(props: FrameProps) {
    const {
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
            <div className="px-4 pt-3 min-[700px]:hidden">
                <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center">
                    {onBack ? (
                        <BackButton onBack={onBack} />
                    ) : (
                        <span aria-hidden="true" />
                    )}
                    <p className="text-center text-[14.5px] font-semibold">
                        {where || label}
                    </p>
                    <CloseButton onClose={onClose} />
                </div>
                {count ? <Progress count={count} className="mt-3" /> : null}
            </div>
            {/* The desk's page head. */}
            <div className="mx-auto max-w-[1180px] px-10 pt-6 max-[699px]:hidden">
                <div className="flex items-center gap-4">
                    {onBack ? <BackButton onBack={onBack} /> : null}
                    <p className="font-site-heading flex-1 truncate text-[22px] font-extrabold tracking-[-0.02em]">
                        {business}
                    </p>
                    <p className="text-[15px] font-semibold">{label}</p>
                    <div className="flex flex-1 justify-end">
                        <CloseButton onClose={onClose} withWord />
                    </div>
                </div>
                {count ? <Progress count={count} className="mt-4" /> : null}
            </div>

            <div
                style={FRAME_RADII}
                className="mx-auto grid max-w-[1180px] gap-8 px-4 pb-40 pt-5 min-[700px]:grid-cols-[minmax(0,1fr)_340px] min-[700px]:px-10 min-[700px]:pb-16 min-[700px]:pt-8"
            >
                <div data-site-fade="" className="min-w-0">
                    {top ? <div className="mb-4">{top}</div> : null}
                    {earlier ? (
                        <div className="mb-4 grid gap-3 max-[699px]:hidden">
                            {earlier}
                        </div>
                    ) : null}
                    {heading}
                    <div className="mt-5">{children}</div>
                </div>
                {bar ? (
                    <aside
                        aria-label="Your booking"
                        className="bg-site-surface border-site-border rounded-site-s sticky top-6 self-start border p-6 max-[699px]:hidden"
                    >
                        <p className="text-site-muted mb-3 text-[13px] font-semibold">
                            Your booking
                        </p>
                        <BarContent bar={bar} stack />
                    </aside>
                ) : null}
            </div>
            {bar ? (
                <div
                    data-booking-bar=""
                    className="bg-site-bg border-site-border fixed inset-x-0 bottom-[var(--site-consent-offset,0px)] z-50 border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 min-[700px]:hidden"
                >
                    <BarContent bar={bar} />
                </div>
            ) : null}
        </div>
    );
}
