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

/**
 * On legal hold (DEC-119): shown beside the state wherever a business is
 * listed or opened, so nobody acts on one without seeing it.
 */
export function LegalHoldBadge() {
    return <Badge variant="error">Legal hold</Badge>;
}

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
    PAST_DUE: "Payment overdue",
    FAILED_JOBS: "Jobs failing",
    FAILED_WEBHOOKS: "Webhooks failing",
    // Its billing, domains, files or keys may still be there; Jobs says which.
    DELETION_CLEANUP: "Deletion clean-up unfinished",
    // Past its window; the business page lists the refunds (#921).
    DELETION_WAITING_REFUNDS: "Deletion waiting on refunds",
};
