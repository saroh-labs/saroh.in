import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { RateKind } from "../commission/commission-rules";
import {
    isMonth,
    MAX_BASIS_POINTS,
    monthOf,
} from "../commission/commission-rules";
import { lockKeyInTx, payoutLockKey } from "../commission/commission-settle";
import type {
    EarningsSummary,
    PayoutStatement,
    PayoutView,
    RatesView,
} from "../commission/commission-statements";
import {
    readEarnings,
    readRates,
    readStatement,
    statementCsv,
} from "../commission/commission-statements";
import { teammateName } from "../saroh-leads/lead-views";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import { requireReason } from "./admin-staff.service";

/** A rate may start this long ago at most: the time the form was open. */
const RATE_START_GRACE_MS = 10 * 60 * 1000;

/** Unrated lines worked out at once when a rate is set; the sweep does the rest. */

/**
 * Commission in the console (DEC-169, admin console U21): the month's
 * statement for the team, a teammate's earnings, the export, Mark paid,
 * and the rates. `team:pay` (Platform owner and Billing) for the money,
 * `commission:rates` (Platform owner) for the rates, checked on the route
 * and again here. Every read is on the admin ledger, every write in the
 * same transaction as its ledger row. CROSS-TENANT, behind the admin
 * guards: no organization context.
 *
 * Mark paid locks the month for that teammate: a line that becomes
 * payable later goes to the next statement (`statementMonthFor`), both
 * under `commission-payout:<platformAdminId>`. Nobody marks their own
 * commission paid.
 */
@Injectable()
export class AdminCommissionService {
    constructor(private readonly audit: AdminAuditService) {}

    async statement(
        staff: PlatformAdminInfo,
        month: string | undefined,
        now: Date = new Date(),
    ): Promise<PayoutStatement> {
        assertMay(staff, AdminPermission.TeamPay);
        const m = monthOrNow(month, now);
        const statement = await readStatement(m, now);
        await this.read(staff, "commission.statement.read", "team", {
            month: m,
        });
        return statement;
    }

    async exportCsv(
        staff: PlatformAdminInfo,
        month: string | undefined,
        now: Date = new Date(),
    ): Promise<{ filename: string; csv: string }> {
        assertMay(staff, AdminPermission.TeamPay);
        const m = monthOrNow(month, now);
        const csv = statementCsv(await readStatement(m, now));
        await this.read(staff, "commission.statement.export", "team", {
            month: m,
        });
        return { filename: `saroh-commission-${m}.csv`, csv };
    }

    async earnings(
        staff: PlatformAdminInfo,
        platformAdminId: string,
    ): Promise<EarningsSummary> {
        assertMay(staff, AdminPermission.TeamPay);
        const earnings = await readEarnings(platformAdminId);
        if (!earnings) throw new NotFoundException("Teammate not found");
        await this.read(
            staff,
            "commission.earnings.read",
            "staff",
            {},
            platformAdminId,
        );
        return earnings;
    }

    /**
     * Mark a teammate's month paid with the bank's reference: every line
     * PAYABLE in it becomes PAID with the payout, and the month is locked.
     */
    async markPaid(
        staff: PlatformAdminInfo,
        input: {
            platformAdminId: string;
            month: string;
            reference: string;
            reason: string;
        },
        now: Date = new Date(),
    ): Promise<{ payout: PayoutView }> {
        assertMay(staff, AdminPermission.TeamPay);
        const reason = requireReason(input.reason);
        const reference = input.reference.trim();
        if (!reference) {
            throw new BadRequestException("Give the payment's reference.");
        }
        if (
            staff.platformAdminId &&
            staff.platformAdminId === input.platformAdminId
        ) {
            throw new ForbiddenException(
                "Someone else on the team marks your own commission paid.",
            );
        }
        if (!isMonth(input.month) || input.month > monthOf(now)) {
            throw new BadRequestException(
                "A month is marked paid once it has begun.",
            );
        }
        return prisma.$transaction(async (tx) => {
            await lockKeyInTx(tx, payoutLockKey(input.platformAdminId));
            const had = await tx.commissionPayout.findUnique({
                where: {
                    platformAdminId_month: {
                        platformAdminId: input.platformAdminId,
                        month: input.month,
                    },
                },
                select: { id: true },
            });
            if (had) {
                throw new ConflictException(
                    "This month is already marked paid for them.",
                );
            }
            const due = await tx.commissionLine.findMany({
                where: {
                    platformAdminId: input.platformAdminId,
                    statementMonth: input.month,
                    status: "PAYABLE",
                },
                select: { id: true, amountPaise: true },
            });
            if (due.length === 0) {
                throw new ConflictException(
                    "Nothing is due to them for that month.",
                );
            }
            const amountPaise = due.reduce(
                (t, l) => t + (l.amountPaise ?? 0),
                0,
            );
            const payout = await tx.commissionPayout.create({
                data: {
                    platformAdminId: input.platformAdminId,
                    month: input.month,
                    amountPaise,
                    lineCount: due.length,
                    reference,
                    reason,
                    paidAt: now,
                    paidByUserId: staff.userId,
                },
            });
            const { count } = await tx.commissionLine.updateMany({
                where: { id: { in: due.map((l) => l.id) }, status: "PAYABLE" },
                data: { status: "PAID", payoutId: payout.id },
            });
            if (count !== due.length) {
                throw new ConflictException(
                    "Their statement changed a moment ago. Reload and try again.",
                );
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.TeamPay,
                action: "commission.payout.paid",
                targetType: "staff",
                targetId: input.platformAdminId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    payoutId: payout.id,
                    month: input.month,
                    lineCount: due.length,
                },
            });
            const payer = await tx.user.findUnique({
                where: { id: staff.userId },
                select: { name: true },
            });
            return {
                payout: {
                    id: payout.id,
                    amountPaise: payout.amountPaise,
                    lineCount: payout.lineCount,
                    reference: payout.reference,
                    paidAt: payout.paidAt,
                    paidByName: teammateName(
                        payer?.name ?? null,
                        "Saroh's team",
                    ),
                },
            };
        });
    }

    async rates(
        staff: PlatformAdminInfo,
        now: Date = new Date(),
    ): Promise<RatesView> {
        assertMay(staff, AdminPermission.CommissionRates);
        const rates = await readRates(now);
        await this.read(
            staff,
            "commission.rates.read",
            "team",
            {},
            undefined,
            AdminPermission.CommissionRates,
        );
        return rates;
    }

    /**
     * Set the rate for one kind of link from now (or a later date). A line
     * already written keeps the rate it copied, and a payment made while
     * there was none earns nothing: no back-pay (owner, 19 Oct).
     */
    async setRate(
        staff: PlatformAdminInfo,
        input: {
            kind: RateKind;
            basisPoints: number;
            effectiveFrom?: string;
            reason: string;
        },
        now: Date = new Date(),
    ): Promise<RatesView> {
        assertMay(staff, AdminPermission.CommissionRates);
        const reason = requireReason(input.reason);
        if (
            !Number.isInteger(input.basisPoints) ||
            input.basisPoints < 0 ||
            input.basisPoints > MAX_BASIS_POINTS
        ) {
            throw new BadRequestException("A rate is between 0% and 100%.");
        }
        const from = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
        if (
            Number.isNaN(from.getTime()) ||
            from.getTime() < now.getTime() - RATE_START_GRACE_MS
        ) {
            throw new BadRequestException(
                "A rate starts now or later. Payments already made keep the rate they earned.",
            );
        }
        await prisma.$transaction(async (tx) => {
            const rate = await tx.commissionRate.create({
                data: {
                    kind: input.kind,
                    basisPoints: input.basisPoints,
                    effectiveFrom: from,
                    setByUserId: staff.userId,
                    reason,
                },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.CommissionRates,
                action: "commission.rate.set",
                targetType: "commission-rate",
                targetId: rate.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    kind: input.kind,
                    effectiveFrom: from.toISOString(),
                },
            });
        });
        return readRates(now);
    }

    private read(
        staff: PlatformAdminInfo,
        action: string,
        targetType: string,
        metadata: Record<string, unknown>,
        targetId?: string,
        permission: AdminPermission = AdminPermission.TeamPay,
    ): Promise<void> {
        return this.audit.recordRead({
            actorUserId: staff.userId,
            permission,
            action,
            targetType,
            ...(targetId ? { targetId } : {}),
            outcome: AdminAuditOutcome.Success,
            metadata,
        });
    }
}

/** Refused here as well as on the route. */
function assertMay(
    staff: PlatformAdminInfo,
    permission: AdminPermission,
): void {
    if (!staff.permissions.includes(permission)) {
        throw new ForbiddenException(
            permission === AdminPermission.CommissionRates
                ? "Only a Platform owner sets commission rates."
                : "Only a Platform owner or Billing sees what the team is owed.",
        );
    }
}

function monthOrNow(month: string | undefined, now: Date): string {
    if (month === undefined || month === "") return monthOf(now);
    if (!isMonth(month))
        throw new BadRequestException("A month is written 2026-12");
    return month;
}
