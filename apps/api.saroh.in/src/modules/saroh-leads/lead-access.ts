import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminRole } from "../admin/admin-permissions";
import type { StaffScope } from "../admin/staff-scope";
import { mayOwnerSee } from "../admin/staff-scope";
import { calendarDay, leadEmail, textOrNull } from "./lead-rules";
import type { LeadContact, LeadsBoardQuery } from "./lead-views";
import { contactView, LEAD_SELECT, teammateName } from "./lead-views";

/**
 * What Saroh's lead services share (DEC-169, U20): whether this scope may
 * see a lead, the checks a write makes (a free email, a real Account
 * manager, the business Won names) and the board's filters. Plain
 * functions over a transaction, so the reads and the writes run the same
 * rules.
 */

type Tx = Prisma.TransactionClient;

export const CONTACT_SELECT = {
    id: true,
    kind: true,
    happenedAt: true,
    minutes: true,
    summary: true,
    feedback: true,
    createdAt: true,
    author: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.SarohContactLogSelect;

export type LeadRow = Prisma.SarohLeadGetPayload<{
    select: typeof LEAD_SELECT;
}>;

/**
 * The lead, if this scope may see it: missing is a 404, another manager's
 * (or an unowned one, for an Account manager) a 403.
 */
export async function visibleLead(
    db: Pick<Tx, "sarohLead">,
    scope: StaffScope,
    leadId: string,
): Promise<LeadRow> {
    const lead = await db.sarohLead.findUnique({
        where: { id: leadId },
        select: LEAD_SELECT,
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (!mayOwnerSee(scope, lead.ownerPlatformAdminId)) {
        throw new ForbiddenException("That lead isn't one of yours.");
    }
    return lead;
}

/**
 * Support and Platform owner: the roles that hold `saroh-leads:write` for
 * every lead. Billing, Auditor and the rest hold neither.
 */
export function maySeeAll(staff: PlatformAdminInfo): boolean {
    return staff.roles.some(
        (role) =>
            role === AdminRole.PlatformOwner || role === AdminRole.Support,
    );
}

export function ownerFilter(
    scope: StaffScope,
    owner: LeadsBoardQuery["owner"],
): Prisma.SarohLeadWhereInput {
    if (scope.kind === "own" || !owner || owner === "all") return {};
    if (owner === "unowned") return { ownerPlatformAdminId: null };
    return { ownerPlatformAdminId: owner };
}

export function searchFilter(
    q: string | undefined,
): Prisma.SarohLeadWhereInput {
    const text = textOrNull(q);
    if (!text) return {};
    const like = { contains: text, mode: "insensitive" as const };
    return {
        OR: [
            { name: like },
            { email: like },
            { signUpEmail: like },
            { phone: like },
            { city: like },
        ],
    };
}

export function requiredName(value: string): string {
    const name = textOrNull(value);
    if (!name) throw new BadRequestException("Give the lead a name.");
    if (name.length > 120) {
        throw new BadRequestException("A name is 120 characters at most.");
    }
    return name;
}

export function optionalEmail(
    value: string | null | undefined,
): { email: string; key: string } | null {
    const text = textOrNull(value);
    if (!text) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        throw new BadRequestException("That email doesn't look right.");
    }
    return leadEmail(text);
}

export function optionalDay(value: string | null | undefined): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException("A follow-up is a day: YYYY-MM-DD.");
    }
    const day = calendarDay(value);
    if (Number.isNaN(day.getTime())) {
        throw new BadRequestException("That isn't a day.");
    }
    return day;
}

/** A teammate's name as the console shows it to other staff. */
export function ownerName(
    owner: { user: { name: string | null } } | null | undefined,
): string {
    return teammateName(owner?.user.name ?? null, "another teammate");
}

/**
 * Refuse an email that is already on another lead, as its email or its
 * sign-up email, saying whose it is: the first to record it owns it.
 */
export async function assertEmailFree(
    tx: Tx,
    key: string,
    selfId: string | null,
): Promise<void> {
    const taken = await tx.sarohLead.findFirst({
        where: {
            OR: [{ emailKey: key }, { signUpEmailKey: key }],
            ...(selfId ? { id: { not: selfId } } : {}),
        },
        select: {
            id: true,
            ownerPlatformAdminId: true,
            owner: { select: { user: { select: { name: true } } } },
        },
    });
    if (!taken) return;
    const message = taken.ownerPlatformAdminId
        ? `That email is already a lead, ${ownerName(taken.owner)}'s.`
        : "That email is already a lead, not yet given to anyone. Ask Support to give it to you.";
    throw new ConflictException({
        message,
        details: {
            code: "LEAD_TAKEN",
            owner: taken.ownerPlatformAdminId ? ownerName(taken.owner) : null,
        },
    });
}

export async function candidatesFor(
    db: Pick<Tx, "organization">,
    lead: Pick<LeadRow, "email" | "signUpEmail">,
): Promise<{ id: string; name: string }[]> {
    const emails = [lead.email, lead.signUpEmail].filter(
        (email): email is string => Boolean(email),
    );
    if (emails.length === 0) return [];
    return db.organization.findMany({
        where: {
            memberships: {
                some: {
                    role: "OWNER",
                    user: {
                        OR: emails.map((email) => ({
                            email: {
                                equals: email,
                                mode: "insensitive" as const,
                            },
                        })),
                    },
                },
            },
        },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 20,
    });
}

/**
 * Won names a real business. An Account manager may name only one of the
 * lead's candidates (a business owned by its email): they can't see every
 * business. Staff with every lead in scope may name any.
 */
export async function assertWonBusiness(
    tx: Tx,
    scope: StaffScope,
    lead: LeadRow,
    organizationId: string,
): Promise<void> {
    if (scope.kind === "own") {
        const candidates = await candidatesFor(tx, lead);
        if (!candidates.some((c) => c.id === organizationId)) {
            throw new BadRequestException(
                "Pick the business signed up with this lead's email or sign-up email.",
            );
        }
        return;
    }
    const exists = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
    });
    if (!exists) throw new BadRequestException("That business doesn't exist.");
}

export function activeAccountManager(
    now: Date,
): Prisma.PlatformAdminRoleAssignmentWhereInput {
    return {
        role: AdminRole.AccountManager,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
}

export async function assertAccountManager(
    tx: Tx,
    platformAdminId: string,
    now: Date,
): Promise<void> {
    const admin = await tx.platformAdmin.findFirst({
        where: {
            id: platformAdminId,
            revokedAt: null,
            roleAssignments: { some: activeAccountManager(now) },
        },
        select: { id: true },
    });
    if (!admin) {
        throw new BadRequestException(
            "Leads go to someone who is an Account manager now.",
        );
    }
}

/** A lead's calls and visits, newest first. */
export async function contactsOf(
    db: Pick<Tx, "sarohContactLog">,
    leadId: string,
): Promise<LeadContact[]> {
    const rows = await db.sarohContactLog.findMany({
        where: { leadId },
        select: CONTACT_SELECT,
        orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
        take: 200,
    });
    return rows.map(contactView);
}
