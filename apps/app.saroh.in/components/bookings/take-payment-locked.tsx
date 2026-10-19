import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";
import { useId } from "react";

import { CANT_TAKE_PAYMENTS } from "@/lib/organizations/permits";

/**
 * Take payment for someone whose role can't take it (FB-1, DEC-098): the
 * button is there, disabled, with why beside it — a missing button reads
 * as a bug, and the person at the desk needs to know to fetch someone who
 * can. "Take ₹X" when the API sent the figure, "Take payment" when it only
 * said there is something to take.
 *
 * A screen that already says why once (a booking's page, U12, which pins
 * the button and says it in its body) passes the line's id as
 * `describedBy`, and no second line is drawn.
 */
export function TakePaymentLocked({
    amount,
    variant = "default",
    triggerClassName,
    className,
    describedBy,
    lock = false,
}: {
    /** "₹500", or null when the role reads no money. */
    amount: string | null;
    variant?: "default" | "outline";
    triggerClassName?: string;
    className?: string;
    /** The id of the line that already says why, elsewhere on screen. */
    describedBy?: string;
    /** A padlock before the words (BKMBookingDetail, BKDBooking). */
    lock?: boolean;
}) {
    const why = useId();
    const button = (
        <Button
            data-ph-unmask=""
            type="button"
            variant={variant}
            className={cn("gap-2", triggerClassName)}
            disabled
            aria-describedby={describedBy ?? why}
        >
            {lock ? <Lock aria-hidden className="size-4" /> : null}
            {amount ? `Take ${amount}` : "Take payment"}
        </Button>
    );
    if (describedBy) return button;
    return (
        <div className={cn("flex flex-col items-start gap-1", className)}>
            {button}
            <p id={why} className="text-[12.5px] text-muted-foreground">
                {CANT_TAKE_PAYMENTS}
            </p>
        </div>
    );
}
