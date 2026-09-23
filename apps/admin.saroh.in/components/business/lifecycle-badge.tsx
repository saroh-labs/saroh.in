import { Badge } from "@saroh/ui/badge";

import type { AttentionReason, LifecycleStatus } from "@/lib/businesses";

const LIFECYCLE: Record<
    LifecycleStatus,
    { label: string; variant: "success" | "warning" | "error" | "neutral" }
> = {
    ACTIVE: { label: "Active", variant: "success" },
    SUSPENDED: { label: "Suspended", variant: "warning" },
    PENDING_DELETION: { label: "Deletion scheduled", variant: "error" },
    DELETED_RETAINED: { label: "Deleted", variant: "neutral" },
};

/** A business's state, in words, as a status pill. */
export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
    // A state this console does not know yet still shows, in its own words.
    const entry = (LIFECYCLE as Partial<typeof LIFECYCLE>)[status] ?? {
        label: status,
        variant: "neutral" as const,
    };
    return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
    PAST_DUE: "Payment overdue",
    FAILED_JOBS: "Jobs failing",
    FAILED_WEBHOOKS: "Webhooks failing",
};
