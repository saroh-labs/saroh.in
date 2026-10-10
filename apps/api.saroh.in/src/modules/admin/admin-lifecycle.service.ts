import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { stopRenewalsInTx } from "../billing/business-closing";
import { EntitlementService } from "../billing/entitlement.service";
import { backfillOneOrganization } from "../capabilities/module-backfill";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { isModuleKey } from "../capabilities/module-registry";
import { LEGAL_HOLD_CODE } from "../organizations/legal-hold";
import {
    legalHoldAllowsMoveTo,
    legalHoldMayBePlaced,
} from "../organizations/organization-lifecycle.policy";
import {
    assertOrganizationLifecycleTransition,
    OrganizationLifecycleStatus,
} from "./admin-access.service";
import type { AdminAuditInput } from "./admin-audit.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import { enqueueDeletionCleanup } from "./organization-deletion-cleanup.handler";

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lifecycle actions an operator writes into a business's own history. They
 * are the business's story but not its activity, so "last active" skips them.
 */
export const OPERATOR_LIFECYCLE_ACTIONS = [
    "organization.suspended",
    "organization.reinstated",
    "organization.deletion.scheduled",
    // Written by the deletion sweep when the window ends (#907).
    "organization.deleted",
    // A legal hold placed or lifted (DEC-119).
    "organization.legal_hold.placed",
    "organization.legal_hold.lifted",
    // Written by the retention eraser, 180 days after deletion (DEC-119).
    "organization.retention.erased",
] as const;

/** The admin ledger's and the business's history's rows for a hold (DEC-119). */
export const LEGAL_HOLD_PLACED_ACTION = "organization.legal_hold.placed";
export const LEGAL_HOLD_LIFTED_ACTION = "organization.legal_hold.lifted";

/** What an operator is told when a held business is reinstated. */
export const LEGAL_HOLD_BLOCKS_REINSTATE =
    "This business is on legal hold, so it stays closed to new activity. A Platform Owner lifts the hold first.";

/** What an operator is told when a held business's deletion is asked for. */
export const LEGAL_HOLD_BLOCKS_DELETION =
    "This business is on legal hold, so its data can't be deleted. A Platform Owner lifts the hold first.";

/** Retention window bounds for a scheduled deletion, in days. */
export const DELETION_WINDOW = { min: 7, default: 30, max: 90 } as const;

export interface OperatorCommand {
    staff: PlatformAdminInfo;
    organizationId: string;
    reason: string;
}

/**
 * Operator actions on one business (admin console U5).
 *
 * Every command takes a reason, writes to the admin ledger in the same
 * transaction as the change (plan R5), and — for lifecycle — is guarded by
 * `lifecycleVersion`, so two operators acting at once cannot both win.
 * Lifecycle changes are also written to the business's own audit stream, so
 * the business's history shows the state change it lived through, attributed
 * to the operator rather than disguised as one of its members.
 *
 * Nothing here deletes a business. Scheduling deletion starts a retention
 * window that can be cancelled; the business is refused new activity during
 * it, as when suspended, and is charged no renewal: its Saroh provider
 * subscription is told to end with the period paid, on the same
 * transaction (#921). When the window ends the daily sweep
 * (`organization-deletion.handler.ts`, #907) takes it to `DELETED_RETAINED`.
 *
 * **Legal hold** (DEC-119, owner 10 Oct, `organizations/legal-hold.ts`): an
 * operator places one when suspending a business for activity the law
 * prohibits, or on a business that is already suspended or on its way out;
 * only a Platform Owner lifts it (`organization:legal-hold:lift`). Both take
 * a reason, write the admin ledger with it, and write the business's own
 * history without it. While it is held, scheduling its deletion is refused,
 * and so is reinstating it: a held business is never active, so its
 * workspace takes no write that could delete a record.
 */
@Injectable()
export class AdminLifecycleService {
    constructor(
        private readonly audit: AdminAuditService,
        private readonly modules: ModuleLifecycleService,
        private readonly entitlements: EntitlementService,
    ) {}

    /**
     * Suspend: the business keeps its data and can read it; nothing new
     * happens. With `legalHold` ("Suspended for activity the law prohibits —
     * keep its data", DEC-119) the hold is placed on the same transaction,
     * with the same reason, and written to both ledgers as its own row.
     */
    async suspend(
        command: OperatorCommand & { confirmName: string; legalHold?: boolean },
    ) {
        const hold = command.legalHold === true;
        return this.transition(command, OrganizationLifecycleStatus.Suspended, {
            confirmName: command.confirmName,
            data: (now) => ({
                suspendedAt: now,
                suspendedByUserId: command.staff.userId,
                suspensionReason: command.reason,
                ...(hold
                    ? {
                          legalHoldAt: now,
                          legalHoldReason: command.reason,
                          legalHoldByUserId: command.staff.userId,
                      }
                    : {}),
            }),
            action: "organization.suspended",
            metadata: hold ? { legalHold: true } : undefined,
            inTx: hold
                ? async (tx, organizationId) => {
                      await this.recordHold(tx, command, organizationId, {
                          action: LEGAL_HOLD_PLACED_ACTION,
                          permission:
                              AdminPermission.OrganizationLifecycleWrite,
                          metadata: { with: "suspension" },
                      });
                      return {};
                  }
                : undefined,
        });
    }

    /**
     * Place a legal hold on a business that is already suspended, scheduled
     * for deletion or deleted (DEC-119). An active business is suspended
     * with the hold instead: the Terms suspend such an account at once.
     * Guarded on `lifecycleVersion`, which it bumps, so a deletion the sweep
     * is writing at the same moment and this hold can't both win.
     */
    async placeLegalHold(command: OperatorCommand) {
        const reason = requireReason(command.reason);
        const now = new Date();
        return prisma.$transaction(async (tx) => {
            const organization = await this.holdTarget(
                tx,
                command.organizationId,
            );
            if (organization.legalHoldAt) {
                return { ok: true, changed: false };
            }
            if (!legalHoldMayBePlaced(organization.lifecycleStatus)) {
                throw new ConflictException(
                    "Suspend this business with the legal hold ticked; a hold isn't placed on an active business.",
                );
            }
            const updated = await tx.organization.updateMany({
                where: {
                    id: organization.id,
                    lifecycleVersion: organization.lifecycleVersion,
                    legalHoldAt: null,
                },
                data: {
                    legalHoldAt: now,
                    legalHoldReason: reason,
                    legalHoldByUserId: command.staff.userId,
                    lifecycleVersion: { increment: 1 },
                },
            });
            if (updated.count === 0) throw changedMeanwhile();
            await this.recordHold(tx, { ...command, reason }, organization.id, {
                action: LEGAL_HOLD_PLACED_ACTION,
                permission: AdminPermission.OrganizationLifecycleWrite,
                metadata: { status: organization.lifecycleStatus },
            });
            return { ok: true, changed: true };
        });
    }

    /**
     * Lift a legal hold (DEC-119): a Platform Owner's, with a reason
     * (`organization:legal-hold:lift`, which no other role carries). The
     * business stays in the state it is in. A deleted one gets its clean-up
     * queued again, since the one that ran while it was held stood aside;
     * the retention eraser picks it up on its next daily run.
     */
    async liftLegalHold(command: OperatorCommand) {
        const reason = requireReason(command.reason);
        return prisma.$transaction(async (tx) => {
            const organization = await this.holdTarget(
                tx,
                command.organizationId,
            );
            if (!organization.legalHoldAt) {
                return { ok: true, changed: false };
            }
            const updated = await tx.organization.updateMany({
                where: {
                    id: organization.id,
                    lifecycleVersion: organization.lifecycleVersion,
                    legalHoldAt: { not: null },
                },
                data: {
                    legalHoldAt: null,
                    legalHoldReason: null,
                    legalHoldByUserId: null,
                    lifecycleVersion: { increment: 1 },
                },
            });
            if (updated.count === 0) throw changedMeanwhile();
            await this.recordHold(tx, { ...command, reason }, organization.id, {
                action: LEGAL_HOLD_LIFTED_ACTION,
                permission: AdminPermission.OrganizationLegalHoldLift,
                metadata: {
                    status: organization.lifecycleStatus,
                    heldSince: organization.legalHoldAt.toISOString(),
                    placedBy: organization.legalHoldByUserId,
                    placedFor: organization.legalHoldReason,
                },
            });
            if (
                organization.lifecycleStatus ===
                OrganizationLifecycleStatus.DeletedRetained
            ) {
                await enqueueDeletionCleanup(tx, organization.id);
            }
            return { ok: true, changed: true };
        });
    }

    /** Lift a suspension, or cancel a scheduled deletion: back to active. */
    async reinstate(command: OperatorCommand) {
        return this.transition(command, OrganizationLifecycleStatus.Active, {
            data: () => ({
                suspendedAt: null,
                suspendedByUserId: null,
                suspensionReason: null,
                deletionScheduledAt: null,
                deletionScheduledBy: null,
                deletionReason: null,
            }),
            action: "organization.reinstated",
        });
    }

    /** Schedule deletion after a retention window. Cancellable until it ends. */
    async scheduleDeletion(
        command: OperatorCommand & {
            confirmName: string;
            retentionDays?: number;
        },
    ) {
        const days = command.retentionDays ?? DELETION_WINDOW.default;
        if (
            !Number.isInteger(days) ||
            days < DELETION_WINDOW.min ||
            days > DELETION_WINDOW.max
        ) {
            throw new BadRequestException(
                `The retention window is ${DELETION_WINDOW.min} to ${DELETION_WINDOW.max} days.`,
            );
        }
        return this.transition(
            command,
            OrganizationLifecycleStatus.PendingDeletion,
            {
                confirmName: command.confirmName,
                data: (now) => ({
                    deletionScheduledAt: new Date(
                        now.getTime() + days * DAY_MS,
                    ),
                    deletionScheduledBy: command.staff.userId,
                    deletionReason: command.reason,
                }),
                action: "organization.deletion.scheduled",
                metadata: { retentionDays: days },
                // No renewal is charged during the window (owner, 9 Oct,
                // #921): Saroh's provider subscription ends with the period
                // already paid, on this transaction.
                inTx: async (tx, organizationId) => ({
                    ...(await stopRenewalsInTx(tx, organizationId)),
                }),
            },
        );
    }

    /**
     * Move a business to its new plan. Refused for a subscription a billing
     * provider manages: changing it here would leave the provider charging
     * for the old plan, so that change belongs with the provider.
     */
    async changePlan(command: OperatorCommand & { planId: string }) {
        const reason = requireReason(command.reason);
        const plan = await prisma.plan.findUnique({
            where: { id: command.planId },
            select: {
                id: true,
                key: true,
                version: true,
                name: true,
                active: true,
            },
        });
        if (!plan) throw new NotFoundException("Plan not found");
        if (!plan.active) {
            throw new ConflictException(
                "That plan is no longer offered; choose a current one.",
            );
        }

        return prisma.$transaction(async (tx) => {
            const organization = await this.organizationOrThrow(
                tx,
                command.organizationId,
            );
            const existing = await tx.subscription.findUnique({
                where: { organizationId: organization.id },
                select: {
                    planId: true,
                    provider: true,
                    plan: { select: { name: true } },
                },
            });
            assertNotProviderManaged(existing);
            if (existing?.planId === plan.id)
                return { ok: true, changed: false };

            await tx.subscription.upsert({
                where: { organizationId: organization.id },
                create: {
                    organizationId: organization.id,
                    planId: plan.id,
                    status: "ACTIVE",
                },
                update: { planId: plan.id },
            });

            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.SubscriptionOverride,
                action: "organization.plan.changed",
                targetType: "subscription",
                metadata: {
                    fromPlanId: existing?.planId ?? null,
                    toPlanId: plan.id,
                    toPlan: `${plan.key}@${plan.version}`,
                },
            });
            // The business's own history shows the plan it moved to, by the
            // operator, as its lifecycle changes do (#509).
            await tx.auditEvent.create({
                data: {
                    action: "organization.plan.changed",
                    actorUserId: command.staff.userId,
                    organizationId: organization.id,
                    targetType: "subscription",
                    targetId: organization.id,
                    outcome: "SUCCESS",
                    metadata: {
                        from: existing?.plan.name ?? null,
                        to: plan.name,
                        byOperator: true,
                    },
                },
            });
            return { ok: true, changed: true };
        });
    }

    /**
     * Start a trial, or extend one already running. A business with no
     * subscription needs a plan to trial; a paying or provider-managed one is
     * refused, because a trial would stop what it already pays for.
     */
    async trial(command: OperatorCommand & { days: number; planId?: string }) {
        const reason = requireReason(command.reason);
        if (
            !Number.isInteger(command.days) ||
            command.days < 1 ||
            command.days > 90
        ) {
            throw new BadRequestException("A trial is 1 to 90 days.");
        }

        return prisma.$transaction(async (tx) => {
            const organization = await this.organizationOrThrow(
                tx,
                command.organizationId,
            );
            const existing = await tx.subscription.findUnique({
                where: { organizationId: organization.id },
                select: {
                    status: true,
                    provider: true,
                    currentPeriodEnd: true,
                    planId: true,
                },
            });
            assertNotProviderManaged(existing);

            const now = new Date();
            let endsAt: Date;

            if (!existing || existing.status === "CANCELLED") {
                if (!command.planId) {
                    throw new BadRequestException(
                        "This business has no plan yet; choose the plan to trial.",
                    );
                }
                const plan = await tx.plan.findUnique({
                    where: { id: command.planId },
                    select: { id: true, active: true },
                });
                if (!plan?.active) {
                    throw new NotFoundException("Plan not found");
                }
                endsAt = new Date(now.getTime() + command.days * DAY_MS);
                await tx.subscription.upsert({
                    where: { organizationId: organization.id },
                    create: {
                        organizationId: organization.id,
                        planId: plan.id,
                        status: "TRIALING",
                        currentPeriodEnd: endsAt,
                    },
                    update: {
                        planId: plan.id,
                        status: "TRIALING",
                        currentPeriodEnd: endsAt,
                        cancelAtPeriodEnd: false,
                        freeChosenAt: null,
                    },
                });
            } else if (existing.status === "TRIALING") {
                const from =
                    existing.currentPeriodEnd && existing.currentPeriodEnd > now
                        ? existing.currentPeriodEnd
                        : now;
                endsAt = new Date(from.getTime() + command.days * DAY_MS);
                await tx.subscription.update({
                    where: { organizationId: organization.id },
                    data: { currentPeriodEnd: endsAt },
                });
            } else {
                throw new ConflictException(
                    `This business is on a ${existing.status.toLowerCase().replace("_", " ")} plan; a trial would replace what it has.`,
                );
            }

            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.SubscriptionOverride,
                action:
                    existing?.status === "TRIALING"
                        ? "organization.trial.extended"
                        : "organization.trial.started",
                targetType: "subscription",
                metadata: { days: command.days, endsAt: endsAt.toISOString() },
            });
            return { ok: true, endsAt };
        });
    }

    /**
     * Raise one numeric plan limit for a while. Only a cap the plan already
     * sets can be raised, and only upwards (see `applyOverrides`).
     */
    async raiseLimit(
        command: OperatorCommand & { key: string; value: number; days: number },
    ) {
        const reason = requireReason(command.reason);
        if (
            !Number.isInteger(command.days) ||
            command.days < 1 ||
            command.days > 365
        ) {
            throw new BadRequestException(
                "A raised limit lasts 1 to 365 days.",
            );
        }
        const planValues = await this.entitlements.getPlanEntitlements(
            command.organizationId,
        );
        const current = planValues[command.key];
        if (typeof current !== "number") {
            throw new BadRequestException(
                `"${command.key}" is not a limit this business's plan sets.`,
            );
        }
        if (!Number.isInteger(command.value) || command.value <= current) {
            throw new BadRequestException(
                `The plan already allows ${current}; a raised limit must be higher.`,
            );
        }

        const expiresAt = new Date(Date.now() + command.days * DAY_MS);
        return prisma.$transaction(async (tx) => {
            await this.organizationOrThrow(tx, command.organizationId);
            const override = await tx.entitlementOverride.create({
                data: {
                    organizationId: command.organizationId,
                    key: command.key,
                    value: command.value,
                    reason,
                    grantedByUserId: command.staff.userId,
                    expiresAt,
                },
                select: { id: true, key: true, value: true, expiresAt: true },
            });
            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.SubscriptionOverride,
                action: "organization.limit.raised",
                targetType: "entitlement_override",
                targetId: override.id,
                metadata: {
                    key: command.key,
                    from: current,
                    to: command.value,
                    expiresAt: expiresAt.toISOString(),
                },
            });
            return override;
        });
    }

    /** End a raised limit early. */
    async revokeLimit(command: OperatorCommand & { overrideId: string }) {
        const reason = requireReason(command.reason);
        return prisma.$transaction(async (tx) => {
            const override = await tx.entitlementOverride.findFirst({
                where: {
                    id: command.overrideId,
                    organizationId: command.organizationId,
                },
                select: { id: true, key: true, revokedAt: true },
            });
            if (!override)
                throw new NotFoundException("Raised limit not found");
            if (override.revokedAt) return { ok: true };

            await tx.entitlementOverride.update({
                where: { id: override.id },
                data: { revokedAt: new Date() },
            });
            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.SubscriptionOverride,
                action: "organization.limit.revoked",
                targetType: "entitlement_override",
                targetId: override.id,
                metadata: { key: override.key },
            });
            return { ok: true };
        });
    }

    /**
     * Enable or disable one module, honouring the registry's dependency and
     * safe-deactivation rules exactly as the business's own owner would meet
     * them — this goes through the same `ModuleLifecycleService`.
     */
    async setModule(
        command: OperatorCommand & { moduleKey: string; enabled: boolean },
    ) {
        const reason = requireReason(command.reason);
        const moduleKey = command.moduleKey;
        if (!isModuleKey(moduleKey)) {
            throw new BadRequestException(`Unknown module "${moduleKey}"`);
        }
        await this.organizationOrThrow(prisma, command.organizationId);

        const ctx = operatorContext(command);
        const record = (tx: Tx) =>
            this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.OrganizationModulesWrite,
                action: command.enabled
                    ? "organization.module.enabled"
                    : "organization.module.disabled",
                targetType: "module",
                targetId: moduleKey,
            });

        if (command.enabled) {
            await this.modules.enable(ctx, moduleKey, record);
        } else {
            await this.modules.disable(ctx, moduleKey, record);
        }
        return { ok: true };
    }

    /**
     * Repair: create any module installation rows this business is missing,
     * derived from its own data. Never overwrites a row that exists, so it
     * cannot undo an owner's decision.
     */
    async repairModules(command: OperatorCommand) {
        const reason = requireReason(command.reason);
        return prisma.$transaction(async (tx) => {
            await this.organizationOrThrow(tx, command.organizationId);
            const result = await backfillOneOrganization(
                tx,
                command.organizationId,
            );
            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.OrganizationModulesWrite,
                action: "organization.modules.repaired",
                targetType: "module",
                metadata: {
                    createdRows: result.createdRows,
                    enabled: result.enabled,
                },
            });
            return { createdRows: result.createdRows };
        });
    }

    /** An operator's note on the business. Audited like any operator write. */
    async addNote(
        staff: PlatformAdminInfo,
        organizationId: string,
        body: string,
    ) {
        const text = body.trim();
        if (text.length < 2) throw new BadRequestException("Write the note.");
        return prisma.$transaction(async (tx) => {
            await this.organizationOrThrow(tx, organizationId);
            const note = await tx.adminOrganizationNote.create({
                data: {
                    organizationId,
                    authorUserId: staff.userId,
                    body: text,
                },
                select: {
                    id: true,
                    authorUserId: true,
                    body: true,
                    createdAt: true,
                },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationViewAs,
                action: "organization.note.added",
                targetType: "admin_note",
                targetId: note.id,
                organizationId,
                outcome: AdminAuditOutcome.Success,
            });
            return note;
        });
    }

    private async transition(
        command: OperatorCommand & { confirmName?: string },
        to: OrganizationLifecycleStatus,
        options: {
            confirmName?: string;
            data: (now: Date) => Prisma.OrganizationUpdateManyMutationInput;
            action: string;
            metadata?: Record<string, unknown>;
            /** More of the same change, on its transaction; counts for the ledger. */
            inTx?: (
                tx: Tx,
                organizationId: string,
            ) => Promise<Record<string, unknown>>;
        },
    ) {
        const reason = requireReason(command.reason);
        const now = new Date();

        return prisma.$transaction(async (tx) => {
            const organization = await tx.organization.findUnique({
                where: { id: command.organizationId },
                select: {
                    id: true,
                    name: true,
                    lifecycleStatus: true,
                    lifecycleVersion: true,
                    legalHoldAt: true,
                },
            });
            if (!organization)
                throw new NotFoundException("Organization not found");

            if (
                options.confirmName !== undefined &&
                options.confirmName.trim() !== organization.name
            ) {
                throw new BadRequestException(
                    "Type the business's name exactly to confirm.",
                );
            }

            const from =
                organization.lifecycleStatus as OrganizationLifecycleStatus;
            if (from === to) return { ok: true, changed: false, status: to };
            assertOrganizationLifecycleTransition(from, to);
            // A held business's data is kept "even if deletion was
            // requested" (the Terms; DEC-119): no window starts. Placing a
            // hold bumps the version this write is fenced on, so a hold set
            // since this read refuses it too.
            // Nor does it go back to active: while it is held its workspace
            // stays closed to new writes, so none of its people can delete
            // a record either. Which moves a hold allows is the lifecycle
            // table's (`LEGAL_HOLD_DECISIONS`).
            if (organization.legalHoldAt && !legalHoldAllowsMoveTo(to)) {
                throw new ConflictException({
                    message:
                        to === OrganizationLifecycleStatus.Active
                            ? LEGAL_HOLD_BLOCKS_REINSTATE
                            : LEGAL_HOLD_BLOCKS_DELETION,
                    details: { code: LEGAL_HOLD_CODE },
                });
            }

            // Guarded on the version read above: a concurrent change bumps it,
            // this matches nothing, and the operator is told to reload rather
            // than silently overwriting what the other operator did.
            const updated = await tx.organization.updateMany({
                where: {
                    id: organization.id,
                    lifecycleVersion: organization.lifecycleVersion,
                },
                data: {
                    ...options.data(now),
                    lifecycleStatus: to,
                    lifecycleVersion: { increment: 1 },
                },
            });
            if (updated.count === 0) throw changedMeanwhile();

            const effects = options.inTx
                ? await options.inTx(tx, organization.id)
                : {};
            const metadata = { from, to, ...options.metadata, ...effects };
            await this.ledger(tx, {
                command: { ...command, reason },
                permission: AdminPermission.OrganizationLifecycleWrite,
                action: options.action,
                targetType: "organization",
                targetId: organization.id,
                metadata,
            });
            // The business's own history, attributed to the operator.
            await tx.auditEvent.create({
                data: {
                    action: options.action,
                    actorUserId: command.staff.userId,
                    organizationId: organization.id,
                    targetType: "organization",
                    targetId: organization.id,
                    outcome: "SUCCESS",
                    metadata: { ...metadata, byOperator: true },
                },
            });
            return { ok: true, changed: true, status: to };
        });
    }

    private ledger(
        tx: Tx,
        entry: {
            command: OperatorCommand;
            permission: AdminAuditInput["permission"];
            action: string;
            targetType: string;
            targetId?: string;
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.audit.write(tx, {
            actorUserId: entry.command.staff.userId,
            permission: entry.permission,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId ?? entry.command.organizationId,
            organizationId: entry.command.organizationId,
            reason: entry.command.reason,
            outcome: AdminAuditOutcome.Success,
            metadata: entry.metadata,
        });
    }

    /** A business a hold is placed on or lifted from: any that exists. */
    private async holdTarget(tx: Tx, organizationId: string) {
        const organization = await tx.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                lifecycleStatus: true,
                lifecycleVersion: true,
                legalHoldAt: true,
                legalHoldReason: true,
                legalHoldByUserId: true,
            },
        });
        if (!organization)
            throw new NotFoundException("Organization not found");
        return organization;
    }

    /**
     * A hold placed or lifted, on both ledgers in the change's transaction:
     * the admin ledger with the operator's reason, and the business's own
     * history without it (its people see that a hold exists, never why).
     */
    private async recordHold(
        tx: Tx,
        command: OperatorCommand,
        organizationId: string,
        entry: {
            action: string;
            permission: AdminAuditInput["permission"];
            metadata: Record<string, unknown>;
        },
    ): Promise<void> {
        await this.ledger(tx, {
            command,
            permission: entry.permission,
            action: entry.action,
            targetType: "organization",
            targetId: organizationId,
            metadata: entry.metadata,
        });
        await tx.auditEvent.create({
            data: {
                action: entry.action,
                actorUserId: command.staff.userId,
                organizationId,
                targetType: "organization",
                targetId: organizationId,
                outcome: "SUCCESS",
                metadata: { byOperator: true },
            },
        });
    }

    private async organizationOrThrow(
        db: Pick<Tx, "organization">,
        organizationId: string,
    ) {
        const organization = await db.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, lifecycleStatus: true },
        });
        if (!organization)
            throw new NotFoundException("Organization not found");
        if (
            organization.lifecycleStatus ===
            OrganizationLifecycleStatus.DeletedRetained
        ) {
            throw new ConflictException("This business has been deleted.");
        }
        return organization;
    }
}

/**
 * The context an operator's module change runs under. It carries the one
 * action the change needs and the operator's own user id, so the change is
 * never put down to one of the business's members; its role key marks the
 * business's audit row `byOperator`, which Activity shows as Saroh support
 * (DEC-035).
 */
function operatorContext(command: OperatorCommand): OrganizationContext {
    return {
        organizationId: command.organizationId,
        userId: command.staff.userId,
        role: "MEMBER",
        roleKey: PLATFORM_OPERATOR_ROLE_KEY,
        actions: new Set(["module:manage"]),
    };
}

function changedMeanwhile(): ConflictException {
    return new ConflictException(
        "This business changed while you were looking at it. Reload and try again.",
    );
}

export function assertNotProviderManaged(
    subscription: { provider: string | null } | null,
): void {
    if (subscription?.provider) {
        throw new ConflictException(
            `This plan is billed through ${subscription.provider}; change it there so billing stays in step.`,
        );
    }
}

export function requireReason(value: string): string {
    const reason = value.trim();
    if (reason.length < 4) {
        throw new BadRequestException("Give a reason for this change.");
    }
    return reason;
}
