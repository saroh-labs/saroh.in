import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import { catalogPlanIdForKey } from "@saroh/pricing-catalog";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { enqueueBillingEmail } from "../billing/billing-email.job";
import {
    BILLING_PROFILE_SYNC_TYPE,
    enqueueBillingProfileSync,
} from "../billing/billing-profile-sync";
import { recordRefundInTx } from "../billing/billing-refunds";
import { CheckoutService } from "../billing/checkout.service";
import type { DoubleChargeRefundPayload } from "../billing/double-charge";
import {
    BILLING_REFUND_TYPE,
    REFUND_AUDIT_ACTION,
    REFUND_MAX_ATTEMPTS,
    refundDoneKey,
} from "../billing/double-charge";
import { freePlanRowInTx } from "../billing/term-end";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { requireReason } from "./admin-lifecycle.service";
import { AdminPermission } from "./admin-permissions";

type Staff = PlatformAdminInfo;

/**
 * What an operator may do about Saroh's own billing for one business
 * (DEC-166, owner 17 Oct 2026: "this is not good that we are currently not
 * able to process anything"). Each needs `saroh-billing:act` (Platform
 * Owners and Billing), checked here again ({@link assertSarohBillingActor}),
 * takes a reason, is written to the admin ledger, and is idempotent twice
 * over: the controller's `once()` replays a retried request, and each
 * action reads where things stand first, so asking again changes nothing.
 * No support-access session: this is Saroh's own billing of the business.
 *
 * - **End autopay** ({@link endAutopay}): the business's own "Cancel plan",
 *   run as the operator through `CheckoutService` — the plan runs to the end
 *   of what is paid, then Free; the provider is told to stop charging. The
 *   business is emailed.
 * - **Re-check a double charge's refund** ({@link recheckRefund}): queues
 *   `billing.refund.double-charge` again with its claim's payload. The
 *   provider answers a payment already refunded in full with that refund,
 *   so after the owner refunded it by hand the job writes the done row,
 *   emails the business and notes it — never a second refund.
 * - **Sync the provider's customer again** ({@link syncCustomer}): queues
 *   `billing.profile.sync` for the billing profile the business is billed
 *   to (DEC-167). The profile spans businesses, so it syncs one customer
 *   for all of them.
 * - **Record a refund the owner made by hand** ({@link recordRefund})
 *   against the invoice it paid: a `BillingRefund`, and a Needs-action row
 *   to ask the CA about a credit note (Saroh issues none).
 */
@Injectable()
export class AdminBillingControlsService {
    private readonly logger = new Logger(AdminBillingControlsService.name);

    constructor(
        private readonly checkout: CheckoutService,
        private readonly audit: AdminAuditService,
    ) {}

    async endAutopay(
        staff: Staff,
        subscriptionId: string,
        reasonText: string,
        now: Date = new Date(),
    ): Promise<{ ok: true; changed: boolean; effectiveAt: string | null }> {
        assertSarohBillingActor(staff);
        const reason = requireReason(reasonText);
        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                provider: true,
                providerSubscriptionId: true,
                freeChosenAt: true,
                pendingFrom: true,
                plan: { select: { name: true, version: true } },
            },
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        if (sub.freeChosenAt && sub.pendingFrom) {
            return {
                ok: true,
                changed: false,
                effectiveAt: sub.pendingFrom.toISOString(),
            };
        }
        if (
            !sub.provider ||
            !sub.providerSubscriptionId ||
            sub.status === "CANCELLED"
        ) {
            throw new ConflictException(
                "This business has no autopay to end: it pays nothing through the billing provider.",
            );
        }
        const free = await this.freeCatalogueId(now);
        const result = await this.checkout.changePlan(
            operatorBillingContext(staff, sub.organizationId),
            { plan: free, cycle: "month" },
            now,
        );
        if (result.kind !== "TO_FREE") {
            throw new ConflictException(
                "Saroh couldn't move this business to Free. Nothing changed.",
            );
        }
        const effectiveAt = new Date(result.effectiveAt);
        await prisma.$transaction(async (tx) => {
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohBillingAct,
                action: "billing.autopay.ended",
                targetType: "subscription",
                targetId: sub.id,
                organizationId: sub.organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    plan: sub.plan.name,
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                    effectiveAt: result.effectiveAt,
                },
            });
            await enqueueBillingEmail(tx, {
                kind: "AUTOPAY_ENDED",
                organizationId: sub.organizationId,
                subscriptionId: sub.id,
                planName: sub.plan.name,
                endsAt: effectiveAt.toISOString(),
            });
        });
        this.logger.warn(
            `billing_autopay_ended_by_operator org=${sub.organizationId} sub=${sub.id} at=${result.effectiveAt}`,
        );
        return { ok: true, changed: true, effectiveAt: result.effectiveAt };
    }

    async recheckRefund(
        staff: Staff,
        providerPaymentId: string,
        reasonText: string,
    ): Promise<{
        ok: true;
        changed: boolean;
        already?: "refunded" | "queued";
    }> {
        assertSarohBillingActor(staff);
        const reason = requireReason(reasonText);
        return prisma.$transaction(async (tx) => {
            const claim = await tx.adminAuditEvent.findFirst({
                where: {
                    action: REFUND_AUDIT_ACTION,
                    targetType: "payment",
                    targetId: providerPaymentId,
                },
                select: {
                    organizationId: true,
                    reason: true,
                    metadata: true,
                },
            });
            if (!claim?.organizationId) {
                throw new NotFoundException(
                    "Saroh owes no double-charge refund on that payment.",
                );
            }
            const meta = (claim.metadata ?? {}) as Record<string, unknown>;
            const provider =
                typeof meta.provider === "string" ? meta.provider : "RAZORPAY";
            const done = await tx.adminAuditEvent.findUnique({
                where: {
                    idempotencyKey: refundDoneKey(provider, providerPaymentId),
                },
                select: { id: true },
            });
            if (done) return { ok: true, changed: false, already: "refunded" };
            const waiting = await tx.job.findFirst({
                where: {
                    type: BILLING_REFUND_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                    payload: {
                        path: ["providerPaymentId"],
                        equals: providerPaymentId,
                    },
                },
                select: { id: true },
            });
            if (waiting) return { ok: true, changed: false, already: "queued" };
            const payload: DoubleChargeRefundPayload = {
                provider,
                providerPaymentId,
                providerSubscriptionId:
                    typeof meta.providerSubscriptionId === "string"
                        ? meta.providerSubscriptionId
                        : "",
                amountPaise:
                    typeof meta.amountPaise === "number"
                        ? meta.amountPaise
                        : null,
                reason: claim.reason ?? "Charged twice",
            };
            await tx.job.create({
                data: {
                    type: BILLING_REFUND_TYPE,
                    organizationId: claim.organizationId,
                    maxAttempts: REFUND_MAX_ATTEMPTS,
                    payload: { ...payload },
                },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohBillingAct,
                action: "billing.refund.recheck",
                targetType: "payment",
                targetId: providerPaymentId,
                organizationId: claim.organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { provider },
            });
            return { ok: true, changed: true };
        });
    }

    async syncCustomer(
        staff: Staff,
        organizationId: string,
        reasonText: string,
    ): Promise<{ ok: true; changed: boolean }> {
        assertSarohBillingActor(staff);
        const reason = requireReason(reasonText);
        return prisma.$transaction(async (tx) => {
            const org = await tx.organization.findUnique({
                where: { id: organizationId },
                select: { id: true, billingProfileId: true },
            });
            if (!org) throw new NotFoundException("Organization not found");
            const billingProfileId = org.billingProfileId;
            if (!billingProfileId) {
                throw new ConflictException(
                    "This business hasn't chosen a billing profile yet, so there's no customer to sync. An owner chooses one in Plan & billing.",
                );
            }
            const before = await tx.job.count({
                where: {
                    type: BILLING_PROFILE_SYNC_TYPE,
                    status: "PENDING",
                    payload: {
                        path: ["billingProfileId"],
                        equals: billingProfileId,
                    },
                },
            });
            await enqueueBillingProfileSync(tx, billingProfileId);
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohBillingAct,
                action: BILLING_PROFILE_SYNC_TYPE,
                targetType: "organization",
                targetId: organizationId,
                organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { alreadyQueued: before > 0, billingProfileId },
            });
            return { ok: true, changed: before === 0 };
        });
    }

    async recordRefund(
        staff: Staff,
        invoiceId: string,
        input: {
            providerPaymentId: string;
            providerRefundId: string;
            amountPaise: number;
            reason: string;
        },
    ): Promise<{ ok: true; changed: boolean; refundId: string }> {
        assertSarohBillingActor(staff);
        const reason = requireReason(input.reason);
        return prisma.$transaction(async (tx) => {
            const invoice = await tx.sarohInvoice.findUnique({
                where: { id: invoiceId },
                select: {
                    id: true,
                    organizationId: true,
                    number: true,
                    provider: true,
                    providerPaymentId: true,
                    totalPaise: true,
                },
            });
            if (!invoice) throw new NotFoundException("Invoice not found");
            if (
                invoice.providerPaymentId &&
                invoice.providerPaymentId !== input.providerPaymentId
            ) {
                throw new ConflictException(
                    `That payment isn't this invoice's: ${invoice.number} was paid by ${invoice.providerPaymentId}.`,
                );
            }
            const had = await tx.billingRefund.findUnique({
                where: {
                    provider_providerRefundId: {
                        provider: invoice.provider,
                        providerRefundId: input.providerRefundId,
                    },
                },
                select: { id: true, invoiceId: true, source: true },
            });
            if (had?.invoiceId && had.invoiceId !== invoice.id) {
                throw new ConflictException(
                    "That refund is already recorded against another invoice.",
                );
            }
            if (had?.source === "MANUAL") {
                return { ok: true, changed: false, refundId: had.id };
            }
            const refunded = await tx.billingRefund.aggregate({
                where: {
                    invoiceId: invoice.id,
                    kind: "REFUND",
                    status: { not: "FAILED" },
                    ...(had ? { id: { not: had.id } } : {}),
                },
                _sum: { amountPaise: true },
            });
            if (
                (refunded._sum.amountPaise ?? 0) + input.amountPaise >
                invoice.totalPaise
            ) {
                throw new ConflictException(
                    "That is more than the invoice's total, counting the refunds already recorded on it.",
                );
            }
            const refundId = await recordRefundInTx(tx, this.logger, {
                provider: invoice.provider,
                kind: "REFUND",
                providerRefundId: input.providerRefundId,
                providerPaymentId: input.providerPaymentId,
                amountPaise: input.amountPaise,
                status: "PROCESSED",
                reason,
                source: "MANUAL",
                recordedBy: staff.userId,
                organizationId: invoice.organizationId,
                invoiceId: invoice.id,
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohBillingAct,
                action: "billing.refund.recorded",
                targetType: "saroh_invoice",
                targetId: invoice.id,
                organizationId: invoice.organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    invoice: invoice.number,
                    provider: invoice.provider,
                    providerPaymentId: input.providerPaymentId,
                    providerRefundId: input.providerRefundId,
                    amountPaise: input.amountPaise,
                },
            });
            return { ok: true, changed: true, refundId };
        });
    }

    /** The live catalogue's Free plan, by its catalogue id ("free"). */
    private async freeCatalogueId(now: Date): Promise<string> {
        const live = await liveCatalogueVersion(prisma, now);
        const row = live ? await freePlanRowInTx(prisma, live.version) : null;
        const plan = row
            ? await prisma.plan.findUnique({
                  where: { id: row.id },
                  select: { key: true },
              })
            : null;
        const id = plan ? catalogPlanIdForKey(plan.key) : null;
        if (!id) {
            throw new ConflictException(
                "No Free plan is live in the catalogue, so there is nothing to move this business to.",
            );
        }
        return id;
    }
}

/**
 * The context an operator's "end autopay" runs under: the business's own
 * move to Free, with the one power it asks (`billing:manage`) and the
 * operator's own user id, so it is never put down to one of the business's
 * owners; the role key marks the business's audit row `byOperator`, which
 * Activity shows as Saroh support (DEC-035).
 */
export function operatorBillingContext(
    staff: Staff,
    organizationId: string,
): OrganizationContext {
    return {
        organizationId,
        userId: staff.userId,
        role: "MEMBER",
        roleKey: PLATFORM_OPERATOR_ROLE_KEY,
        actions: new Set(["billing:manage"]),
    };
}

/**
 * `saroh-billing:act`, checked again inside the service (DEC-166): the
 * route's `@RequireAdminPermission` is the first lock, this the second.
 */
export function assertSarohBillingActor(staff: Staff | undefined): void {
    if (!staff?.permissions.includes(AdminPermission.SarohBillingAct)) {
        throw new ForbiddenException(
            "Platform administrator permission required",
        );
    }
}
