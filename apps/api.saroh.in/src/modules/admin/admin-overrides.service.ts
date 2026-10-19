import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { liveCataloguePlanRow, prisma } from "@saroh/database";
import {
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
} from "@saroh/pricing-catalog";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";

import { mapEntry } from "../billing/catalogue-access";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { enqueuePlanChangeNotice } from "../billing/plan-change-notice.handler";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { MoveNoticePayload } from "../pricing/moves.service";
import {
    noticeDaysFor,
    pendingFromFor,
    PRICING_MOVE_NOTICE_TYPE,
    samePlan,
} from "../pricing/moves.service";
import { OrganizationLifecycleStatus } from "./admin-access.service";
import type { AdminAuditInput } from "./admin-audit.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { OperatorCommand } from "./admin-lifecycle.service";
import {
    assertNotProviderManaged,
    requireReason,
} from "./admin-lifecycle.service";
import type { OfferOptions } from "./admin-offer-options";
import { offerOptions } from "./admin-offer-options";
import { previewOffer } from "./admin-offer-preview";
import type { OfferDraft, OfferPreview } from "./admin-offers";
import { assertMayTakeAway, endDate, liveCatalog } from "./admin-offers";
import { AdminPermission } from "./admin-permissions";
import { catalogueUsage } from "./catalogue-usage";
import { limitOverrideWarning } from "./limit-override-warning";

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after a plan override's end its "back on your plan" notice runs. */
const PLAN_END_GRACE_MS = 60 * 1000;

export type ModuleOverrideKind = "grant" | "remove" | "limit";

/**
 * Overrides that contradict each other on one row: a grant and a removal
 * can't both stand (a grant would always win, `OVERRIDE_ORDER`), and a
 * second limit replaces the first. Writing one revokes the live ones in its
 * slot, so a business has at most one of each.
 */
const SLOT: Record<string, readonly string[]> = {
    grant: ["grant", "remove"],
    remove: ["grant", "remove"],
    limit: ["limit"],
    price: ["price"],
    plan: ["plan"],
};

const ACTION: Record<string, string> = {
    grant: "organization.override.granted",
    remove: "organization.override.removed",
    limit: "organization.override.limit-set",
    price: "organization.override.price-set",
    plan: "organization.override.plan-set",
};

export interface WrittenOverride {
    id: string;
    kind: string;
    moduleKey: string | null;
    planKey: string | null;
    value: number | null;
    expiresAt: Date | null;
    /** Said back to the operator; the change was still made. */
    warning: string | null;
}

/**
 * One business's exceptions to its catalogue plan (plans catalogue U11,
 * KTD-6): grant or remove a row, set a row's limit up or down, a custom
 * price, a plan until a date, and a move to the live version now or at its
 * renewal. Staff make them on the business page; `CatalogueAccessService`
 * reads the rows, so nothing else is needed for them to apply.
 *
 * Each write takes a reason and lands in the admin ledger and the
 * business's own history (marked `byOperator`) in the same transaction as
 * the change. CROSS-TENANT READ: it reads the one business in the path,
 * behind the admin guards.
 */
@Injectable()
export class AdminOverridesService {
    constructor(
        private readonly audit: AdminAuditService,
        private readonly access: CatalogueAccessService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    /**
     * The dry run of a custom offer or of Take away a module… (U5, R5):
     * the write's checks, then what the business would see. Writes nothing.
     */
    preview(
        staff: PlatformAdminInfo,
        organizationId: string,
        draft: OfferDraft,
    ): Promise<OfferPreview> {
        return previewOffer(this.access, staff, organizationId, draft);
    }

    /** What the offer sheet can give this business (U5). Writes nothing. */
    offers(
        staff: PlatformAdminInfo,
        organizationId: string,
    ): Promise<OfferOptions> {
        return offerOptions(this.access, staff, organizationId);
    }

    /** Grant, remove, or set the limit of one catalogue row. */
    async setModuleOverride(
        command: OperatorCommand & {
            kind: ModuleOverrideKind;
            moduleKey: string;
            value?: number;
            expiresAt?: string;
        },
    ): Promise<WrittenOverride> {
        const reason = requireReason(command.reason);
        const expiresAt = endDate(command.expiresAt, false);
        const access = await this.catalogueAccess(command.organizationId);
        const row = access.catalog.modules.find(
            (m) => m.id === command.moduleKey,
        );
        if (!row) {
            throw new BadRequestException(
                `"${command.moduleKey}" isn't a module in version ${access.version}.`,
            );
        }

        // Take away a module… (U5): a Platform owner's alone, and never a
        // row their paid plan includes (an override is a gift).
        if (command.kind === "remove") {
            await assertMayTakeAway(
                this.access,
                command.staff,
                command.organizationId,
                row,
            );
        }

        let warning: string | null = null;
        let value: number | null = null;
        if (command.kind === "limit") {
            if (
                typeof command.value !== "number" ||
                !Number.isInteger(command.value) ||
                command.value < 0
            ) {
                throw new BadRequestException("Give the new limit.");
            }
            if (!mapEntry(row.id)?.limitKey) {
                throw new BadRequestException(
                    `${row.name} is on or off; it has no limit to set.`,
                );
            }
            const now = access.modules.find((m) => m.moduleId === row.id);
            if (now?.state !== "on") {
                throw new ConflictException(
                    `${row.name} is off for this business; grant it first.`,
                );
            }
            value = command.value;
            const used = (
                await catalogueUsage(command.organizationId, [row.id])
            ).usage[row.id];
            if (typeof used === "number") {
                // What happens to what is over it (#802, #800's rules).
                warning = limitOverrideWarning({
                    rowId: row.id,
                    used,
                    value,
                    monthly: now.per === "month",
                    enforced: await this.flags.isEnabled(
                        FlagKey.PLAN_ENFORCEMENT,
                        command.organizationId,
                    ),
                });
            }
        }

        return this.write(command, reason, {
            kind: command.kind,
            key: row.id,
            moduleKey: row.id,
            value,
            planKey: null,
            expiresAt,
            warning,
            metadata: { module: row.id, value },
        });
    }

    /**
     * A custom monthly price. Refused while a billing provider manages the
     * subscription, as a plan change is: the provider would go on charging
     * the old amount.
     */
    async setPrice(
        command: OperatorCommand & { pricePaise: number; expiresAt?: string },
    ): Promise<WrittenOverride> {
        const reason = requireReason(command.reason);
        const expiresAt = endDate(command.expiresAt, false);
        if (!Number.isInteger(command.pricePaise) || command.pricePaise < 0) {
            throw new BadRequestException("A price is whole paise, 0 or more.");
        }
        const access = await this.catalogueAccess(command.organizationId);
        const subscription = await prisma.subscription.findUnique({
            where: { organizationId: command.organizationId },
            select: { provider: true },
        });
        assertNotProviderManaged(subscription);
        return this.write(command, reason, {
            kind: "price",
            key: "price",
            moduleKey: null,
            value: command.pricePaise,
            planKey: null,
            expiresAt,
            warning: null,
            metadata: {
                fromPaise: access.pricePaise,
                toPaise: command.pricePaise,
            },
        });
    }

    /**
     * Put the business on a catalogue plan until a date, whatever its
     * subscription says. The plan override it had is revoked in the same
     * write, so extending one is writing a later date.
     */
    async setPlan(
        command: OperatorCommand & { planKey: string; expiresAt: string },
    ): Promise<WrittenOverride> {
        const reason = requireReason(command.reason);
        const expiresAt = endDate(command.expiresAt, true);
        const resolved = await this.access.resolve(command.organizationId);
        const catalog =
            resolved.source === "catalogue"
                ? resolved.catalog
                : await liveCatalog();
        if (!catalog) {
            throw new ConflictException(
                "No catalogue version is live yet, so there is no plan to put it on.",
            );
        }
        const plan = catalog.plans.find((p) => p.id === command.planKey);
        if (!plan) {
            throw new BadRequestException(
                `"${command.planKey}" isn't a plan in the version this business is on.`,
            );
        }
        return this.write(command, reason, {
            kind: "plan",
            key: "plan",
            moduleKey: null,
            value: null,
            planKey: plan.id,
            expiresAt,
            warning: null,
            metadata: {
                from: resolved.planOverride?.planKey ?? null,
                to: plan.id,
            },
            // The business hears it (UX-041): now, and again when the date
            // comes and it goes back to its own plan.
            after: async (tx, row) => {
                const fromPlanId =
                    resolved.source === "catalogue" ? resolved.planId : null;
                await enqueuePlanChangeNotice(tx, command.organizationId, {
                    eventKey: `plan-change:${row.id}:set`,
                    fromPlanId,
                    overrideId: row.id,
                    reason: "set",
                });
                if (!expiresAt) return;
                await enqueuePlanChangeNotice(
                    tx,
                    command.organizationId,
                    {
                        eventKey: `plan-change:${row.id}:ended`,
                        fromPlanId: plan.id,
                        overrideId: row.id,
                        reason: "ended",
                    },
                    // Just past the end, when the access read no longer
                    // counts the override.
                    new Date(expiresAt.getTime() + PLAN_END_GRACE_MS),
                );
            },
        });
    }

    /**
     * End one override now. A custom price is a price change, so ending one
     * needs `pricing:publish` as setting it does. A raised limit is ended
     * from its limit row (`subscription:override`), not here.
     */
    async removeOverride(command: OperatorCommand & { overrideId: string }) {
        const reason = requireReason(command.reason);
        return prisma.$transaction(async (tx) => {
            await organizationOrThrow(tx, command.organizationId);
            const row = await tx.entitlementOverride.findFirst({
                where: {
                    id: command.overrideId,
                    organizationId: command.organizationId,
                },
                select: {
                    id: true,
                    kind: true,
                    moduleKey: true,
                    planKey: true,
                    value: true,
                    revokedAt: true,
                },
            });
            if (!row) throw new NotFoundException("Override not found");
            if (row.kind === "raise") {
                throw new BadRequestException(
                    "A raised limit is ended from its limit row.",
                );
            }
            if (
                row.kind === "price" &&
                !command.staff.permissions.includes(
                    AdminPermission.PricingPublish,
                )
            ) {
                throw new ForbiddenException(
                    "Ending a custom price needs pricing:publish as well.",
                );
            }
            if (row.revokedAt) return { ok: true, changed: false };

            await tx.entitlementOverride.update({
                where: { id: row.id },
                data: { revokedAt: new Date() },
            });
            const metadata = {
                kind: row.kind,
                module: row.moduleKey,
                planKey: row.planKey,
                value: row.value,
            };
            await this.record(tx, command, reason, {
                action: "organization.override.revoked",
                targetType: "entitlement_override",
                targetId: row.id,
                metadata,
            });
            // Ending a plan override moves the business's plan: it hears
            // which plan it is on now (UX-041).
            if (row.kind === "plan") {
                await enqueuePlanChangeNotice(tx, command.organizationId, {
                    eventKey: `plan-change:${row.id}:removed`,
                    fromPlanId: row.planKey,
                    overrideId: row.id,
                    reason: "removed",
                });
            }
            return { ok: true, changed: true };
        });
    }

    /**
     * Move the business to its plan on the live catalogue version: now, or
     * at its first renewal at least 7 days away, 30 when its price changes
     * (`noticeDaysFor`, `moveDateFor`, KTD-4, DEC-161: the business then
     * approves the new amount), told ahead when its plan reads differently
     * there. "Now" is refused for a provider-managed subscription, as a plan
     * change is; at renewal, the renewal path applies it.
     */
    async moveToLive(command: OperatorCommand & { when: "now" | "renewal" }) {
        const reason = requireReason(command.reason);
        const now = new Date();
        return prisma.$transaction(async (tx) => {
            await organizationOrThrow(tx, command.organizationId);
            const sub = await tx.subscription.findUnique({
                where: { organizationId: command.organizationId },
                select: {
                    id: true,
                    status: true,
                    provider: true,
                    currentPeriodEnd: true,
                    pendingPlanId: true,
                    plan: { select: PLAN_SELECT },
                },
            });
            if (!sub || sub.status === "CANCELLED") {
                throw new ConflictException(
                    "This business has no running subscription to move.",
                );
            }
            if (!sub.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX)) {
                throw new ConflictException(
                    `It is on the older ${sub.plan.name} billing plan, not a catalogue plan; it moves when its plan changes.`,
                );
            }
            const planId = catalogPlanIdForKey(sub.plan.key) ?? "";
            const interval = sub.plan.interval === "year" ? "year" : "month";
            const live = await liveCataloguePlanRow(tx, planId, interval, now);
            if (!live) {
                throw new ConflictException(
                    `The live version doesn't offer ${sub.plan.name}, so there is nothing to move it to.`,
                );
            }
            if (live.version <= sub.plan.version) {
                throw new ConflictException(
                    "It is already on the live version.",
                );
            }
            const target = await tx.plan.findUniqueOrThrow({
                where: { id: live.id },
                select: PLAN_SELECT,
            });

            // An earlier move's notice no longer stands.
            await tx.job.deleteMany({
                where: {
                    type: PRICING_MOVE_NOTICE_TYPE,
                    status: "PENDING",
                    payload: { path: ["subscriptionId"], equals: sub.id },
                },
            });

            let pendingFrom: Date | null = null;
            if (command.when === "now") {
                assertNotProviderManaged(sub);
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: {
                        planId: target.id,
                        pendingPlanId: null,
                        pendingFrom: null,
                    },
                });
            } else {
                // 30 days' notice when the price changes (DEC-161), else 7.
                const noticeDays = noticeDaysFor(sub.plan, target);
                pendingFrom = pendingFromFor(
                    sub.currentPeriodEnd,
                    now,
                    interval,
                    noticeDays,
                );
                // Both columns together (the table's CHECK).
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: { pendingPlanId: target.id, pendingFrom },
                });
                if (!samePlan(sub.plan, target)) {
                    const payload: MoveNoticePayload = {
                        subscriptionId: sub.id,
                        pendingPlanId: target.id,
                        pendingFrom: pendingFrom.toISOString(),
                    };
                    await tx.job.create({
                        data: {
                            type: PRICING_MOVE_NOTICE_TYPE,
                            organizationId: command.organizationId,
                            runAt: new Date(
                                pendingFrom.getTime() - noticeDays * DAY_MS,
                            ),
                            payload: { ...payload },
                        },
                    });
                }
            }

            await this.record(tx, command, reason, {
                action:
                    command.when === "now"
                        ? "organization.plan.moved"
                        : "organization.plan.move-scheduled",
                targetType: "subscription",
                targetId: sub.id,
                metadata: {
                    plan: planId,
                    fromVersion: sub.plan.version,
                    toVersion: target.version,
                    from: pendingFrom?.toISOString() ?? null,
                },
            });
            return {
                ok: true,
                when: command.when,
                version: target.version,
                pendingFrom,
            };
        });
    }

    /** The business, read through the catalogue — refused when it isn't. */
    private async catalogueAccess(organizationId: string) {
        const access = await this.access.resolve(organizationId);
        if (access.source !== "catalogue") {
            throw new ConflictException(
                "This business isn't on a catalogue plan yet, so an override wouldn't apply. Put it on a plan first.",
            );
        }
        return access;
    }

    /**
     * Write one override, revoking the live ones it replaces, and record it.
     */
    private write(
        command: OperatorCommand,
        reason: string,
        o: {
            kind: string;
            key: string;
            moduleKey: string | null;
            value: number | null;
            planKey: string | null;
            expiresAt: Date | null;
            warning: string | null;
            metadata: Record<string, unknown>;
            /** More to write on the same transaction, with the new row. */
            after?: (tx: Tx, row: { id: string }) => Promise<void>;
        },
    ): Promise<WrittenOverride> {
        const now = new Date();
        return prisma.$transaction(async (tx) => {
            await organizationOrThrow(tx, command.organizationId);
            const replaced = await tx.entitlementOverride.findMany({
                where: {
                    organizationId: command.organizationId,
                    kind: { in: [...SLOT[o.kind]] },
                    ...(o.moduleKey ? { moduleKey: o.moduleKey } : {}),
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                select: { id: true },
            });
            if (replaced.length) {
                await tx.entitlementOverride.updateMany({
                    where: { id: { in: replaced.map((r) => r.id) } },
                    data: { revokedAt: now },
                });
            }
            const row = await tx.entitlementOverride.create({
                data: {
                    organizationId: command.organizationId,
                    kind: o.kind,
                    key: o.key,
                    moduleKey: o.moduleKey,
                    value: o.value,
                    planKey: o.planKey,
                    expiresAt: o.expiresAt,
                    reason,
                    grantedByUserId: command.staff.userId,
                },
                select: {
                    id: true,
                    kind: true,
                    moduleKey: true,
                    planKey: true,
                    value: true,
                    expiresAt: true,
                },
            });
            await this.record(tx, command, reason, {
                action: ACTION[o.kind],
                targetType: "entitlement_override",
                targetId: row.id,
                metadata: {
                    ...o.metadata,
                    expiresAt: o.expiresAt?.toISOString() ?? null,
                    replaced: replaced.map((r) => r.id),
                },
            });
            await o.after?.(tx, row);
            return { ...row, warning: o.warning };
        });
    }

    /**
     * The admin ledger, and the business's own history attributed to the
     * operator (`byOperator`), as lifecycle and plan changes are.
     */
    private async record(
        tx: Tx,
        command: OperatorCommand,
        reason: string,
        entry: {
            action: string;
            targetType: string;
            targetId: string;
            metadata: Record<string, unknown>;
        },
    ) {
        const input: AdminAuditInput = {
            actorUserId: command.staff.userId,
            permission: AdminPermission.PricingOverride,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            organizationId: command.organizationId,
            reason,
            outcome: AdminAuditOutcome.Success,
            metadata: entry.metadata,
        };
        await this.audit.write(tx, input);
        await tx.auditEvent.create({
            data: {
                action: entry.action,
                actorUserId: command.staff.userId,
                organizationId: command.organizationId,
                targetType: entry.targetType,
                targetId: entry.targetId,
                outcome: "SUCCESS",
                metadata: {
                    ...(entry.metadata as Prisma.InputJsonObject),
                    byOperator: true,
                },
            },
        });
    }
}

const PLAN_SELECT = {
    id: true,
    key: true,
    version: true,
    interval: true,
    name: true,
    priceCents: true,
    entitlements: true,
} as const;

async function organizationOrThrow(tx: Tx, organizationId: string) {
    const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    if (!organization) throw new NotFoundException("Organization not found");
    if (
        organization.lifecycleStatus ===
        OrganizationLifecycleStatus.DeletedRetained
    ) {
        throw new ConflictException("This business has been deleted.");
    }
}
