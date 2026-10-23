import type { Prisma } from "@saroh/database";

import type {
    ContactKind,
    LeadOwnedHow,
    LeadSource,
    LeadStage,
} from "./lead-rules";
import { isOverdue } from "./lead-rules";

/**
 * What the console gets for Saroh's own leads (DEC-169, U20). Built here,
 * from these selects only, so a reviewer reads one file to know what leaves:
 * a teammate's name, never their email; a lead's own contact details for the
 * staff who may see the lead.
 */

export const LEAD_SELECT = {
    id: true,
    name: true,
    email: true,
    emailKey: true,
    emailAt: true,
    signUpEmail: true,
    signUpEmailKey: true,
    signUpEmailAt: true,
    phone: true,
    city: true,
    kind: true,
    source: true,
    stage: true,
    stagedAt: true,
    followUpOn: true,
    notes: true,
    wonOrganizationId: true,
    wonAt: true,
    lostReason: true,
    ownerPlatformAdminId: true,
    ownerSince: true,
    ownedHow: true,
    websiteSeenAt: true,
    createdAt: true,
    owner: { select: { id: true, user: { select: { name: true } } } },
    log: {
        select: { happenedAt: true },
        orderBy: { happenedAt: "desc" },
        take: 1,
    },
} satisfies Prisma.SarohLeadSelect;

type LeadRow = Prisma.SarohLeadGetPayload<{ select: typeof LEAD_SELECT }>;

export interface LeadOwner {
    platformAdminId: string;
    name: string;
}

export interface LeadCard {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    kind: string | null;
    source: LeadSource;
    stage: LeadStage;
    stagedAt: Date;
    /** `YYYY-MM-DD`, the day in India. */
    followUpOn: string | null;
    overdue: boolean;
    owner: LeadOwner | null;
    ownedHow: LeadOwnedHow | null;
    lastContactAt: Date | null;
    createdAt: Date;
}

export interface LeadContact {
    id: string;
    kind: ContactKind;
    happenedAt: Date;
    minutes: number | null;
    summary: string;
    feedback: string | null;
    /** Who logged it, by name; null when their team record is gone. */
    by: string | null;
}

export interface LeadDetail extends LeadCard {
    signUpEmail: string | null;
    emailAt: Date | null;
    notes: string | null;
    wonOrganization: { id: string; name: string } | null;
    wonAt: Date | null;
    lostReason: string | null;
    ownerSince: Date | null;
    websiteSeenAt: Date | null;
    log: LeadContact[];
    /** May this staff member give it to a manager (unowned, all scope). */
    mayAssign: boolean;
    mayWrite: boolean;
}

export interface LeadsBoardQuery {
    /** All-scope only: "mine" is never needed, own scope sees only its own. */
    /** "all", "unowned" or a teammate's platformAdminId. */
    owner?: string;
    q?: string;
}

export interface LeadsBoard {
    /** "own" for an Account manager: the board is theirs alone. */
    scope: "all" | "own";
    today: string;
    leads: LeadCard[];
    /** More leads than the board shows; search narrows it. */
    truncated: boolean;
    counts: Record<LeadStage, number>;
    /** Open leads whose follow-up day has passed. */
    overdue: number;
    /** Open leads nobody owns; null for own scope, who can't see them. */
    unowned: number | null;
    mayAssign: boolean;
}

/** A teammate's name as other staff see it; never their email. */
export function teammateName(
    name: string | null,
    fallback = "A teammate",
): string {
    const text = name?.trim();
    // An empty name falls back too, which `??` alone would keep.
    return text === undefined || text === "" ? fallback : text;
}

const dayOf = (date: Date | null) =>
    date ? date.toISOString().slice(0, 10) : null;

const nameOf = (owner: LeadRow["owner"]): LeadOwner | null =>
    owner
        ? {
              platformAdminId: owner.id,
              name: teammateName(owner.user.name),
          }
        : null;

export function leadCard(row: LeadRow, today: string): LeadCard {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        city: row.city,
        kind: row.kind,
        source: row.source as LeadSource,
        stage: row.stage as LeadStage,
        stagedAt: row.stagedAt,
        followUpOn: dayOf(row.followUpOn),
        overdue: isOverdue(row, today),
        owner: nameOf(row.owner),
        ownedHow: row.ownedHow as LeadOwnedHow | null,
        lastContactAt: row.log[0]?.happenedAt ?? null,
        createdAt: row.createdAt,
    };
}

export function leadDetail(
    row: LeadRow,
    today: string,
    extra: Pick<
        LeadDetail,
        "log" | "wonOrganization" | "mayAssign" | "mayWrite"
    >,
): LeadDetail {
    return {
        ...leadCard(row, today),
        signUpEmail: row.signUpEmail,
        emailAt: row.emailAt,
        notes: row.notes,
        wonAt: row.wonAt,
        lostReason: row.lostReason,
        ownerSince: row.ownerSince,
        websiteSeenAt: row.websiteSeenAt,
        ...extra,
    };
}

export function contactView(row: {
    id: string;
    kind: string;
    happenedAt: Date;
    minutes: number | null;
    summary: string;
    feedback: string | null;
    author: { id: string; user: { name: string | null } } | null;
}): LeadContact {
    return {
        id: row.id,
        kind: row.kind as ContactKind,
        happenedAt: row.happenedAt,
        minutes: row.minutes,
        summary: row.summary,
        feedback: row.feedback,
        by: row.author ? teammateName(row.author.user.name) : null,
    };
}
