/**
 * A business's way out, in words (#921, owner 9 Oct): the deletion trail
 * and the refunds a deletion waits on, as the business page shows them.
 * Client-safe: no server imports.
 */

/** The fields of a trail row these words read. */
export interface TrailRowLike {
    action: string;
    outcome: string;
    reason: string | null;
    actor: string | null;
    actorUserId: string;
    refunds: {
        count: number;
        owedMinorByCurrency: Record<string, number>;
    } | null;
    steps: { step: string; result: string }[] | null;
}

const TRAIL_TITLE: Record<string, string> = {
    "organization.deletion.scheduled": "Deletion scheduled",
    "organization.reinstated": "Reinstated",
    "organization.deletion.waiting_on_refunds": "Waiting on refunds",
    "organization.deleted": "Deleted",
};

const STEP: Record<string, string> = {
    jobs: "Pending jobs",
    billing: "Saroh billing",
    domains: "Custom domains",
    media: "Files",
    memberships: "Autopay mandates read",
    keys: "Payment and messaging keys",
};

/** What happened, as a title. */
export function trailTitle(
    row: Pick<TrailRowLike, "action" | "outcome">,
): string {
    if (row.action === "organization.deletion.cleanup") {
        return row.outcome === "SUCCESS"
            ? "Clean-up finished"
            : "Clean-up unfinished";
    }
    return TRAIL_TITLE[row.action] ?? row.action;
}

/** The line under it: what was owed, how each step went, or who and why. */
export function trailDetail(row: TrailRowLike): string {
    if (row.refunds) {
        const owed = Object.entries(row.refunds.owedMinorByCurrency)
            .map(([currency, minor]) => formatMinor(minor, currency))
            .join(" + ");
        const count = `${row.refunds.count} ${row.refunds.count === 1 ? "refund" : "refunds"} still owed to customers`;
        return owed ? `${count} · ${owed}` : count;
    }
    if (row.steps) {
        return row.steps
            .map(
                (s) =>
                    `${STEP[s.step] ?? s.step}: ${s.result === "ok" ? "done" : "failed"}`,
            )
            .join(" · ");
    }
    const who =
        row.actor ??
        (row.actorUserId.startsWith("system:")
            ? "Saroh, automatically"
            : "An operator");
    return [row.reason, who].filter(Boolean).join(" · ");
}

const STAGE: Record<string, string> = {
    OWED: "Not refunded yet",
    FAILED: "Refund failed",
    SENDING: "Being sent",
    CONFIRMING: "Sent, not confirmed",
};

/** Where one refund stands. */
export function refundStage(stage: string): string {
    return STAGE[stage] ?? stage;
}

/** An amount in minor units with its currency; "—" for none. */
export function formatMinor(
    minor: number | null,
    currency: string | null,
): string {
    if (minor === null) return "—";
    const major = minor / 100;
    if (!currency) {
        return new Intl.NumberFormat("en-IN", {
            maximumFractionDigits: 2,
        }).format(major);
    }
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(major);
}
