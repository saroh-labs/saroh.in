import { createHash } from "node:crypto";

/** How a publication came to be live (#278, #193). */
export const ReviewRoute = {
    /** A reviewer approved this exact draft, and someone else published it. */
    Approved: "APPROVED",
    /** It went live while a review was still outstanding. */
    Bypassed: "BYPASSED",
    /** Nobody was asked. The ordinary case, and not a lesser one. */
    None: "NONE",
} as const;

export type ReviewRoute = (typeof ReviewRoute)[keyof typeof ReviewRoute];

/** The verdict rows this module reasons about, newest first. */
export interface ApprovalRow {
    outcome: string;
    byUserId: string;
    draftFingerprint: string | null;
    createdAt: Date;
}

/**
 * A hash of the draft as publishing would write it (#278).
 *
 * #193 requires that an approval "does not survive later edits to that draft".
 * An approval therefore has to name WHICH draft it approved, and the only
 * honest name for it is the thing that would go live: the canonical snapshot.
 *
 * The timestamp is excluded — it is the one field guaranteed to differ between
 * two builds of identical work, and including it would make every approval
 * stale the instant it was written.
 */
export function draftFingerprint(snapshot: unknown): string {
    const { publishedAt: _ignored, ...rest } = (snapshot ?? {}) as Record<
        string,
        unknown
    >;
    return createHash("sha256").update(stableJson(rest)).digest("hex");
}

/**
 * JSON with object keys in a fixed order, so two identical drafts hash alike
 * however their objects were built. Arrays keep their order — theirs is the
 * content's own, and reordering sections IS a change to the draft.
 */
function stableJson(value: unknown): string {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

export interface ReviewStanding {
    /** A review was asked for or changes were asked for, and neither is settled. */
    outstanding: boolean;
    /** Which route a publish by `publisherUserId` would take right now. */
    route: ReviewRoute;
    /** The approval that settles it, when one does. */
    approvedBy: string | null;
    /**
     * True when the newest approval approved a DIFFERENT draft than the one
     * that would go live now — the "approve, then keep editing" case.
     */
    approvalIsStale: boolean;
}

/**
 * Where a site stands with its reviewers (#278).
 *
 * The rule, from #193 as amended and the decision recorded on #278:
 *
 *  - A review is outstanding from the moment it is REQUESTED, or changes are
 *    asked for, until an approval settles it. Before this existed, "pending"
 *    could not be expressed at all: only a standing CHANGES_REQUESTED counted,
 *    so a review nobody had answered was indistinguishable from no review.
 *
 *  - An approval settles it only if it approved THIS draft. Approve, change
 *    three sections, publish — the site used to read "Approved". The
 *    fingerprint is what makes that impossible.
 *
 *  - **An approval by the person publishing does not settle it**, and that
 *    publish records as a bypass. OWNER and ADMIN keep `site:approve` so a team
 *    with no reviewer can still sign off each other's work, but signing off
 *    your own work is not a second pair of eyes, and the record should not
 *    claim it was. Nothing is prevented — it is recorded.
 *
 * Pure, and given rows rather than a query, so the publish transaction can ask
 * the same question of its own client and get the same answer.
 */
export function reviewStanding(
    /** Every REQUESTED / APPROVED / CHANGES_REQUESTED row, newest first. */
    verdicts: ApprovalRow[],
    currentFingerprint: string,
    publisherUserId: string | null,
): ReviewStanding {
    const newestApproval = verdicts.find((v) => v.outcome === "APPROVED");
    const approvalIsStale =
        newestApproval !== undefined &&
        newestApproval.draftFingerprint !== currentFingerprint;

    // An approval that covers the draft as it stands, by someone other than
    // whoever is publishing.
    const settling = verdicts.find(
        (v) =>
            v.outcome === "APPROVED" &&
            v.draftFingerprint === currentFingerprint &&
            v.byUserId !== publisherUserId,
    );

    const asked = verdicts.find(
        (v) => v.outcome === "REQUESTED" || v.outcome === "CHANGES_REQUESTED",
    );

    // Nobody asked, and nobody approved: the ordinary publish.
    if (asked === undefined && settling === undefined) {
        return {
            outstanding: false,
            route: ReviewRoute.None,
            approvedBy: null,
            approvalIsStale,
        };
    }

    // An approval settles only what came before it.
    const settled =
        settling !== undefined &&
        (asked === undefined || settling.createdAt >= asked.createdAt);

    return {
        outstanding: !settled,
        route: settled ? ReviewRoute.Approved : ReviewRoute.Bypassed,
        approvedBy: settled ? settling.byUserId : null,
        approvalIsStale,
    };
}
