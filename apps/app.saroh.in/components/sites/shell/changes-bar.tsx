import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { count } from "@/lib/format/plural";

/**
 * A phone's bar above the tab bar while changes wait (WXHOverviewPhone):
 * how many, and Review and publish. Drawn only when something waits and
 * this person may publish; the count is `siteStatus`'s, the header's own.
 * Publish lives in the editor until the Publish sheet comes out (U11).
 */
export function ChangesBar({
    siteId,
    waiting,
}: {
    siteId: string;
    waiting: number;
}) {
    if (waiting <= 0) return null;
    return (
        <div
            data-changes-bar=""
            className="fixed inset-x-0 bottom-[var(--tab-bar-inset,0px)] z-30 flex items-center gap-3 border-t border-border bg-card px-4 pb-3 pt-2.5 min-[760px]:hidden print:hidden"
        >
            <p className="min-w-0 flex-1 font-semibold">
                {count(waiting, "change")} waiting
            </p>
            <Button asChild className="coarse:h-11">
                <Link href={`/sites/${siteId}`}>Review and publish</Link>
            </Button>
        </div>
    );
}
