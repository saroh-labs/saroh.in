/**
 * Matching what the billing provider took against Saroh's invoices, and
 * keeping its refunds and disputes (DEC-166, owner 17 Oct 2026: "store the
 * data so that we can match them in razorpay"), against a real Postgres
 * through the fake billing provider (no Razorpay call is made):
 *
 * - The daily reconcile finds a payment Saroh never invoiced (its webhook
 *   lost) and raises it once, however often it runs; leaves a double
 *   charge (refunded, no invoice on purpose) alone; keeps the amount the
 *   provider took on each invoice and raises one that differs.
 * - A charge's amount that differs from its invoice is raised as it is
 *   written.
 * - `refund.*` and `payment.dispute.*` webhooks are kept as refunds and
 *   disputes on the invoice, never moved back, a failed refund and an open
 *   dispute raised; a refund on an invoice asks about a credit note.
 * - An event for a subscription no business has is raised and left not
 *   applied.
 *
 * Catalogue, prices and seller are made up (`fakeCatalog`). Integration
 * project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import { Logger } from "@nestjs/common";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    BILLING_RECONCILE_TYPE,
    BillingReconcileHandler,
} from "./billing-reconcile.job";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutService } from "./checkout.service";
import { recordDoubleChargeInTx } from "./double-charge";
import { PlansService } from "./plans.service";
import type {
    ProviderDisputeEvent,
    ProviderRefundEvent,
} from "./providers/billing-provider.port";
import { BillingProviderError } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const digits = tag.replace(/\D/g, "");

const SELLER: SarohSeller = {
    name: "Saroh",
    legalName: "Example Labs Pvt Ltd",
    gstin: "29AAAAA0000A1Z5",
    state: "29",
    address: "1 Test Road, Testville",
    email: "billing@example.test",
    sac: "999999",
    prefix: "TST",
};

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let reconcile: BillingReconcileHandler;

beforeAll(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    reconcile = new BillingReconcileHandler(factory);
    await prisma.plan.deleteMany({
        where: { key: { startsWith: "catalog." } },
    });
    await prisma.pricingCatalogVersion.deleteMany({});
    const catalog = fakeCatalog();
    const rows = planRows(catalog, 1);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    await prisma.pricingProviderPlan.createMany({
        data: planIds
            .filter((_, i) => rows[i]!.priceCents > 0)
            .map((planId) => ({
                planId,
                provider: "RAZORPAY",
                status: "SYNCED",
                providerPlanId: `plan_${planId}`,
            })),
    });
});

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Reconcile ${seq}`, slug: `reconcile-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

let evt = 0;
function send(body: Record<string, unknown>) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_rec_${evt}_${tag}`,
            status: "IGNORED",
            eventAt: new Date().toISOString(),
            ...body,
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, { "x-fake-signature": signature });
}

/** Free → Plan B monthly, paid by `paymentId` for `amountPaise`. */
async function onPaidPlan(paymentId: string, amountPaise?: number) {
    const ctx = await business();
    const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const ref = `fake_sub_${r.checkout.id}`;
    await send({
        type: "subscription.activated",
        providerSubscriptionId: ref,
        status: "ACTIVE",
        phase: "activated",
        currentPeriodEnd: new Date(Date.now() + 25 * DAY).toISOString(),
        providerPaymentId: paymentId,
        ...(amountPaise !== undefined
            ? { paymentAmountPaise: amountPaise }
            : {}),
    });
    const invoice = await prisma.sarohInvoice.findFirstOrThrow({
        where: { organizationId: ctx.organizationId },
    });
    return { ctx, ref, invoice };
}

function actions(code: string, organizationId?: string | null) {
    return prisma.billingAction.findMany({
        where: {
            code,
            ...(organizationId !== undefined ? { organizationId } : {}),
        },
    });
}

describe("billing.reconcile: what the provider took, against Saroh's invoices", () => {
    it("raises a payment Saroh never invoiced, once however often it runs; a matched one says nothing", async () => {
        const paid = `pay_ok${digits}1`;
        const { ctx, ref, invoice } = await onPaidPlan(paid);
        const missed = `pay_lost${digits}1`;
        fake.reconcile.set(ref, [
            {
                providerPaymentId: paid,
                amountPaise: invoice.totalPaise,
                paidAt: new Date(),
            },
            {
                providerPaymentId: missed,
                amountPaise: invoice.totalPaise,
                paidAt: new Date(),
            },
        ]);

        const first = await reconcile.sweep(new Date());
        expect(first.unmatched).toBe(1);
        await reconcile.sweep(new Date());

        const raised = await actions(
            "billing_reconcile_payment_unmatched",
            ctx.organizationId,
        );
        expect(raised).toHaveLength(1);
        expect(raised[0]).toMatchObject({
            dedupeKey: `reconcile-unmatched:RAZORPAY:${missed}`,
            refs: expect.objectContaining({ payment: missed }),
        });
        // The matched invoice keeps what the provider took; it agrees.
        expect(
            await prisma.sarohInvoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toMatchObject({ providerAmountPaise: invoice.totalPaise });
        expect(
            await actions("saroh_invoice_amount_mismatch", ctx.organizationId),
        ).toHaveLength(0);
        expect(fake.reconcile.asked).toContainEqual({
            ref,
            oneTime: false,
        });
    });

    it("raises an invoice whose total isn't what the provider took", async () => {
        const paid = `pay_odd${digits}2`;
        const { ctx, ref, invoice } = await onPaidPlan(paid);
        fake.reconcile.set(ref, [
            {
                providerPaymentId: paid,
                amountPaise: invoice.totalPaise + 500,
                paidAt: new Date(),
            },
        ]);
        const report = await reconcile.sweep(new Date());
        expect(report.mismatched).toBeGreaterThanOrEqual(1);
        expect(
            await prisma.sarohInvoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toMatchObject({ providerAmountPaise: invoice.totalPaise + 500 });
        expect(
            await actions("saroh_invoice_amount_mismatch", ctx.organizationId),
        ).toEqual([
            expect.objectContaining({
                dedupeKey: `amount-mismatch:${invoice.id}`,
            }),
        ]);
    });

    it("leaves a double charge alone: it has no invoice on purpose", async () => {
        const paid = `pay_one${digits}3`;
        const { ctx, ref, invoice } = await onPaidPlan(paid);
        const twice = `pay_twice${digits}3`;
        await prisma.$transaction((tx) =>
            recordDoubleChargeInTx(tx, new Logger("spec"), {
                organizationId: ctx.organizationId,
                provider: "RAZORPAY",
                providerSubscriptionId: ref,
                providerPaymentId: twice,
                amountPaise: invoice.totalPaise,
                reason: "Charged twice in spec",
            }),
        );
        fake.reconcile.set(ref, [
            {
                providerPaymentId: twice,
                amountPaise: invoice.totalPaise,
                paidAt: new Date(),
            },
        ]);
        await reconcile.sweep(new Date());
        expect(
            await actions(
                "billing_reconcile_payment_unmatched",
                ctx.organizationId,
            ),
        ).toHaveLength(0);
    });

    it("goes on past a reference the provider can't answer, and reschedules itself once", async () => {
        await onPaidPlan(`pay_skip${digits}4`);
        fake.reconcile.failNext = new BillingProviderError(
            "UNKNOWN",
            "network error",
        );
        const report = await reconcile.sweep(new Date());
        expect(report.failed).toBe(1);
        expect(report.refs).toBeGreaterThan(1);

        await prisma.job.deleteMany({
            where: { type: BILLING_RECONCILE_TYPE },
        });
        await reconcile.ensureScheduled();
        await reconcile.ensureScheduled();
        expect(
            await prisma.job.count({
                where: { type: BILLING_RECONCILE_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});

describe("a charge's amount, checked as its invoice is written", () => {
    it("raises a charge that took another amount than the invoice's total", async () => {
        const { ctx, invoice } = await onPaidPlan(`pay_more${digits}5`, 1);
        expect(invoice.providerAmountPaise).toBe(1);
        expect(
            await actions("saroh_invoice_amount_mismatch", ctx.organizationId),
        ).toHaveLength(1);
    });
});

describe("refunds and disputes from the provider's webhooks", () => {
    const refund = (over: Partial<ProviderRefundEvent>, type: string) =>
        send({
            type,
            refund: {
                providerRefundId: `rfnd_a${digits}`,
                providerPaymentId: "",
                amountPaise: 5_000,
                status: "PENDING",
                ...over,
            },
        });

    it("keeps a refund on its invoice, moves it on and never back, and asks about a credit note", async () => {
        const paid = `pay_ref${digits}6`;
        const { ctx, invoice } = await onPaidPlan(paid);
        const id = `rfnd_a${digits}`;
        await expect(
            refund({ providerPaymentId: paid }, "refund.created"),
        ).resolves.toMatchObject({ status: "ignored" });
        await refund(
            { providerPaymentId: paid, status: "PROCESSED" },
            "refund.processed",
        );
        // Delivered late: never moves it back.
        await refund({ providerPaymentId: paid }, "refund.created");

        expect(
            await prisma.billingRefund.findMany({
                where: { providerRefundId: id },
            }),
        ).toEqual([
            expect.objectContaining({
                organizationId: ctx.organizationId,
                invoiceId: invoice.id,
                status: "PROCESSED",
                source: "PROVIDER",
                kind: "REFUND",
                amountPaise: 5_000,
            }),
        ]);
        expect(
            await actions(
                "billing_credit_note_may_be_needed",
                ctx.organizationId,
            ),
        ).toHaveLength(1);
        // Applied: each delivery is processed.
        expect(
            await prisma.billingWebhookEvent.count({
                where: {
                    type: { startsWith: "refund." },
                    processedAt: null,
                },
            }),
        ).toBe(0);
    });

    it("raises a refund that failed", async () => {
        const paid = `pay_fail${digits}7`;
        const { ctx } = await onPaidPlan(paid);
        await refund(
            {
                providerPaymentId: paid,
                providerRefundId: `rfnd_f${digits}`,
                status: "FAILED",
            },
            "refund.failed",
        );
        expect(
            await actions("billing_refund_failed", ctx.organizationId),
        ).toHaveLength(1);
    });

    it("keeps a dispute and raises it while it is open", async () => {
        const paid = `pay_disp${digits}8`;
        const { ctx, invoice } = await onPaidPlan(paid);
        const dispute: ProviderDisputeEvent = {
            providerDisputeId: `disp_a${digits}`,
            providerPaymentId: paid,
            amountPaise: invoice.totalPaise,
            status: "OPEN",
            reason: "fraud",
        };
        await send({ type: "payment.dispute.created", dispute });
        expect(
            await prisma.billingRefund.findFirst({
                where: { providerRefundId: dispute.providerDisputeId },
            }),
        ).toMatchObject({
            kind: "DISPUTE",
            status: "OPEN",
            invoiceId: invoice.id,
            reason: "fraud",
        });
        expect(
            await actions("billing_dispute_open", ctx.organizationId),
        ).toHaveLength(1);
    });
});

describe("an event Saroh can't match (DEC-166)", () => {
    it("is raised with no business and left not applied", async () => {
        await send({
            type: "subscription.charged",
            providerSubscriptionId: `sub_nobody${digits}`,
            status: "ACTIVE",
            phase: "charged",
            providerPaymentId: `pay_nobody${digits}`,
        });
        const event = await prisma.billingWebhookEvent.findFirstOrThrow({
            where: { type: "subscription.charged", organizationId: null },
            orderBy: { receivedAt: "desc" },
        });
        expect(event.processedAt).toBeNull();
        expect(await actions("billing_webhook_unmatched", null)).toEqual([
            expect.objectContaining({
                refs: expect.objectContaining({
                    payment: `pay_nobody${digits}`,
                }),
            }),
        ]);
    });
});
