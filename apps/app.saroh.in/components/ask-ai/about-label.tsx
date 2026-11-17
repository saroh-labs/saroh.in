"use client";

import { cn } from "@saroh/ui/lib/utils";

/** The page a question is about, as a plum label (AF 2, 7). */
export function AboutLabel({
    words,
    plain = false,
    action,
}: {
    words: string;
    /** The whole business: a neutral label (AF 7). */
    plain?: boolean;
    action?: { label: string; icon: React.ReactNode; onClick: () => void };
}) {
    return (
        <span
            className={cn(
                "inline-flex h-7 max-w-full items-center gap-1 rounded-full pl-2.5 text-[12.5px] font-semibold",
                action ? "pr-0.5" : "pr-2.5",
                plain
                    ? "bg-muted text-neutral-700 dark:text-foreground"
                    : "bg-ask-subtle text-ask-subtle-foreground",
            )}
        >
            <span className="truncate">{words}</span>
            {action ? (
                <button
                    type="button"
                    aria-label={action.label}
                    title={action.label}
                    onClick={action.onClick}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:-my-2 coarse:size-11 [&_svg]:size-3.5"
                >
                    {action.icon}
                </button>
            ) : null}
        </span>
    );
}
