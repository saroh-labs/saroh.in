import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { prismaErrorCode } from "../../common/prisma-errors";
import { settleMonthBeforeLinkInTx } from "../commission/commission-settle";
import type { LinkKind, LinkSource } from "../organizations/account-manager";
import {
    BILLING_STATES,
    membersMayOpen,
} from "../organizations/organization-lifecycle.policy";
import { teammateName } from "../saroh-leads/lead-views";
import { SHARE_OUT_MAX } from "./account-manager.dto";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import { requireReason } from "./admin-staff.service";
import { activeManagerWhere, MANAGER_ENDED_ACTION } from "./manager-links";
import type { ShareOutBusiness, ShareOutManager } from "./share-out";
import { planShareOut, shareOutOrder } from "./share-out";
import { scopeForStaff } from "./staff-scope";

type Tx = Prisma.TransactionClient;

/** A business's account manager, as the console shows it. */
export interface ManagerView {
    platformAdminId: string;
    name: string;
    /** BROUGHT_IN or ASSIGNED. */
    kind: LinkKind;
    /** How the link started: LINK, CODE, LEAD_EMAIL or ASSIGNED. */
    source: LinkSource;
    since: Date;
}

/** Someone a business can be given to, with how many they look after. */
export interface ManagerCandidate {
    platformAdminId: string;
    name: string;
    businesses: number;
    /** Null: no cap set. */
    capacity: number | null;
    /** They look after this business now. */
    current: boolean;
}

/** A business with no account manager, as the Team list shows it (U17). */
export interface UnassignedBusiness {
    organizationId: string;
    name: string;
    slug: string;
    /** It pays Saroh: on a priced plan, or billed by the provider. */
    paying: boolean;
    createdAt: Date;
}

/** How many the Team list shows; Share out evenly takes them all. */
export const UNASSIGNED_SHOWN = 50;

export interface ShareOutResult {
    assigned: { organizationId: string; platformAdminId: string }[];
    /** Businesses nobody could take (everyone full, or they own it). */
    left: number;
}

/** The subscription of a business that pays Saroh (as sign-in help reads it). */
const PAYS_SAROH_STATES = ["ACTIVE", "TRIALING", "PAST_DUE"];

/** Long enough for a share-out of {@link SHARE_OUT_MAX} businesses. */
const SHARE_OUT_TX = { timeout: 60_000, maxWait: 10_000 };

/** One writer at a time per business: assign, reassign, end, share-out. */
async function lockBusiness(tx: Tx, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-manager:${organizationId}`}))`;
}

/**
 * The business's open link and its manager's name, or null with none.
 * Cross-tenant, for the console: no organization context.
 */
export async function managerOf(
    db: Pick<Tx, "accountManagerLink" | "platformAdmin">,
    organizationId: string,
): Promise<ManagerView | null> {
    const link = await db.accountManagerLink.findFirst({
        where: { organizationId, endedAt: null },
        select: {
            platformAdminId: true,
            kind: true,
            source: true,
            startedAt: true,
        },
    });
    if (!link) return null;
    const admin = await db.platformAdmin.findUnique({
        where: { id: link.platformAdminId },
        select: { user: { select: { name: true } } },
    });
    return {
        platformAdminId: link.platformAdminId,
        name: teammateName(admin?.user.name ?? null),
        kind: link.kind as LinkKind,
        source: link.source as LinkSource,
        since: link.startedAt,
    };
}

/**
 * Who looks after which business, by staff (DEC-169, admin console U25):
 * give a business a manager, move it to another, end the link, and Share
 * out evenly. `accounts:assign` (Support and Platform owner); an Account
 * manager never assigns, not even to themselves.
 *
 * A link is append-only history (U19): moving a business ends the old
 * link and starts a new one as ASSIGNED, in one transaction, so who looked
 * after it and when is never lost, and a business brought in becomes
 * assigned once moved. Every write is on the admin ledger against the
 * business, so its History shows it. Each write on one business holds that
 * business's advisory lock (`account-manager:<id>`), and the one-open-link
 * index is the last word.
 *
 * CROSS-TENANT WRITE, behind the admin guards: no organization context.
 */
@Injectable()
export class AdminAccountManagersService {
    private readonly logger = new Logger(AdminAccountManagersService.name);

    constructor(private readonly audit: AdminAuditService) {}

    /**
     * Businesses without a manager (R30, U17): the ones Share out evenly
     * would take, paying ones first, then the oldest, the first
     * {@link UNASSIGNED_SHOWN} of them and how many there are in all.
     * `accounts:read` for every business: an Account manager, who sees only
     * their own, is refused.
     */
    async unassigned(
        staff: PlatformAdminInfo,
    ): Promise<{ businesses: UnassignedBusiness[]; total: number }> {
        if (scopeForStaff(staff, AdminPermission.AccountsRead).kind !== "all") {
            throw new ForbiddenException(
                "Businesses without a manager are for Support, Billing and Platform owner.",
            );
        }
        const all = await unassignedBusinesses(prisma, null, null);
        const shown = all.slice(0, UNASSIGNED_SHOWN);
        const rows = await prisma.organization.findMany({
            where: { id: { in: shown.map((b) => b.organizationId) } },
            select: { id: true, name: true, slug: true },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
            total: all.length,
            businesses: shown.flatMap((b) => {
                const row = byId.get(b.organizationId);
                return row
                    ? [
                          {
                              organizationId: row.id,
                              name: row.name,
                              slug: row.slug,
                              paying: b.paying,
                              createdAt: b.createdAt,
                          },
                      ]
                    : [];
            }),
        };
    }

    /** The people a business can be given to, fewest businesses first. */
    async candidates(
        staff: PlatformAdminInfo,
        organizationId: string,
    ): Promise<ManagerCandidate[]> {
        assertAssigner(staff);
        const now = new Date();
        const [org, current, admins] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { id: true },
            }),
            prisma.accountManagerLink.findFirst({
                where: { organizationId, endedAt: null },
                select: { platformAdminId: true },
            }),
            prisma.platformAdmin.findMany({
                where: activeManagerWhere(now),
                select: {
                    id: true,
                    user: { select: { name: true } },
                    staffProfile: { select: { capacity: true } },
                },
            }),
        ]);
        if (!org) throw new NotFoundException("Business not found");
        const loads = await openLoads(admins.map((a) => a.id));
        return admins
            .map((admin) => ({
                platformAdminId: admin.id,
                name: teammateName(admin.user.name),
                businesses: loads.get(admin.id) ?? 0,
                capacity: admin.staffProfile?.capacity ?? null,
                current: admin.id === current?.platformAdminId,
            }))
            .sort(
                (a, b) =>
                    a.businesses - b.businesses || a.name.localeCompare(b.name),
            );
    }

    /**
     * Give the business to `platformAdminId`, ending the link it has now if
     * it has one (a reassign). The new link is ASSIGNED, whoever had it.
     */
    async assign(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: { platformAdminId: string; reason: string },
    ): Promise<{ manager: ManagerView; previous: ManagerView | null }> {
        assertAssigner(staff);
        const reason = requireReason(input.reason);
        return this.writing(async (tx) => {
            await lockBusiness(tx, organizationId);
            const now = new Date();
            await openBusiness(tx, organizationId);
            await assertMayLookAfter(
                tx,
                input.platformAdminId,
                organizationId,
                now,
            );
            const previous = await managerOf(tx, organizationId);
            if (previous?.platformAdminId === input.platformAdminId) {
                throw new ConflictException(
                    `${previous.name} already looks after this business.`,
                );
            }
            let previousLinkId: string | null = null;
            if (previous) {
                previousLinkId = await endOpenLink(tx, organizationId, {
                    endedAt: now,
                    endedByUserId: staff.userId,
                    reason,
                });
            }
            const link = await tx.accountManagerLink.create({
                data: {
                    organizationId,
                    platformAdminId: input.platformAdminId,
                    source: "ASSIGNED",
                    kind: "ASSIGNED",
                    evidence: { source: "ASSIGNED" },
                    startedAt: now,
                    startedByUserId: staff.userId,
                },
                select: { id: true },
            });
            // The month counts: this month's payments made with no
            // manager are theirs now.
            await settleMonthBeforeLinkInTx(
                tx,
                this.logger,
                organizationId,
                now,
                now,
            );
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.AccountsAssign,
                action: previous
                    ? "account-manager.reassigned"
                    : "account-manager.assigned",
                targetType: "organization",
                targetId: organizationId,
                organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    linkId: link.id,
                    platformAdminId: input.platformAdminId,
                    previousLinkId,
                    previousPlatformAdminId: previous?.platformAdminId ?? null,
                    previousKind: previous?.kind ?? null,
                },
            });
            const manager = await managerOf(tx, organizationId);
            if (!manager) throw new Error("The new link did not read back");
            return { manager, previous };
        });
    }

    /** End the business's link, with a reason; it then has no manager. */
    async end(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: { reason: string },
    ): Promise<{ ended: ManagerView }> {
        assertAssigner(staff);
        const reason = requireReason(input.reason);
        return this.writing(async (tx) => {
            await lockBusiness(tx, organizationId);
            const exists = await tx.organization.findUnique({
                where: { id: organizationId },
                select: { id: true },
            });
            if (!exists) throw new NotFoundException("Business not found");
            const current = await managerOf(tx, organizationId);
            if (!current) {
                throw new ConflictException(
                    "This business has no account manager to end.",
                );
            }
            const linkId = await endOpenLink(tx, organizationId, {
                endedAt: new Date(),
                endedByUserId: staff.userId,
                reason,
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.AccountsAssign,
                action: MANAGER_ENDED_ACTION,
                targetType: "organization",
                targetId: organizationId,
                organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    linkId,
                    platformAdminId: current.platformAdminId,
                    kind: current.kind,
                    cause: "STAFF",
                },
            });
            return { ended: current };
        });
    }

    /**
     * Share out evenly (R30): every business without a manager (or those
     * named) goes, paying ones first, to whoever holds the Account manager
     * role, is on commission and looks after the fewest (`share-out.ts`).
     * One ledger row per business, and one for the whole share-out.
     */
    async shareOut(
        staff: PlatformAdminInfo,
        input: { reason: string; organizationIds?: string[] },
    ): Promise<ShareOutResult> {
        assertAssigner(staff);
        const reason = requireReason(input.reason);
        const named = input.organizationIds
            ? [...new Set(input.organizationIds)]
            : null;
        return this.writing(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"account-managers:share-out"}))`;
            const now = new Date();
            const managers = await shareOutManagers(tx, now);
            if (managers.length === 0) {
                throw new ConflictException(
                    "Nobody is both an Account manager and on commission, so there is nobody to share out to.",
                );
            }
            const businesses = await unassignedBusinesses(tx, named);
            const plan = planShareOut(businesses, managers);

            const assigned: ShareOutResult["assigned"] = [];
            for (const pick of plan.assignments) {
                await lockBusiness(tx, pick.organizationId);
                // Given a manager by hand since it was read: leave it.
                const taken = await tx.accountManagerLink.findFirst({
                    where: {
                        organizationId: pick.organizationId,
                        endedAt: null,
                    },
                    select: { id: true },
                });
                if (taken) continue;
                const link = await tx.accountManagerLink.create({
                    data: {
                        organizationId: pick.organizationId,
                        platformAdminId: pick.platformAdminId,
                        source: "ASSIGNED",
                        kind: "ASSIGNED",
                        evidence: { source: "ASSIGNED", via: "share-out" },
                        startedAt: now,
                        startedByUserId: staff.userId,
                    },
                    select: { id: true },
                });
                await settleMonthBeforeLinkInTx(
                    tx,
                    this.logger,
                    pick.organizationId,
                    now,
                    now,
                );
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.AccountsAssign,
                    action: "account-manager.assigned",
                    targetType: "organization",
                    targetId: pick.organizationId,
                    organizationId: pick.organizationId,
                    reason,
                    outcome: AdminAuditOutcome.Success,
                    metadata: {
                        linkId: link.id,
                        platformAdminId: pick.platformAdminId,
                        via: "share-out",
                    },
                });
                assigned.push(pick);
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.AccountsAssign,
                action: "account-manager.shared-out",
                targetType: "team",
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    assigned: assigned.length,
                    left: plan.left.length,
                    managers: managers.length,
                    named: named?.length ?? null,
                },
            });
            return { assigned, left: plan.left.length };
        }, SHARE_OUT_TX);
    }

    private async writing<T>(
        change: (tx: Tx) => Promise<T>,
        options?: { timeout: number; maxWait: number },
    ): Promise<T> {
        try {
            return await prisma.$transaction(change, options);
        } catch (error) {
            // The one-open-link index: a link started under us all the same.
            if (prismaErrorCode(error) === "P2002") {
                throw new ConflictException(
                    "Someone gave this business a manager a moment ago. Reload to see who.",
                );
            }
            throw error;
        }
    }
}

/**
 * Only staff who hold `accounts:assign` for every business. An Account
 * manager holds no part of it (`admin-permissions.spec.ts`), so is refused
 * here even if the route guard were missing.
 */
function assertAssigner(staff: PlatformAdminInfo): void {
    if (!staff.permissions.includes(AdminPermission.AccountsAssign)) {
        throw new ForbiddenException(
            "Only Support or a Platform owner gives a business a manager.",
        );
    }
    if (scopeForStaff(staff, AdminPermission.AccountsAssign).kind !== "all") {
        throw new ForbiddenException(
            "Only Support or a Platform owner gives a business a manager.",
        );
    }
}

/** The business, which must exist and not be deleted. */
async function openBusiness(tx: Tx, organizationId: string): Promise<void> {
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    if (!org) throw new NotFoundException("Business not found");
    if (!membersMayOpen(org.lifecycleStatus)) {
        throw new ConflictException(
            "This business has been deleted, so it takes no account manager.",
        );
    }
}

/**
 * The person must hold the Account manager role now, and not own the
 * business (nobody looks after, or earns on, their own).
 */
async function assertMayLookAfter(
    tx: Tx,
    platformAdminId: string,
    organizationId: string,
    now: Date,
): Promise<void> {
    const admin = await tx.platformAdmin.findFirst({
        where: { id: platformAdminId, ...activeManagerWhere(now) },
        select: { userId: true },
    });
    if (!admin) {
        throw new BadRequestException(
            "Businesses go to someone who is an Account manager now.",
        );
    }
    const owns = await tx.membership.findFirst({
        where: { organizationId, userId: admin.userId, role: "OWNER" },
        select: { id: true },
    });
    if (owns) {
        throw new BadRequestException(
            "They own this business, so they can't be its account manager.",
        );
    }
}

/** End the business's open link; its id. Someone else ending it first is a 409. */
async function endOpenLink(
    tx: Tx,
    organizationId: string,
    end: { endedAt: Date; endedByUserId: string; reason: string },
): Promise<string> {
    const open = await tx.accountManagerLink.findFirst({
        where: { organizationId, endedAt: null },
        select: { id: true, startedAt: true },
    });
    const { count } = open
        ? await tx.accountManagerLink.updateMany({
              where: { id: open.id, endedAt: null },
              data: {
                  endedAt:
                      open.startedAt > end.endedAt
                          ? open.startedAt
                          : end.endedAt,
                  endedByUserId: end.endedByUserId,
                  endedReason: end.reason,
              },
          })
        : { count: 0 };
    if (!open || count === 0) {
        throw new ConflictException(
            "Someone changed this business's manager a moment ago. Reload to see who.",
        );
    }
    return open.id;
}

/** How many businesses each of these people looks after now. */
async function openLoads(
    platformAdminIds: string[],
    db: Pick<Tx, "accountManagerLink"> = prisma,
): Promise<Map<string, number>> {
    if (platformAdminIds.length === 0) return new Map();
    const rows = await db.accountManagerLink.groupBy({
        by: ["platformAdminId"],
        where: { endedAt: null, platformAdminId: { in: platformAdminIds } },
        _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.platformAdminId, r._count._all]));
}

/** Account managers now who are on commission, with their loads. */
async function shareOutManagers(tx: Tx, now: Date): Promise<ShareOutManager[]> {
    const admins = await tx.platformAdmin.findMany({
        where: {
            ...activeManagerWhere(now),
            staffProfile: { onCommission: true },
        },
        select: {
            id: true,
            userId: true,
            user: { select: { name: true } },
            staffProfile: { select: { capacity: true } },
        },
    });
    const loads = await openLoads(
        admins.map((a) => a.id),
        tx,
    );
    return admins.map((admin) => ({
        platformAdminId: admin.id,
        name: teammateName(admin.user.name),
        userId: admin.userId,
        load: loads.get(admin.id) ?? 0,
        capacity: admin.staffProfile?.capacity ?? null,
    }));
}

/**
 * Businesses with no open link that Saroh still bills (active or
 * suspended; not leaving or deleted), or only those `named`: paying ones
 * first, then the oldest, at most {@link SHARE_OUT_MAX}.
 */
async function unassignedBusinesses(
    tx: Pick<Tx, "organization">,
    named: string[] | null,
    max: number | null = SHARE_OUT_MAX,
): Promise<ShareOutBusiness[]> {
    const rows = await tx.organization.findMany({
        where: {
            lifecycleStatus: { in: BILLING_STATES },
            accountManagerLinks: { none: { endedAt: null } },
            ...(named ? { id: { in: named } } : {}),
        },
        select: {
            id: true,
            createdAt: true,
            subscription: {
                select: {
                    status: true,
                    provider: true,
                    plan: { select: { priceCents: true } },
                },
            },
            memberships: { where: { role: "OWNER" }, select: { userId: true } },
        },
    });
    const all = rows.map((row): ShareOutBusiness => {
        const sub = row.subscription;
        return {
            organizationId: row.id,
            createdAt: row.createdAt,
            paying: Boolean(
                sub &&
                PAYS_SAROH_STATES.includes(sub.status) &&
                (sub.provider !== null || sub.plan.priceCents > 0),
            ),
            ownerUserIds: row.memberships.map((m) => m.userId),
        };
    });
    // Paying first across all of them, then at most one share-out's worth.
    const ordered = shareOutOrder(all);
    return max === null ? ordered : ordered.slice(0, max);
}
