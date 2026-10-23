import { cn } from "@saroh/ui/lib/utils";
import { BellRing } from "lucide-react";

import type { WaitingCount } from "@/lib/stock/waiting";
import { waitingByOptionWords, waitingWords } from "@/lib/stock/waiting";

/**
 * "3 people waiting for it" (DEC-174, automatic notices U24, #1155): the
 * customers who pressed "Tell me when it's back" on the business's site
 * and will be emailed once when it can be sold again. Which options they
 * wait for follows when it is more than the product as a whole ("2 for
 * Blue, 1 for any"). Shown only when someone waits; a count that couldn't
 * be read is left out, never shown as none. Counts only: the workspace
 * never sees their addresses.
 */
export function WaitingLine({
    count,
    titleOf,
    className,
}: {
    count: WaitingCount | null;
    /** An option's title ("Blue / M"), or null when it isn't sold now. */
    titleOf?: (variantId: string) => string | null;
    className?: string;
}) {
    const words = waitingWords(count?.waiting);
    if (!count || !words) return null;
    const which = titleOf ? waitingByOptionWords(count, titleOf) : null;
    return (
        <p
            data-waiting-line=""
            className={cn(
                "flex items-start gap-1.5 text-[13px] text-foreground",
                className,
            )}
        >
            <BellRing aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-semibold">{words}</span>
                {which ? ` · ${which}` : null}
            </span>
        </p>
    );
}
