import { cn } from "../../lib/utils";
import { DAYS_WINDOW } from "../model";
import { focusRing } from "../styles";

/**
 * Which two weeks the booking page shows, and the way to others: "Show
 * later dates" past the first fourteen days, as far as the business takes
 * bookings ahead, and "Show earlier dates" back again.
 */
export interface Weeks {
    /** Days from today the two weeks on show start. */
    skip: number;
    /** Where "Show later dates" goes; null when there is nothing later. */
    later: number | null;
    /** Absent: these two weeks are all there is (the account's Move sheet). */
    onSkip?: (skip: number) => void;
}

export const THESE_WEEKS: Weeks = { skip: 0, later: null };

const link = cn(
    "text-site-fg coarse:min-h-11 cursor-pointer text-sm font-semibold underline underline-offset-2",
    focusRing,
);

export function WeeksButtons({
    weeks,
    className,
}: {
    weeks: Weeks;
    className?: string;
}) {
    const { skip, later, onSkip } = weeks;
    if (!onSkip || (skip === 0 && later === null)) return null;
    return (
        <div className={cn("flex flex-wrap gap-x-5 gap-y-1", className)}>
            {skip > 0 ? (
                <button
                    type="button"
                    onClick={() => onSkip(Math.max(0, skip - DAYS_WINDOW))}
                    className={link}
                >
                    Show earlier dates
                </button>
            ) : null}
            {later !== null ? (
                <button
                    type="button"
                    onClick={() => onSkip(later)}
                    className={link}
                >
                    Show later dates
                </button>
            ) : null}
        </div>
    );
}
