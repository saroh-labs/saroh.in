import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import { CANT_TAKE_PAYMENTS } from "@/lib/organizations/permits";

/**
 * Take payment for someone whose role can't take it (FB-1, DEC-098): the
 * button is there, disabled, with why beside it — a missing button reads
 * as a bug, and the person at the desk needs to know to fetch someone who
 * can. "Take ₹X" when the API sent the figure, "Take payment" when it only
 * said there is something to take.
 */
export function TakePaymentLocked({
    amount,
    variant = "default",
    triggerClassName,
    className,
}: {
    /** "₹500", or null when the role reads no money. */
    amount: string | null;
    variant?: "default" | "outline";
    triggerClassName?: string;
    className?: string;
}) {
    const why = useId();
    return (
        <div className={cn("flex flex-col items-start gap-1", className)}>
            <Button
                data-ph-unmask=""
                type="button"
                variant={variant}
                className={triggerClassName}
                disabled
                aria-describedby={why}
            >
                {amount ? `Take ${amount}` : "Take payment"}
            </Button>
            <p id={why} className="text-[12.5px] text-muted-foreground">
                {CANT_TAKE_PAYMENTS}
            </p>
        </div>
    );
}
