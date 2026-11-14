import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { ASK_AI_SETTINGS_HREF } from "@/lib/settings/developers";

/**
 * Plan and billing's usage row for Ask AI (plan 2026-11-13-001 U11):
 * "Ask AI questions · N of M", linking to Settings › Ask AI, where the
 * switch and who can use it are. A row only, not a link, for someone who
 * can't open that tab.
 */
export function AskAiUsageRow({
    used,
    limit,
    canOpen,
}: {
    used: number;
    /** Null: no cap on this plan. */
    limit: number | null;
    canOpen: boolean;
}) {
    const figure = limit === null ? `${used}` : `${used} of ${limit}`;
    const body = (
        <>
            <span className="min-w-0 flex-1 text-[14px] font-semibold">
                Ask AI questions
            </span>
            <span className="text-[13.5px] tabular-nums text-foreground/80">
                {figure}
            </span>
            {canOpen ? (
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            ) : null}
        </>
    );
    const row =
        "flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-card px-[18px] py-3";
    return canOpen ? (
        <Link
            href={ASK_AI_SETTINGS_HREF}
            className={`${row} active:bg-foreground/[0.07]`}
        >
            {body}
        </Link>
    ) : (
        <p className={row}>{body}</p>
    );
}
