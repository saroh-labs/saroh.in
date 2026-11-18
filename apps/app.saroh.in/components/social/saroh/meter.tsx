"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ProgressBar } from "@saroh/ui/progress-bar";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { SocialAccess } from "@/lib/social/saroh-social-types";
import { meterOf } from "@/lib/social/saroh-social-view";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

/**
 * "12 of 100 posts this month" with a thin bar (S7): amber from 90, full
 * at the limit, said in words each time. Without a count it says it isn't
 * known, never 0.
 */
export function UsageMeter({
    access,
    className,
}: {
    access: SocialAccess;
    className?: string;
}) {
    const zone = useBusinessZone();
    if (!access.usage) {
        return (
            <span
                data-social-meter="unknown"
                className={cn("text-[13px] text-muted-foreground", className)}
            >
                {SOCIAL_WORDS.meterUnknown}
            </span>
        );
    }
    const meter = meterOf(access.usage, zone);
    return (
        <span
            data-social-meter={meter.tone}
            className={cn(
                "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]",
                meter.tone === "ink"
                    ? "text-muted-foreground"
                    : "font-semibold text-foreground",
                className,
            )}
        >
            {meter.limit !== null ? (
                <ProgressBar
                    value={meter.used}
                    max={meter.limit}
                    size="xs"
                    tone={meter.tone}
                    label={meter.line}
                    className="w-[120px]"
                />
            ) : null}
            <span>{meter.line}</span>
        </span>
    );
}
