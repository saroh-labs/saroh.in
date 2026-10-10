import { cn } from "@saroh/ui/lib/utils";
import { Lock, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
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

/**
 * One tag: the danger badge, in sentence case, with its kind in words. In a
 * header it is a size up and carries the warning glyph.
 */
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
        <StatusBadge
            tone="error"
            size={size === "header" ? "default" : "sm"}
            hint={title}
        >
            {size === "header" ? (
                <TriangleAlert aria-hidden className="size-3 shrink-0" />
            ) : null}
            {tagText(tag)}
        </StatusBadge>
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
        <StatusBadge tone="neutral" size={size === "header" ? "default" : "sm"}>
            <Lock aria-hidden className="size-3 shrink-0" />
            {children}
        </StatusBadge>
    );
}
