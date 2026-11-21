import { createHash } from "node:crypto";

import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows } from "../organizations/organization-policy";
import type {
    ApprovalUnit,
    UnitApprovalState,
} from "../sites/change-approvals";
import {
    heldForApproval,
    personName,
    readUnitVerdicts,
    unitApprovals,
} from "../sites/change-approvals";
import {
    approvalApplies,
    changesAwaitApproval,
} from "../sites/publish-approval";
import { websiteAreaOn } from "../sites/website-area-switch";
import type { RevisionState } from "./post-revisions";
import {
    EDIT_REASONS,
    REVISION_FIELDS,
    revisionStateOf,
} from "./post-revisions";

/**
 * A post's approval (O7, owner 20 Nov 2026; KTD-E6). With "Publishing needs
 * approval" on, a teammate who is not an owner or an admin sends a post for
 * approval instead of publishing it. The post is one change unit,
 * `post:<postId>`, and the verdict is a `SiteChangeApproval` row like a site
 * change's: bound to the post's fingerprint, so a later edit voids it, and
 * never given by the post's last editor. Owner and admin posts need none
 * (DEC-103). Only with the Website area on (owner, 20 Nov 2026): off, the
 * old post editor has no Send for approval, so posts publish as before.
 */

type Tx = Prisma.TransactionClient;

export function postUnitKey(postId: string): string {
    return `post:${postId}`;
}

const LEAD_ROLES = ["OWNER", "ADMIN"];

/** Changes when anything that goes live with the post changes. */
export function postFingerprint(s: RevisionState): string {
    return createHash("sha256")
        .update(
            JSON.stringify([
                s.title,
                s.content,
                s.excerpt,
                s.image,
                s.imageAlt,
                s.seoTitle,
                s.seoDescription,
                s.shareImageUrl,
                s.slug,
                s.categoryId,
                s.authorId,
            ]),
        )
        .digest("hex");
}

/** The post as one change unit: its key, fingerprint and last editor. */
export async function postApprovalUnit(
    tx: Pick<Tx, "postRevision">,
    postId: string,
    state: RevisionState,
): Promise<ApprovalUnit> {
    const last = await tx.postRevision.findFirst({
        where: { postId, reason: { in: EDIT_REASONS } },
        orderBy: { createdAt: "desc" },
        select: { savedByUserId: true },
    });
    return {
        key: postUnitKey(postId),
        fingerprint: postFingerprint(state),
        // A post older than its revisions: whoever wrote it.
        editedBy: last?.savedByUserId ?? state.authorId,
    };
}

/**
 * Whether the post has an open request (R1): a `sent` revision newer than
 * its last `approved` or `published` one. Approve and Ask for changes
 * answer a request; without one there is nothing to answer.
 */
export async function postRequestOpen(
    tx: Pick<Tx, "postRevision">,
    postId: string,
): Promise<boolean> {
    const last = await tx.postRevision.findFirst({
        where: { postId, reason: { in: ["sent", "approved", "published"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { reason: true },
    });
    return last?.reason === "sent";
}

/** The caller is an owner or an admin: their posts need no approval. */
export function isLeadRole(ctx: Pick<OrganizationContext, "role">): boolean {
    return LEAD_ROLES.includes(ctx.role);
}

/** Whether `userId` is an owner or an admin of the business now. */
export async function isLead(
    tx: Pick<Tx, "membership">,
    organizationId: string,
    userId: string,
): Promise<boolean> {
    const m = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
    });
    return m !== null && LEAD_ROLES.includes(m.role);
}

/**
 * Whether "Publishing needs approval" applies to the site's posts now
 * (DEC-103): never while the Website area is off.
 */
export async function postApprovalOn(
    tx: Pick<Tx, "site">,
    organizationId: string,
    siteId: string,
): Promise<boolean> {
    if (!websiteAreaOn()) return false;
    const site = await tx.site.findFirst({
        where: { id: siteId, organizationId },
        select: { publishNeedsApproval: true },
    });
    return approvalApplies(organizationId, site?.publishNeedsApproval ?? false);
}

/**
 * Whether the post must wait for approval before `userId` can put it live:
 * the setting applies, they aren't an owner or admin, and nobody approved
 * the post as it is now. An approval a later edit voided is recorded once,
 * as a site change's is.
 */
export async function postHeldForApproval(
    tx: Tx,
    input: {
        organizationId: string;
        siteId: string;
        postId: string;
        userId: string;
        lead: boolean;
    },
): Promise<boolean> {
    if (input.lead) return false;
    if (!(await postApprovalOn(tx, input.organizationId, input.siteId))) {
        return false;
    }
    const post = await tx.post.findFirstOrThrow({
        where: { id: input.postId, siteId: input.siteId },
        select: REVISION_FIELDS,
    });
    const unit = await postApprovalUnit(
        tx,
        input.postId,
        revisionStateOf(post),
    );
    const held = await heldForApproval(tx, { ...input, units: [unit] });
    return held.length > 0;
}

/** Publish post's refusal: the site's words, naming the post. */
export async function assertPostApproved(
    tx: Tx,
    input: Parameters<typeof postHeldForApproval>[1],
): Promise<void> {
    if (await postHeldForApproval(tx, input)) {
        throw changesAwaitApproval([postUnitKey(input.postId)]);
    }
}

export interface PostApprover {
    id: string;
    name: string;
    role: "REVIEWER" | "OWNER" | "ADMIN";
}

type ApproverTx = Pick<Tx, "siteReviewer" | "membership">;

/** Who may approve a post on the site: its reviewers, the admins, the owner. */
export async function approversOf(
    tx: ApproverTx,
    ctx: OrganizationContext,
    siteId: string,
): Promise<PostApprover[]> {
    const { organizationId } = ctx;
    const [reviewers, leads] = await Promise.all([
        tx.siteReviewer.findMany({
            where: { organizationId, siteId },
            orderBy: { createdAt: "asc" },
            select: { user: { select: { id: true, name: true, email: true } } },
        }),
        tx.membership.findMany({
            where: { organizationId, role: { in: LEAD_ROLES } },
            orderBy: { createdAt: "asc" },
            select: {
                role: true,
                user: { select: { id: true, name: true, email: true } },
            },
        }),
    ]);
    const out = new Map<string, PostApprover>();
    for (const { user } of reviewers) {
        out.set(user.id, {
            id: user.id,
            name: personName(ctx, user),
            role: "REVIEWER",
        });
    }
    for (const { user, role } of leads) {
        out.set(user.id, {
            id: user.id,
            name: personName(ctx, user),
            role: role as "OWNER" | "ADMIN",
        });
    }
    return [...out.values()];
}

export async function approverIdsOf(
    tx: ApproverTx,
    organizationId: string,
    siteId: string,
): Promise<string[]> {
    // Ids only: no name is read, so the caller's view doesn't matter.
    const ctx: OrganizationContext = {
        organizationId,
        userId: "",
        role: "MEMBER",
    };
    return (await approversOf(tx, ctx, siteId)).map((a) => a.id);
}

/** What the post editor draws for approval (the band, the sheet's foot). */
export interface PostApprovalView {
    /** "Publishing needs approval" applies to this site now. */
    on: boolean;
    /** This caller's Publish post is Send for approval. */
    mustAsk: boolean;
    /** This caller may approve or ask for changes (not the last editor). */
    canApprove: boolean;
    state: UnitApprovalState;
    /** What an approval now binds to; sent back with Approve. */
    fingerprint: string;
    lastEditorId: string | null;
    /** The verdict standing on the post as it is now, if any. */
    verdict: {
        by: { id: string; name: string } | null;
        at: string | null;
        reason: string | null;
    } | null;
    /** The open request: sent and not yet published. */
    request: {
        by: { id: string; name: string } | null;
        note: string | null;
        at: string;
    } | null;
    /** Everyone who may approve it but its last editor. */
    approvers: PostApprover[];
}

type ViewTx = Pick<
    Tx,
    | "site"
    | "postRevision"
    | "siteChangeApproval"
    | "membership"
    | "siteReviewer"
    | "user"
>;

/** The post's approval as the caller sees it. Reads only. */
export async function readPostApproval(
    tx: ViewTx,
    ctx: OrganizationContext,
    input: { siteId: string; postId: string; state: RevisionState },
): Promise<PostApprovalView> {
    const { organizationId } = ctx;
    const unit = await postApprovalUnit(tx, input.postId, input.state);
    const [on, verdicts, approvers, sent, published, asked] = await Promise.all(
        [
            postApprovalOn(tx, organizationId, input.siteId),
            readUnitVerdicts(tx, {
                organizationId,
                siteId: input.siteId,
                editors: unit.editedBy ? [unit.editedBy] : [],
            }),
            approversOf(tx, ctx, input.siteId),
            tx.postRevision.findFirst({
                where: { postId: input.postId, reason: "sent" },
                orderBy: { createdAt: "desc" },
                select: {
                    note: true,
                    createdAt: true,
                    savedBy: { select: { id: true, name: true, email: true } },
                },
            }),
            tx.postRevision.findFirst({
                where: { postId: input.postId, reason: "published" },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            }),
            postRequestOpen(tx, input.postId),
        ],
    );
    const approval = unitApprovals([unit], verdicts.rows, verdicts.leads).get(
        unit.key,
    );
    const state = approval?.state ?? "waiting";
    const byId = approval?.byUserId ?? null;
    const by = byId
        ? await tx.user.findUnique({
              where: { id: byId },
              select: { id: true, name: true, email: true },
          })
        : null;
    const open = sent && (!published || published.createdAt < sent.createdAt);
    const person = (u: { id: string; name: string | null; email: string }) => ({
        id: u.id,
        name: personName(ctx, u),
    });
    return {
        on,
        mustAsk:
            on &&
            !isLeadRole(ctx) &&
            state !== "not-needed" &&
            state !== "approved",
        canApprove:
            on &&
            asked &&
            allows(ctx, "site:approve") &&
            ctx.userId !== unit.editedBy,
        state,
        fingerprint: unit.fingerprint,
        lastEditorId: unit.editedBy,
        verdict: approval?.at
            ? {
                  by: by ? person(by) : null,
                  at: approval.at,
                  reason: approval.reason,
              }
            : null,
        request: open
            ? {
                  by: sent.savedBy ? person(sent.savedBy) : null,
                  note: sent.note,
                  at: sent.createdAt.toISOString(),
              }
            : null,
        approvers: approvers.filter((a) => a.id !== unit.editedBy),
    };
}
