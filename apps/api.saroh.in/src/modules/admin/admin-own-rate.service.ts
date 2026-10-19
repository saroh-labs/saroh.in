import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { MAX_BASIS_POINTS } from "../commission/commission-rules";
import {
    businessRateLockKey,
    lockKeyInTx,
} from "../commission/commission-settle";
import {
    applyBackPayInTx,
    firstPaidAtInTx,
    planBackPayInTx,
} from "../commission/own-rate";
import {
    dayOf,
    dayStart,
    isEmptyWindow,
    nextDay,
    ownRateEndAt,
    ownRateOverlap,
    ownRateWindowProblem,
} from "../commission/own-rate-rules";
import { teammateName } from "../saroh-leads/lead-views";
import { managerOf } from "./admin-account-managers.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import { requireReason } from "./admin-staff.service";

type Tx = Prisma.TransactionClient;

/** A business's own rate as the console shows it. */
export interface OwnRateView {
    id: string;
    platformAdminId: string;
    managerName: string;
    basisPoints: number;
    /** The start of its first day in India, and that day. */
    earnsFrom: Date;
    earnsFromDay: string;
    /** Exclusive end, and its last day; null while open. */
    until: Date | null;
    lastDay: string | null;
    setByName: string;
    reason: string;
    createdAt: Date;
    endedAt: Date | null;
    endedReason: string | null;
}

/** What the Team card and the dialog read about one business (#1035). */
export interface OwnRateSummary {
    organizationId: string;
    businessName: string;
    /** For the Earns from chips: days in India, null where there is none. */
    dates: {
        joined: string;
        firstPaidPlan: string | null;
        managerSince: string | null;
    };
    manager: { platformAdminId: string; name: string } | null;
    /** Earning now. */
    current: OwnRateView | null;
    /** Set to start later. */
    upcoming: OwnRateView | null;
    /** Every own rate set for it, newest first. */
    history: OwnRateView[];
}

/** What saving would do, written nowhere (the dry run). */
export interface OwnRatePreview {
    earnsFromDay: string;
    lastDay: string | null;
    managerName: string;
    /** NO_RATE payments it prices now, and what they earn together. */
    payments: number;
    amountPaise: number;
    /** Payments in its window a general rate priced: they stay as they are. */
    alreadyPriced: number;
    /** The own rate it replaces, if one runs past its start. */
    replaces: OwnRateView | null;
}

export interface OwnRateInput {
    basisPoints: number;
    /** "2026-09-10": the first day it earns, in India. */
    earnsFrom: string;
    /** "2026-09-30": its last day, if it has one. */
    lastDay?: string;
}

/**
 * A business's own commission rate for its account manager (DEC-169,
 * #1035): read (`team:pay` or `commission:rates`), the dry run, set and
 * end (`commission:rates`, a Platform owner). Set for the manager who
 * looks after it now; its "Earns from" is never before the business's
 * first paid plan, nor before that manager took it on, and saving it back-pays that manager's NO_RATE lines in
 * its window, once: the only back-pay there is. Each write holds the
 * business's manager lock and its commission lock, and is on the admin
 * ledger with its reason, in the same transaction. CROSS-TENANT, behind
 * the admin guards: no organization context.
 */
@Injectable()
export class AdminOwnRateService {
    constructor(private readonly audit: AdminAuditService) {}

    async read(
        staff: PlatformAdminInfo,
        organizationId: string,
        now: Date = new Date(),
    ): Promise<OwnRateSummary> {
        if (
            !staff.permissions.includes(AdminPermission.TeamPay) &&
            !staff.permissions.includes(AdminPermission.CommissionRates)
        ) {
            throw new ForbiddenException(
                "Only a Platform owner or Billing sees a business's own commission rate.",
            );
        }
        const summary = await summaryOf(prisma, organizationId, now);
        await this.audit.recordRead({
            actorUserId: staff.userId,
            permission: staff.permissions.includes(
                AdminPermission.CommissionRates,
            )
                ? AdminPermission.CommissionRates
                : AdminPermission.TeamPay,
            action: "commission.own-rate.read",
            targetType: "organization",
            targetId: organizationId,
            outcome: AdminAuditOutcome.Success,
            metadata: {},
        });
        return summary;
    }

    async preview(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: OwnRateInput,
        now: Date = new Date(),
    ): Promise<OwnRatePreview> {
        assertRates(staff);
        return prisma.$transaction(async (tx) => {
            const w = await windowInTx(tx, organizationId, input);
            const plan = await planBackPayInTx(
                tx,
                {
                    organizationId,
                    platformAdminId: w.manager.platformAdminId,
                    basisPoints: input.basisPoints,
                    from: w.from,
                    until: w.until,
                },
                now,
            );
            const existing = await ownRatesInTx(tx, organizationId);
            const ends = new Set(
                ownRateOverlap(existing, w.from).map((e) => e.id),
            );
            const replaced = existing.find((r) => ends.has(r.id)) ?? null;
            return {
                earnsFromDay: input.earnsFrom,
                lastDay: input.lastDay ?? null,
                managerName: w.manager.name,
                payments: plan.payments.length,
                amountPaise: plan.amountPaise,
                alreadyPriced: plan.alreadyPriced,
                replaces: replaced
                    ? ((await viewsOf(tx, [replaced]))[0] ?? null)
                    : null,
            };
        });
    }

    async set(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: OwnRateInput & { reason: string },
        now: Date = new Date(),
    ): Promise<
        OwnRateSummary & {
            backPaid: { payments: number; amountPaise: number };
        }
    > {
        assertRates(staff);
        const reason = requireReason(input.reason);
        return prisma.$transaction(async (tx) => {
            await lockKeyInTx(tx, `account-manager:${organizationId}`);
            await lockKeyInTx(tx, businessRateLockKey(organizationId));
            const w = await windowInTx(tx, organizationId, input);

            const ended = ownRateOverlap(
                await ownRatesInTx(tx, organizationId),
                w.from,
            );
            for (const end of ended) {
                await tx.businessCommissionRate.update({
                    where: { id: end.id },
                    data: {
                        until: end.until,
                        endedAt: now,
                        endedByUserId: staff.userId,
                        endedReason: `Replaced by the own rate from ${input.earnsFrom}: ${reason}`,
                    },
                });
            }
            const rate = await tx.businessCommissionRate.create({
                data: {
                    organizationId,
                    platformAdminId: w.manager.platformAdminId,
                    basisPoints: input.basisPoints,
                    earnsFrom: w.from,
                    until: w.until,
                    setByUserId: staff.userId,
                    reason,
                },
            });
            const backPaid = await applyBackPayInTx(tx, rate, now);
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.CommissionRates,
                action: "commission.own-rate.set",
                targetType: "organization",
                targetId: organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    rateId: rate.id,
                    platformAdminId: rate.platformAdminId,
                    earnsFrom: input.earnsFrom,
                    lastDay: input.lastDay ?? null,
                    replaced: ended.map((e) => e.id),
                    backPaidPayments: backPaid.payments,
                    backPaidLines: backPaid.lines,
                },
            });
            return {
                ...(await summaryOf(tx, organizationId, now)),
                backPaid: {
                    payments: backPaid.payments,
                    amountPaise: backPaid.amountPaise,
                },
            };
        });
    }

    /**
     * End the business's own rate: now, or one not started yet before it
     * starts. Lines it priced keep their price; payments after earn at the
     * general rate for the link's kind.
     */
    async end(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: { reason: string },
        now: Date = new Date(),
    ): Promise<OwnRateSummary> {
        assertRates(staff);
        const reason = requireReason(input.reason);
        return prisma.$transaction(async (tx) => {
            await lockKeyInTx(tx, businessRateLockKey(organizationId));
            const running = (await ownRatesInTx(tx, organizationId)).flatMap(
                (rate) => {
                    const at = ownRateEndAt(rate, now);
                    return at && !isEmptyWindow(rate) ? [{ rate, at }] : [];
                },
            );
            if (running.length === 0) {
                throw new ConflictException(
                    "This business has no own rate running or to come.",
                );
            }
            for (const { rate, at } of running) {
                await tx.businessCommissionRate.update({
                    where: { id: rate.id },
                    data: {
                        until: at,
                        endedAt: now,
                        endedByUserId: staff.userId,
                        endedReason: reason,
                    },
                });
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.CommissionRates,
                action: "commission.own-rate.end",
                targetType: "organization",
                targetId: organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { rateIds: running.map((r) => r.rate.id) },
            });
            return summaryOf(tx, organizationId, now);
        });
    }
}

function assertRates(staff: PlatformAdminInfo): void {
    if (!staff.permissions.includes(AdminPermission.CommissionRates)) {
        throw new ForbiddenException(
            "Only a Platform owner sets a business's own commission rate.",
        );
    }
}

/**
 * The window the input asks for, checked: a rate 0–100%, a manager now,
 * and days from the business's first paid plan and that manager's start,
 * whichever is later.
 */
async function windowInTx(
    tx: Tx,
    organizationId: string,
    input: OwnRateInput,
): Promise<{
    manager: { platformAdminId: string; name: string };
    from: Date;
    until: Date | null;
}> {
    if (
        !Number.isInteger(input.basisPoints) ||
        input.basisPoints < 0 ||
        input.basisPoints > MAX_BASIS_POINTS
    ) {
        throw new BadRequestException("A rate is between 0% and 100%.");
    }
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
    });
    if (!org) throw new NotFoundException("Business not found");
    const manager = await managerOf(tx, organizationId);
    if (!manager) {
        throw new BadRequestException(
            "This business has no account manager. Give it one first.",
        );
    }
    const lastDay = input.lastDay ?? null;
    const problem = ownRateWindowProblem({
        earnsFrom: input.earnsFrom,
        lastDay,
        firstPaidAt: await firstPaidAtInTx(tx, organizationId),
        manager: { name: manager.name, since: manager.since },
    });
    if (problem) throw new BadRequestException(problem);
    return {
        manager: {
            platformAdminId: manager.platformAdminId,
            name: manager.name,
        },
        from: dayStart(input.earnsFrom),
        until: lastDay ? dayStart(nextDay(lastDay)) : null,
    };
}

function ownRatesInTx(
    tx: Pick<Tx, "businessCommissionRate">,
    organizationId: string,
) {
    return tx.businessCommissionRate.findMany({
        where: { organizationId },
        orderBy: [{ earnsFrom: "desc" }, { createdAt: "desc" }],
    });
}

type OwnRateRow = Awaited<ReturnType<typeof ownRatesInTx>>[number];

async function viewsOf(
    tx: Pick<Tx, "user" | "platformAdmin">,
    rows: OwnRateRow[],
): Promise<OwnRateView[]> {
    const [users, admins] = await Promise.all([
        tx.user.findMany({
            where: { id: { in: [...new Set(rows.map((r) => r.setByUserId))] } },
            select: { id: true, name: true },
        }),
        tx.platformAdmin.findMany({
            where: {
                id: { in: [...new Set(rows.map((r) => r.platformAdminId))] },
            },
            select: { id: true, user: { select: { name: true } } },
        }),
    ]);
    const setBy = new Map(users.map((u) => [u.id, u.name]));
    const managers = new Map(admins.map((a) => [a.id, a.user.name]));
    return rows.map((r) => ({
        id: r.id,
        platformAdminId: r.platformAdminId,
        managerName: managers.has(r.platformAdminId)
            ? teammateName(managers.get(r.platformAdminId) ?? null)
            : "A former teammate",
        basisPoints: r.basisPoints,
        earnsFrom: r.earnsFrom,
        earnsFromDay: dayOf(r.earnsFrom),
        until: r.until,
        lastDay: r.until ? dayOf(new Date(r.until.getTime() - 1)) : null,
        setByName: teammateName(
            setBy.get(r.setByUserId) ?? null,
            "Saroh's team",
        ),
        reason: r.reason,
        createdAt: r.createdAt,
        endedAt: r.endedAt,
        endedReason: r.endedReason,
    }));
}

async function summaryOf(
    tx: Pick<
        Tx,
        | "organization"
        | "accountManagerLink"
        | "platformAdmin"
        | "sarohInvoice"
        | "businessCommissionRate"
        | "user"
    >,
    organizationId: string,
    now: Date,
): Promise<OwnRateSummary> {
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, createdAt: true },
    });
    if (!org) throw new NotFoundException("Business not found");
    const [manager, firstPaidAt, rows] = await Promise.all([
        managerOf(tx, organizationId),
        firstPaidAtInTx(tx, organizationId),
        ownRatesInTx(tx, organizationId),
    ]);
    const history = await viewsOf(tx, rows);
    const live = history.filter(
        (r) =>
            !isEmptyWindow(r) &&
            (r.until === null || r.until.getTime() > now.getTime()),
    );
    return {
        organizationId,
        businessName: org.name,
        dates: {
            joined: dayOf(org.createdAt),
            firstPaidPlan: firstPaidAt ? dayOf(firstPaidAt) : null,
            managerSince: manager ? dayOf(manager.since) : null,
        },
        manager: manager
            ? { platformAdminId: manager.platformAdminId, name: manager.name }
            : null,
        current:
            live.find((r) => r.earnsFrom.getTime() <= now.getTime()) ?? null,
        upcoming:
            [...live]
                .reverse()
                .find((r) => r.earnsFrom.getTime() > now.getTime()) ?? null,
        history,
    };
}
