"use client";

import { cn } from "../lib/utils";
import { SheetFrame, sheetButton } from "../shop/sheet-frame";

/**
 * Where a flow stops on a test release (DEC-071, R4; plan T6): in place of
 * the sign-in sheet or the submit, it says what the live site would do
 * here, with the order's total, the booking's time or the plan's price, and
 * that nothing happens on a test release.
 *
 * Drawn in the site's own tokens, like every sheet on the page. The one
 * mark that it isn't the merchant speaking is the small "Test release"
 * label, the bar's own words.
 */

/** What a test release doesn't do, in the stop's last sentence. */
export type TestReleaseVerb = "ordered" | "booked" | "sent" | "paid" | "bought";

export function TestReleaseStop({
    live,
    nothing,
    className,
}: {
    /**
     * What the live site does here, after "On the live site, ": e.g. "the
     * customer signs in here and pays ₹1,240 for 3 items".
     */
    live: string;
    nothing: TestReleaseVerb;
    className?: string;
}) {
    return (
        <div
            role="status"
            data-test-release-stop=""
            className={cn(
                "border-site-border bg-site-surface text-site-fg rounded-[calc(var(--site-radius)+10px)] border border-dashed px-4 py-3.5 text-sm leading-normal",
                className,
            )}
        >
            <p className="text-site-muted text-[11.5px] font-bold uppercase tracking-[0.08em]">
                Test release
            </p>
            <p className="mt-1.5">On the live site, {live}.</p>
            <p className="text-site-body mt-1">
                Nothing is {nothing} on a test release.
            </p>
        </div>
    );
}

/**
 * The stop as a sheet, where the sign-in sheet would have opened: the
 * booking page's confirm, the bag's Continue, Join and Buy.
 */
export function TestReleaseStopSheet({
    open,
    live,
    nothing,
    back,
    onClose,
}: {
    open: boolean;
    live: string;
    nothing: TestReleaseVerb;
    /** The button that closes it: "Back to your bag", "Back". */
    back: string;
    onClose: () => void;
}) {
    if (!open) return null;
    return (
        <SheetFrame title="This is a test release" onClose={onClose}>
            <TestReleaseStop live={live} nothing={nothing} className="mt-3" />
            <button
                type="button"
                onClick={onClose}
                className={sheetButton(false)}
            >
                {back}
            </button>
        </SheetFrame>
    );
}
