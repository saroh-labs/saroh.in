import { cn } from "@saroh/ui/lib/utils";
import { Lock, TriangleAlert } from "lucide-react";

import type { AttentionTagInput } from "@/lib/customer-workspace/attention";
import { hiddenText, tagText } from "@/lib/customer-workspace/attention";

/**
 * Needs attention tags (DEC-040, C5), as "Saroh Customer Detail" draws them
 * by the name and "Saroh Customers" on each row: a small red pill that says
 * the kind in words — "Allergy: Sesame" — so it never rests on colour alone.
 *
 * Only what the API sent this viewer is drawn. A sensitive entry a role may
 * not see never reaches the page; it is counted, and the count is said
 * ("1 more note you can't see").
 *
 * `size="header"` is Customer Detail's, with the warning mark; `"row"` is
 * the list's, smaller and plain. The list (C4) renders it with a row's
 * `attention` and `hiddenSensitiveCount`.
 */
export function AttentionTags({
    tags,
    hiddenCount = 0,
    size = "row",
    className,
}: {
    tags: (AttentionTagInput & { id?: string; title?: string })[];
    hiddenCount?: number;
    size?: "header" | "row";
    className?: string;
}) {
    const hidden = hiddenText(hiddenCount, tags.length);
    if (!tags.length && !hidden) return null;
    return (
        <span
            className={cn(
                "inline-flex min-w-0 flex-wrap items-center",
                size === "header" ? "gap-[9px]" : "gap-x-1.5 gap-y-1",
                className,
            )}
        >
            {tags.map((t) => (
                <AttentionTag
                    key={t.id ?? tagText(t)}
                    tag={t}
                    title={t.title}
                    size={size}
                />
            ))}
            {hidden ? <HiddenTag size={size}>{hidden}</HiddenTag> : null}
        </span>
    );
}

const PILL =
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold uppercase tracking-[0.04em]";

/** One tag: the design's danger pill, uppercase, with its kind in words. */
export function AttentionTag({
    tag,
    title,
    size = "row",
}: {
    tag: AttentionTagInput;
    title?: string;
    size?: "header" | "row";
}) {
    return (
        <span
            title={title}
            className={cn(
                PILL,
                "bg-destructive-subtle text-destructive-subtle-foreground",
                size === "header"
                    ? "gap-[5px] px-2 py-0.5 text-[11px] leading-[1.3]"
                    : "px-[7px] py-px text-[11px] leading-[1.35]",
            )}
        >
            {size === "header" ? (
                <TriangleAlert
                    aria-hidden
                    strokeWidth={2.4}
                    className="size-[11px] shrink-0"
                />
            ) : null}
            {tagText(tag)}
        </span>
    );
}

/** What this role can't see, said as a count and never as its words. */
function HiddenTag({
    size,
    children,
}: {
    size: "header" | "row";
    children: React.ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted font-medium text-muted-foreground",
                size === "header"
                    ? "px-2 py-0.5 text-[12px] leading-[1.3]"
                    : "px-[7px] py-px text-[11px] leading-[1.35]",
            )}
        >
            <Lock aria-hidden className="size-[11px] shrink-0" />
            {children}
        </span>
    );
}
