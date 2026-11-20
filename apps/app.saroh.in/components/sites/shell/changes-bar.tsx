"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";

import type { SitePublishData } from "@/components/sites/publish/site-publish";
import { SitePublish } from "@/components/sites/publish/site-publish";
import { count } from "@/lib/format/plural";

/**
 * A phone's bar above the tab bar while changes wait (WXHOverviewPhone):
 * how many, and Review and publish, which opens the Publish sheet (U11)
 * the header's chip opens. Drawn only when something waits and this
 * person may publish; the count is `siteStatus`'s, the header's own.
 */
export function ChangesBar({
    siteId,
    waiting,
    publish = null,
}: {
    siteId: string;
    waiting: number;
    publish?: SitePublishData | null;
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
            {publish ? (
                <SitePublish
                    data={publish}
                    trigger={(open) => (
                        <Button
                            type="button"
                            className="coarse:h-11"
                            aria-haspopup="dialog"
                            onClick={open}
                        >
                            Review and publish
                        </Button>
                    )}
                />
            ) : (
                <Button asChild className="coarse:h-11">
                    <Link href={`/sites/${siteId}`}>Review and publish</Link>
                </Button>
            )}
        </div>
    );
}
