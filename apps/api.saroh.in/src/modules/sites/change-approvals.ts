import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    auditMetadata,
} from "../audit/audit.service";
import { allows } from "../organizations/organization-policy";
import type { ChangeUnit } from "./change-units";
import { LEAVE_OUT_GONE_MESSAGE } from "./change-units";
import { SYSTEM_EDITOR } from "./draft-editors";
import { queueReviewAlert } from "./review-alert-queue";

/**
 * Per-change approval (DEC-226, website area U9, KTD-6).
 *
 * A reviewer, an admin or the owner approves one change unit, or asks for
 * changes with a reason. The verdict is bound to the unit's key and
 * fingerprint: a later edit to that change voids an approval (recorded as a
 * VOIDED row and an audit event when a publish finds it). Nobody approves a
 * change they made last.
 *
 * With "Publishing needs approval" on (Pro, DEC-103), a publish carries
 * only approved changes and changes an owner or admin made last; a
 * teammate's change still waiting is left out and stays in the draft,
 * unless an owner overrides (recorded as today, `live-pointer.ts`).
 */

export type ChangeVerdict = "APPROVED" | "CHANGES_REQUESTED";

/** What a teammate with no name is called to someone who can't see the team. */
export const UNNAMED_TEAMMATE = "A teammate";

/**
 * A teammate's name as `ctx` may see it (01 W1, 21 Nov 2026): their email
 * when they have no name only to someone who may read the team
 * (`member:read`); a reviewer, who may not, reads "A teammate".
 */
export function personName(
    ctx: OrganizationContext,
    user: { name: string | null; email: string },
): string {
    const name = user.name?.trim();
    if (name) return name;
    return allows(ctx, "member:read") ? user.email : UNNAMED_TEAMMATE;
}

/** What Saroh's own writes ({@link SYSTEM_EDITOR}: a template upgrade, a menu entry) are signed. */
export const SAROH_EDITOR_NAME = "Saroh";

/**
 * Display names for user ids, each by {@link personName}, with Saroh's own
 * writes named "Saroh" rather than none (History, Publish, Changes).
 */
export function namesOf(
    ctx: OrganizationContext,
    users: readonly { id: string; name: string | null; email: string }[],
): Map<string, string> {
    return new Map([
        [SYSTEM_EDITOR, SAROH_EDITOR_NAME],
        ...users.map((u): [string, string] => [u.id, personName(ctx, u)]),
    ]);
}

/**
 * What a verdict binds to: a site's change unit, or a whole post
 * (`post:<postId>`, O7, KTD-E6), which publishes on its own.
 */
export type ApprovalUnit = Pick<ChangeUnit, "key" | "fingerprint" | "editedBy">;

export const APPROVAL_OFF_MESSAGE =
    "Publishing needs approval isn't on for this site, so there's nothing to approve.";

export const OWN_CHANGE_MESSAGE =
    "You can't approve a change you made. Someone else on the team can.";

export type UnitApprovalState =
    /** Made last by an owner or admin: needs nobody's approval. */
    "not-needed" | "approved" | "asked" | "waiting";

export interface UnitApproval {
    state: UnitApprovalState;
    /** Who approved or asked, for those states. */
    byUserId: string | null;
    reason: string | null;
    at: string | null;
    /** An approval this change no longer matches: edited after it. */
    voided: boolean;
}

/** A stored verdict, as {@link unitApprovals} reads it. */
export interface UnitVerdictRow {
    unitKey: string;
    unitFingerprint: string;
    byUserId: string;
    outcome: string;
    reason: string | null;
    createdAt: Date;
}

/**
 * Each unit's approval state. Pure. `rows` newest first; `leads` the user
 * ids of the business's owners and admins.
 */
export function unitApprovals(
    units: readonly ApprovalUnit[],
    rows: readonly UnitVerdictRow[],
    leads: ReadonlySet<string>,
): Map<string, UnitApproval> {
    const out = new Map<string, UnitApproval>();
    // Newest first: the first row for a key is its verdict.
    const newest = new Map<string, UnitVerdictRow>();
    for (const r of rows) if (!newest.has(r.unitKey)) newest.set(r.unitKey, r);
    for (const u of units) {
        const row = newest.get(u.key);
        const covers =
            row?.unitFingerprint === u.fingerprint &&
            row.byUserId !== u.editedBy;
        const verdict = covers ? row : null;
        const state: UnitApprovalState =
            u.editedBy && leads.has(u.editedBy)
                ? "not-needed"
                : verdict?.outcome === "APPROVED"
                  ? "approved"
                  : verdict?.outcome === "CHANGES_REQUESTED"
                    ? "asked"
                    : "waiting";
        out.set(u.key, {
            state,
            byUserId: verdict?.byUserId ?? null,
            reason:
                verdict?.outcome === "CHANGES_REQUESTED"
                    ? verdict.reason
                    : null,
            at: verdict?.createdAt.toISOString() ?? null,
            voided:
                row !== undefined &&
                (row.outcome === "VOIDED" ||
                    (row.outcome === "APPROVED" && !covers)),
        });
    }
    return out;
}

type ReadTx = Pick<
    Prisma.TransactionClient,
    "siteChangeApproval" | "membership"
>;

/**
 * The newest verdict on each of `unitKeys` (04 W3, 21 Nov 2026: never the
 * site's whole history, which grows for good), and the editors who are
 * owners or admins.
 */
export async function readUnitVerdicts(
    client: ReadTx,
    input: {
        organizationId: string;
        siteId: string;
        editors: string[];
        unitKeys: readonly string[];
    },
): Promise<{ rows: UnitVerdictRow[]; leads: Set<string> }> {
    const [rows, members] = await Promise.all([
        input.unitKeys.length === 0
            ? Promise.resolve([])
            : client.siteChangeApproval.findMany({
                  where: {
                      organizationId: input.organizationId,
                      siteId: input.siteId,
                      unitKey: { in: [...new Set(input.unitKeys)] },
                  },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  distinct: ["unitKey"],
                  select: {
                      unitKey: true,
                      unitFingerprint: true,
                      byUserId: true,
                      outcome: true,
                      reason: true,
                      createdAt: true,
                  },
              }),
        input.editors.length > 0
            ? client.membership.findMany({
                  where: {
                      organizationId: input.organizationId,
                      userId: { in: input.editors },
                      role: { in: ["OWNER", "ADMIN"] },
                  },
                  select: { userId: true },
              })
            : Promise.resolve([]),
    ]);
    return { rows, leads: new Set(members.map((m) => m.userId)) };
}

export function editorsOf(units: readonly ApprovalUnit[]): string[] {
    return [
        ...new Set(
            units.map((u) => u.editedBy).filter((id): id is string => !!id),
        ),
    ];
}

/**
 * The units a publish must leave out while "Publishing needs approval"
 * applies: a teammate's change nobody approved. Inside the publish's
 * transaction; an approval a later edit voided is recorded once here.
 */
export async function heldForApproval(
    tx: ReadTx & Pick<Prisma.TransactionClient, "auditEvent">,
    input: {
        organizationId: string;
        siteId: string;
        userId: string;
        units: readonly ApprovalUnit[];
    },
): Promise<string[]> {
    const { rows, leads } = await readUnitVerdicts(tx, {
        ...input,
        editors: editorsOf(input.units),
        unitKeys: input.units.map((u) => u.key),
    });
    const states = unitApprovals(input.units, rows, leads);
    // One row per key (`distinct`): its newest.
    const newestOf = new Map(rows.map((r) => [r.unitKey, r]));
    const voided = input.units.filter((u) => {
        const newest = newestOf.get(u.key);
        return newest?.outcome === "APPROVED" && states.get(u.key)?.voided;
    });
    if (voided.length > 0) {
        await tx.siteChangeApproval.createMany({
            data: voided.map((u) => ({
                organizationId: input.organizationId,
                siteId: input.siteId,
                unitKey: u.key,
                unitFingerprint: u.fingerprint,
                byUserId: input.userId,
                outcome: "VOIDED",
            })),
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteChangeApprovalVoided,
                actorUserId: input.userId,
                organizationId: input.organizationId,
                targetType: "site",
                targetId: input.siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(undefined, {
                    units: voided.map((u) => u.key),
                }),
            },
            select: { id: true },
        });
    }
    return input.units
        .filter((u) => {
            const s = states.get(u.key)?.state;
            return s !== "not-needed" && s !== "approved";
        })
        .map((u) => u.key);
}

/**
 * Record a verdict on `keys` of `units` (the units waiting now), inside
 * `tx`. 400 for a key not waiting any more; 403 for a change the caller
 * made last. Asking for changes tells each change's last editor.
 */
export async function recordUnitVerdicts(
    tx: Pick<
        Prisma.TransactionClient,
        "siteChangeApproval" | "job" | "siteReviewer" | "$executeRaw"
    >,
    ctx: OrganizationContext,
    input: {
        siteId: string;
        units: readonly ApprovalUnit[];
        keys: readonly string[];
        outcome: ChangeVerdict;
        reason?: string | null;
        /** No per-change alert: the whole review's verdict tells the team. */
        quiet?: boolean;
    },
): Promise<{ recorded: number }> {
    const byKey = new Map(input.units.map((u) => [u.key, u]));
    const chosen = input.keys.map((k) => byKey.get(k));
    if (chosen.some((u) => u === undefined)) {
        throw new BadRequestException({
            message: LEAVE_OUT_GONE_MESSAGE,
            details: { reason: "changeGone" },
        });
    }
    const units = chosen as ApprovalUnit[];
    if (units.some((u) => u.editedBy === ctx.userId)) {
        throw new ForbiddenException({
            message: OWN_CHANGE_MESSAGE,
            details: { reason: "ownChange" },
        });
    }
    const reason =
        input.outcome === "CHANGES_REQUESTED" ? (input.reason ?? null) : null;
    // One verdict at a time per site: the same verdict sent twice at once
    // (a double click, a retry) is written once (05 L2, 21 Nov 2026).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`site-verdict:${input.siteId}`}))`;
    const newest = await Promise.all(
        units.map((u) =>
            tx.siteChangeApproval.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    siteId: input.siteId,
                    unitKey: u.key,
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: {
                    unitFingerprint: true,
                    byUserId: true,
                    outcome: true,
                    reason: true,
                },
            }),
        ),
    );
    const fresh = units.filter((u, i) => {
        const r = newest[i];
        return !(
            r?.unitFingerprint === u.fingerprint &&
            r.byUserId === ctx.userId &&
            r.outcome === input.outcome &&
            r.reason === reason
        );
    });
    const rows = await Promise.all(
        fresh.map((u) =>
            tx.siteChangeApproval.create({
                data: {
                    organizationId: ctx.organizationId,
                    siteId: input.siteId,
                    unitKey: u.key,
                    unitFingerprint: u.fingerprint,
                    byUserId: ctx.userId,
                    outcome: input.outcome,
                    reason,
                },
                select: { id: true },
            }),
        ),
    );
    if (input.outcome === "CHANGES_REQUESTED" && !input.quiet) {
        // One alert per person whose changes were asked about (UX-043).
        const told = new Set<string>();
        for (const [i, u] of fresh.entries()) {
            if (!u.editedBy || told.has(u.editedBy)) continue;
            told.add(u.editedBy);
            await queueReviewAlert(tx, ctx.organizationId, {
                event: "review",
                about: "change",
                changeApprovalId: rows[i].id,
                editorUserId: u.editedBy,
            });
        }
    }
    // A repeat is already recorded: the same answer as the first.
    return { recorded: units.length };
}
