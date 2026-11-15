import type { ReactNode } from "react";

import { cn } from "@saroh/marketing/cn";

const TONE = {
    ok: "bg-mk-ok-tint text-mk-ok",
    plain: "bg-mk-hover text-mk-copy",
    warn: "bg-[#FCEBDD] text-[#9A3412]",
} as const;

/**
 * A status as the app draws it on a row ("Paid", "Not paid", "Draft",
 * "Active"): a 24px pill, 12px words. Drawn, never a control.
 */
export function Tag({
    tone = "plain",
    className,
    children,
}: {
    tone?: keyof typeof TONE;
    className?: string;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold",
                TONE[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}
