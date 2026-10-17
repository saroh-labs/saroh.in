/**
 * Never Free while the provider charges, never a paid plan nobody pays for
 * (owner, 17 Oct 2026), against a real Postgres through the fake billing
 * provider (no Razorpay call is ever made):
 *
 * - A payment on a checkout Saroh dropped: honoured when nothing conflicts,
 *   else its autopay is stopped and the double charge refunded
 *   automatically, once, with no invoice (DEC-164); a refund Razorpay
 *   refuses is left to the owner, one it can't answer is retried.
 * - A checkout approved after its start date: stale; with no payment named,
 *   the owner refunds it by hand.
 * - A checkout lapses at its start date and tells the provider when.
 * - A charge on a subscription Saroh ended (halted, then paid) or left (a
 *   move to Free while past due): the plan the business paid for.
 * - A refused provider cancel: asked where it stands, retried with a
 *   growing pause, an operator told.
 * - An upgrade's subscription, its charges still ahead, is ended at once.
 * - A scheduled change's first charge failing before the sweep: PAST_DUE.
 * - A suspended business may move down, never up.
 *
 * Every catalogue, price and seller detail is made up (`fakeCatalog`: Plan
 * A/B/C). Rows satisfy the migration's CHECKs, so it holds in RLS mode.
 * Integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { lifecycleAllows } from "../organizations/organization-lifecycle.policy";
import { BILLING_EMAIL_TYPE } from "./billing-email.job";
import { BILLING_NOTE_AUTHOR } from "./billing-ops-notice";
import { ONE_TIME_PAYMENT } from "./billing-term";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutService } from "./checkout.service";
import {
    BILLING_REFUND_TYPE,
    REFUND_AUDIT_ACTION,
    REFUNDED_AUDIT_ACTION,
} from "./double-charge";
import { DoubleChargeRefundHandler } from "./double-charge-refund.job";
import { PlansService } from "./plans.service";
import {
    BILLING_PROVIDER_CANCEL_TYPE,
    CANCEL_ALERT_AFTER,
    enqueueProviderCancel,
    ProviderCancelHandler,
} from "./provider-cancel.job";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import { BillingProviderError } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

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
let factory: FakeBillingProviderFactory;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    await prisma.job.deleteMany({});
    await prisma.adminAuditEvent.deleteMany({
        where: { actorUserId: BILLING_NOTE_AUTHOR },
    });
    await prisma.adminOrganizationNote.deleteMany({
        where: { authorUserId: BILLING_NOTE_AUTHOR },
    });
    await prisma.sarohInvoice.deleteMany({});
    await prisma.sarohInvoiceSequence.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await install();
});

async function install() {
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
}

async function row(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: 1,
                interval: "month",
            },
        },
    });
}

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Safety ${seq}`, slug: `safe-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

async function sub(organizationId: string) {
    return prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
    });
}

let evt = 0;
async function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    over: {
        currentPeriodEnd?: Date | null;
        now?: Date;
        paymentId?: string;
        amountPaise?: number;
    } = {},
) {
    evt += 1;
    const status = (
        {
            authenticated: "IGNORED",
            activated: "ACTIVE",
            charged: "ACTIVE",
            pending: "PAST_DUE",
            halted: "PAST_DUE",
            cancelled: "CANCELLED",
            completed: "CANCELLED",
            other: "IGNORED",
        } as const
    )[phase];
    const now = over.now ?? new Date();
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_${evt}_${tag}`,
            type: `subscription.${phase}`,
            providerSubscriptionId,
            status,
            phase,
            eventAt: now.toISOString(),
            ...(over.paymentId ? { providerPaymentId: over.paymentId } : {}),
            ...(over.amountPaise !== undefined
                ? { paymentAmountPaise: over.amountPaise }
                : {}),
            ...(over.currentPeriodEnd !== undefined
                ? {
                      currentPeriodEnd:
                          over.currentPeriodEnd?.toISOString() ?? null,
                  }
                : {}),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle(
        "razorpay",
        raw,
        { "x-fake-signature": signature },
        now,
    );
}

/** Start a checkout for `plan` monthly; its provider subscription's id. */
async function start(ctx: OrganizationContext, plan: string, now?: Date) {
    const r = await checkout.changePlan(ctx, { plan, cycle: "month" }, now);
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    return {
        id: r.checkout.id,
        kind: r.kind,
        ref: `fake_sub_${r.checkout.id}`,
    };
}

/** Free → `plan` monthly, paid, its period ending at `end`. */
async function onPaidPlan(
    ctx: OrganizationContext,
    plan = "b",
    end = new Date(Date.now() + 20 * DAY),
) {
    const c = await start(ctx, plan);
    await deliver(c.ref, "activated", { currentPeriodEnd: end });
    return { ...c, periodEnd: end };
}

async function cancelJobs(status?: string) {
    const jobs = await prisma.job.findMany({
        where: {
            type: BILLING_PROVIDER_CANCEL_TYPE,
            ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "asc" },
    });
    return jobs;
}

async function notes(organizationId: string) {
    return prisma.adminOrganizationNote.findMany({
        where: { organizationId, authorUserId: BILLING_NOTE_AUTHOR },
    });
}

describe("a payment on a checkout Saroh dropped (owner, 17 Oct 2026)", () => {
    it("is honoured when nothing conflicts: the plan it paid for, its cancel withdrawn", async () => {
        const ctx = await business();
        const first = await start(ctx, "b");
        // A second checkout replaces it; it is never paid.
        const second = await start(ctx, "c");
        expect(
            (await cancelJobs("PENDING")).map((j) => j.payload),
        ).toContainEqual(
            expect.objectContaining({ providerSubscriptionId: first.ref }),
        );

        // The first is approved anyway (a late UPI approval).
        const end = new Date(Date.now() + 30 * DAY);
        await expect(
            deliver(first.ref, "activated", { currentPeriodEnd: end }),
        ).resolves.toMatchObject({ status: "processed", changed: true });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "ACTIVE",
            providerSubscriptionId: first.ref,
            currentPeriodEnd: end,
        });
        // Its own cancel is withdrawn; the unpaid second one is dropped.
        const pending = (await cancelJobs("PENDING")).map((j) => j.payload);
        expect(pending).not.toContainEqual(
            expect.objectContaining({ providerSubscriptionId: first.ref }),
        );
        expect(pending).toContainEqual(
            expect.objectContaining({ providerSubscriptionId: second.ref }),
        );
        expect(
            await prisma.sarohInvoice.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
        expect(await notes(ctx.organizationId)).toHaveLength(0);
    });

    /** A business on C whose dropped checkout for B is paid anyway. */
    async function chargedTwice() {
        const ctx = await business();
        const first = await start(ctx, "b");
        const second = await start(ctx, "c");
        await deliver(second.ref, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        await deliver(first.ref, "charged", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            paymentId: `pay_twice_${seq}`,
            amountPaise: 118_000,
        });
        return { ctx, first, second, paymentId: `pay_twice_${seq}` };
    }

    async function refundJobs() {
        return prisma.job.findMany({
            where: { type: BILLING_REFUND_TYPE },
            orderBy: { createdAt: "asc" },
        });
    }

    async function refundedEmails() {
        return (
            await prisma.job.findMany({ where: { type: BILLING_EMAIL_TYPE } })
        ).filter(
            (j) =>
                (j.payload as { kind?: string }).kind ===
                "DOUBLE_CHARGE_REFUNDED",
        );
    }

    it("a double charge is refunded automatically, once, with no invoice, its autopay stopped, the business emailed and the owner told (DEC-164)", async () => {
        const { ctx, first, second, paymentId } = await chargedTwice();
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            providerSubscriptionId: second.ref,
        });
        expect(
            await prisma.sarohInvoice.count({
                where: { providerPaymentId: paymentId },
            }),
        ).toBe(0);
        expect(
            (await cancelJobs("PENDING")).map((j) => j.payload),
        ).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: first.ref,
            atCycleEnd: false,
        });
        // Nothing for the owner to do yet: the refund is queued.
        expect(await notes(ctx.organizationId)).toHaveLength(0);

        // The same payment told again (another event): nothing more queued.
        await deliver(first.ref, "charged", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            paymentId,
            amountPaise: 118_000,
        });
        const jobs = await refundJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toMatchObject({
            providerPaymentId: paymentId,
            amountPaise: 118_000,
        });

        const refunder = new DoubleChargeRefundHandler(factory);
        await refunder.handle(jobs[0]!);
        await refunder.handle(jobs[0]!);
        expect(fake.refunds.refunded).toEqual([
            {
                providerPaymentId: paymentId,
                reference: `refund:${paymentId}`,
                // Whose and why, on the refund's notes at the provider.
                organizationId: ctx.organizationId,
                providerSubscriptionId: first.ref,
                reason: "double_charge",
            },
        ]);
        expect(fake.refunds.asked).toEqual([paymentId]);
        const emails = await refundedEmails();
        expect(emails).toHaveLength(1);
        expect(emails[0]!.payload).toMatchObject({
            organizationId: ctx.organizationId,
            providerPaymentId: paymentId,
            amountPaise: 118_000,
        });
        expect(
            await prisma.adminAuditEvent.findMany({
                where: { targetId: paymentId },
                select: { action: true, outcome: true },
                orderBy: { createdAt: "asc" },
            }),
        ).toEqual([
            { action: REFUND_AUDIT_ACTION, outcome: "SUCCESS" },
            { action: REFUNDED_AUDIT_ACTION, outcome: "SUCCESS" },
        ]);
        const told = await notes(ctx.organizationId);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain(
            `Refunded payment ${paymentId} (₹1,180) in Razorpay automatically, refund fake_rfnd_${paymentId}`,
        );
        expect(told[0]!.body).toContain("Nothing to do.");
    });

    it("an activation naming no payment stops the autopay but leaves the refund to the charge that names it: never a 'refund by hand' note as well", async () => {
        const ctx = await business();
        const first = await start(ctx, "b");
        const second = await start(ctx, "c");
        await deliver(second.ref, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        // Razorpay's `subscription.activated` carries no payment.
        await expect(
            deliver(first.ref, "activated", {
                currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            }),
        ).resolves.toMatchObject({ status: "processed", changed: true });
        expect(await notes(ctx.organizationId)).toHaveLength(0);
        expect(await refundJobs()).toHaveLength(0);
        expect(
            (await cancelJobs("PENDING")).map((j) => j.payload),
        ).toContainEqual(
            expect.objectContaining({ providerSubscriptionId: first.ref }),
        );
        // The charge that follows names it: refunded automatically, once.
        const paymentId = `pay_after_activation_${seq}`;
        await deliver(first.ref, "charged", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            paymentId,
            amountPaise: 118_000,
        });
        expect((await refundJobs()).map((j) => j.payload)).toEqual([
            expect.objectContaining({ providerPaymentId: paymentId }),
        ]);
        expect(
            (await notes(ctx.organizationId)).filter((n) =>
                n.body.includes("by hand"),
            ),
        ).toHaveLength(0);
    });

    it("a refund Razorpay refuses is never retried: the owner is told to refund it by hand, in Razorpay's words", async () => {
        const { ctx, paymentId } = await chargedTwice();
        const [job] = await refundJobs();
        fake.refunds.failNext("REFUSED");
        // Settled: the queue doesn't retry it.
        await new DoubleChargeRefundHandler(factory).handle(job!);
        expect(fake.refunds.asked).toEqual([paymentId]);
        expect(fake.refunds.refunded).toHaveLength(0);
        expect(await refundedEmails()).toHaveLength(0);
        const told = await notes(ctx.organizationId);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain(
            `Refund payment ${paymentId} (₹1,180) in Razorpay by hand: the automatic refund was refused (invalid request sent).`,
        );
    });

    it("a refund Razorpay can't answer is retried, and refunded once it answers", async () => {
        const { ctx, paymentId } = await chargedTwice();
        const [job] = await refundJobs();
        const refunder = new DoubleChargeRefundHandler(factory);
        fake.refunds.failNext("UNKNOWN");
        await expect(refunder.handle(job!)).rejects.toThrow("network error");
        expect(fake.refunds.refunded).toHaveLength(0);
        expect(await refundedEmails()).toHaveLength(0);
        expect(await notes(ctx.organizationId)).toHaveLength(0);

        await refunder.handle({ ...job!, attempts: 1 });
        expect(fake.refunds.refunded.map((r) => r.providerPaymentId)).toEqual([
            paymentId,
        ]);
        expect(await refundedEmails()).toHaveLength(1);
    });

    it("a refund still unanswered on its last try tells the owner to refund it by hand", async () => {
        const { ctx, paymentId } = await chargedTwice();
        const [job] = await refundJobs();
        expect(job!.maxAttempts).toBe(20);
        fake.refunds.failNext("UNKNOWN");
        await expect(
            new DoubleChargeRefundHandler(factory).handle({
                ...job!,
                attempts: job!.maxAttempts - 1,
            }),
        ).rejects.toThrow();
        const told = await notes(ctx.organizationId);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain(
            `Refund payment ${paymentId} (₹1,180) in Razorpay by hand: the automatic refund didn't go through after 20 tries`,
        );
    });

    it("an upgrade approved after the date it starts is stale: nothing moves; with no payment named, the note asks the owner to find it in the dashboard", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const up = await start(ctx, "c");
        expect(up.kind).toBe("UPGRADE");

        await deliver(up.ref, "authenticated", {
            now: new Date(periodEnd.getTime() + HOUR),
        });
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.b");
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: up.id },
            }),
        ).toMatchObject({ status: "CANCELLED", endedReason: "expired" });
        const told = await notes(ctx.organizationId);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain("Find it in the Razorpay dashboard");
    });

    it("lapses at its start date, and tells the provider until when it may be approved", async () => {
        const ctx = await business();
        const soon = new Date(Date.now() + 2 * HOUR);
        await onPaidPlan(ctx, "b", soon);
        const up = await start(ctx, "c");
        expect(up.kind).toBe("UPGRADE");
        const row = await prisma.billingCheckout.findUniqueOrThrow({
            where: { id: up.id },
        });
        expect(row.expiresAt).toEqual(soon);
        expect(fake.createCalls.at(-1)?.expireBy).toEqual(soon);
        // A new plan keeps its day.
        const other = await business();
        const fresh = await start(other, "b");
        const made = await prisma.billingCheckout.findUniqueOrThrow({
            where: { id: fresh.id },
        });
        expect(
            made.expiresAt.getTime() - made.createdAt.getTime(),
        ).toBeGreaterThan(23 * HOUR);
        expect(fake.createCalls.at(-1)?.expireBy).toEqual(made.expiresAt);
    });
});

describe("the business's return after the webhook (17 Oct 2026)", () => {
    it("a charge the confirm reports for a checkout the webhook already completed changes nothing: the plan just bought stays", async () => {
        const ctx = await business();
        const end = new Date(Date.now() + 30 * DAY);
        const c = await start(ctx, "b");
        await deliver(c.ref, "charged", {
            currentPeriodEnd: end,
            paymentId: `pay_race_${tag}`,
        });
        const before = await sub(ctx.organizationId);
        expect(before.providerSubscriptionId).toBe(c.ref);
        // The business's return asks the provider and reconciles the same
        // charge, after the webhook completed the checkout.
        const r = await webhooks.reconcileCheckout(c.id, {
            type: "subscription.charged",
            providerEventId: `confirm:${c.id}`,
            providerSubscriptionId: c.ref,
            status: "ACTIVE",
            phase: "charged",
            eventAt: new Date(),
            currentPeriodEnd: end,
            providerPaymentId: `pay_race_${tag}`,
        });
        expect(r).toMatchObject({ changed: false });
        const after = await sub(ctx.organizationId);
        expect(after).toMatchObject({
            status: before.status,
            planId: before.planId,
            providerSubscriptionId: c.ref,
            cancelAtPeriodEnd: false,
            pendingPlanId: null,
        });
        expect(
            (await cancelJobs()).filter(
                (j) =>
                    (j.payload as { providerSubscriptionId?: string })
                        .providerSubscriptionId === c.ref,
            ),
        ).toHaveLength(0);
    });
});

describe("a charge on a subscription Saroh ended or left", () => {
    it("halted, then paid through Razorpay's link: the plan is back, invoiced, its cancel withdrawn", async () => {
        const ctx = await business();
        const { ref } = await onPaidPlan(ctx, "b");
        await deliver(ref, "halted");
        expect((await sub(ctx.organizationId)).status).toBe("CANCELLED");
        expect(await cancelJobs("PENDING")).toHaveLength(1);

        // A month after the period paid (+20 days).
        const next = new Date(Date.now() + 50 * DAY);
        await expect(
            deliver(ref, "charged", {
                currentPeriodEnd: next,
                paymentId: "pay_recovered",
            }),
        ).resolves.toMatchObject({ status: "processed", changed: true });
        expect(await sub(ctx.organizationId)).toMatchObject({
            status: "ACTIVE",
            plan: { key: "catalog.b" },
            currentPeriodEnd: next,
        });
        expect(await cancelJobs("PENDING")).toHaveLength(0);
        expect(
            await prisma.sarohInvoice.findFirst({
                where: { providerPaymentId: "pay_recovered" },
            }),
        ).toMatchObject({ source: "RENEWAL" });
    });

    it("halted, a new plan started, then the old one paid through Razorpay's link: the new one paid later is a double charge, refunded, never a second plan", async () => {
        const ctx = await business();
        const { ref } = await onPaidPlan(ctx, "b");
        await deliver(ref, "halted");
        const fresh = await start(ctx, "c");
        expect(fresh.kind).toBe("NEW");
        // The old one is paid: the plan is back, the new checkout dropped.
        const next = new Date(Date.now() + 50 * DAY);
        await deliver(ref, "charged", {
            currentPeriodEnd: next,
            paymentId: "pay_link",
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: fresh.id },
            }),
        ).toMatchObject({
            status: "CANCELLED",
            endedReason: "plan-reinstated",
        });

        // The dropped checkout is paid anyway (a second tab).
        await deliver(fresh.ref, "charged", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            paymentId: "pay_second_plan",
            amountPaise: 118_000,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            providerSubscriptionId: ref,
            status: "ACTIVE",
        });
        expect(
            (
                await prisma.job.findMany({
                    where: { type: BILLING_REFUND_TYPE },
                })
            ).map((j) => j.payload),
        ).toEqual([
            expect.objectContaining({ providerPaymentId: "pay_second_plan" }),
        ]);
        expect(
            (await cancelJobs("PENDING")).map((j) => j.payload),
        ).toContainEqual(
            expect.objectContaining({ providerSubscriptionId: fresh.ref }),
        );
        expect(
            await prisma.sarohInvoice.count({
                where: { providerPaymentId: "pay_second_plan" },
            }),
        ).toBe(0);
    });

    it("moved to Free while past due, then Razorpay's retry went through: the period paid, then Free", async () => {
        const ctx = await business();
        const { ref } = await onPaidPlan(ctx, "b");
        await deliver(ref, "pending");
        // The charge was due at the period's end, now past.
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: new Date(Date.now() - DAY) },
        });
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        const free = await row("free");
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            providerSubscriptionId: null,
        });

        // A month after the period paid (+20 days).
        const next = new Date(Date.now() + 50 * DAY);
        await deliver(ref, "charged", {
            currentPeriodEnd: next,
            paymentId: "pay_retry",
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "ACTIVE",
            providerSubscriptionId: ref,
            currentPeriodEnd: next,
            pendingPlanId: free.id,
            pendingFrom: next,
            cancelAtPeriodEnd: true,
        });
        expect(
            await prisma.sarohInvoice.findFirst({
                where: { providerPaymentId: "pay_retry" },
            }),
        ).not.toBeNull();
        expect(
            (await cancelJobs("PENDING")).map((j) => j.payload),
        ).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: ref,
            atCycleEnd: false,
        });
    });
});

describe("a refused provider cancel (17 Oct 2026)", () => {
    const handler = () => new ProviderCancelHandler(factory);

    async function queued(atCycleEnd: boolean, tries?: number): Promise<Job> {
        const ctx = await business();
        await prisma.$transaction((tx) =>
            enqueueProviderCancel(tx, {
                organizationId: ctx.organizationId,
                provider: "RAZORPAY",
                providerSubscriptionId: `sub_refused_${seq}`,
                atCycleEnd,
                tries,
            }),
        );
        return prisma.job.findFirstOrThrow({
            where: { type: BILLING_PROVIDER_CANCEL_TYPE },
            orderBy: { createdAt: "desc" },
        });
    }
    const refused = () =>
        new BillingProviderError("REFUSED", "cancel refused (HTTP 400)");

    it("already ended at the provider: done, nothing asked again", async () => {
        const job = await queued(false);
        fake.failCancels.push(refused());
        fake.statuses.standings.set(`sub_refused_${seq}`, "ended");
        await handler().handle(job);
        expect(await cancelJobs()).toHaveLength(1);
    });

    it("still waiting to be authorised: asked again later, with its count", async () => {
        const job = await queued(false);
        fake.failCancels.push(refused());
        fake.statuses.standings.set(`sub_refused_${seq}`, "created");
        await handler().handle(job);
        const again = await cancelJobs("PENDING");
        expect(again).toHaveLength(2);
        const next = again.find((j) => j.id !== job.id)!;
        expect(next.payload).toMatchObject({ tries: 1, atCycleEnd: false });
        expect(next.runAt.getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
    });

    it("authorised with no cycle running, told to end with its cycle: cancelled now instead", async () => {
        const job = await queued(true);
        fake.failCancels.push(refused());
        fake.statuses.standings.set(`sub_refused_${seq}`, "authorised");
        await handler().handle(job);
        expect(fake.cancelOptions.at(-1)).toEqual({ atCycleEnd: false });
        expect(await cancelJobs()).toHaveLength(1);
    });

    it("never authorised, told to end with its cycle: cancelled now instead", async () => {
        const job = await queued(true);
        fake.failCancels.push(refused());
        fake.statuses.standings.set(`sub_refused_${seq}`, "created");
        await handler().handle(job);
        expect(fake.cancelOptions.at(-1)).toEqual({ atCycleEnd: false });
        expect(await cancelJobs()).toHaveLength(1);
    });

    it("a provider that can't answer: the queue's quick retries, then the long chain, never dropped", async () => {
        const job = await queued(false);
        const unanswered = () =>
            new BillingProviderError(
                "UNKNOWN",
                "Razorpay subscription cancellation failed (HTTP 503)",
            );
        fake.failCancels.push(unanswered());
        // Quick retries left: the queue asks again in a moment.
        await expect(handler().handle(job)).rejects.toThrow("HTTP 503");
        // The queue's last try: handed to the long chain, not FAILED.
        fake.failCancels.push(unanswered());
        await expect(
            handler().handle({ ...job, attempts: job.maxAttempts - 1 }),
        ).resolves.toBeUndefined();
        const next = (await cancelJobs("PENDING")).find((j) => j.id !== job.id);
        expect(next?.payload).toMatchObject({
            providerSubscriptionId: `sub_refused_${seq}`,
            tries: 1,
            atCycleEnd: false,
        });
        expect(next!.runAt.getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
    });

    it("a cancel still in flight for a subscription the business is billed through again is withdrawn, never sent", async () => {
        const ctx = await business();
        const paid = await onPaidPlan(ctx, "b");
        // Asked for while it was ending; a payment honoured it since, and
        // the webhook withdrew only the waiting ones.
        await prisma.$transaction((tx) =>
            enqueueProviderCancel(tx, {
                organizationId: ctx.organizationId,
                provider: "RAZORPAY",
                providerSubscriptionId: paid.ref,
                atCycleEnd: false,
                tries: 2,
            }),
        );
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: BILLING_PROVIDER_CANCEL_TYPE,
                payload: { path: ["providerSubscriptionId"], equals: paid.ref },
            },
        });
        const before = fake.cancelCalls.length;
        await handler().handle(job);
        expect(fake.cancelCalls.length).toBe(before);
        expect(
            (await cancelJobs("PENDING")).filter((j) => j.id !== job.id),
        ).toHaveLength(0);
        // A closing business is never kept billing: that one is sent.
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { lifecycleStatus: "DELETED_RETAINED" },
        });
        await handler().handle(job);
        expect(fake.cancelCalls.at(-1)).toBe(paid.ref);
    });

    it("refused long enough: an operator is told, and it is still asked again", async () => {
        const job = await queued(false, CANCEL_ALERT_AFTER - 1);
        fake.failCancels.push(refused());
        fake.statuses.standings.set(`sub_refused_${seq}`, "failing");
        await handler().handle(job);
        const told = await notes(job.organizationId!);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain("keeps refusing");
        expect(await cancelJobs("PENDING")).toHaveLength(2);
    });
});

describe("ending what the business leaves (DEC-159)", () => {
    it("an upgrade's subscription whose charges are still ahead is ended at once on a move to Free", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const up = await start(ctx, "c");
        await deliver(up.ref, "authenticated");
        expect((await sub(ctx.organizationId)).providerSubscriptionId).toBe(
            up.ref,
        );
        await prisma.job.deleteMany({});

        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            pendingFrom: periodEnd,
            cancelAtPeriodEnd: true,
        });
        expect((await cancelJobs()).map((j) => j.payload)).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: up.ref,
                atCycleEnd: false,
            },
        ]);
    });

    it("a monthly plan whose next year is already paid is never moved to Free: refused, the paid year kept", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        // Monthly B now, a year of C paid by order and waiting to start.
        const year = await prisma.billingCheckout.create({
            data: {
                organizationId: ctx.organizationId,
                planId: (await row("c")).id,
                cycle: "year",
                kind: "SCHEDULED",
                status: "SCHEDULED",
                provider: "RAZORPAY",
                providerSubscriptionId: `order_paid_year_${tag}`,
                providerPlanId: ONE_TIME_PAYMENT,
                pricePaise: 118_000,
                chargeNowPaise: 0,
                startAt: periodEnd,
                expiresAt: periodEnd,
            },
        });
        await prisma.job.deleteMany({});

        await expect(
            checkout.changePlan(ctx, { plan: "free", cycle: "month" }),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { reason: "paid-year-scheduled" } },
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: year.id },
            }),
        ).toMatchObject({ status: "SCHEDULED", endedReason: null });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            cancelAtPeriodEnd: false,
            pendingPlanId: null,
        });
        expect(await cancelJobs()).toHaveLength(0);
    });

    it("a scheduled change's first charge failing before the sweep applies it: PAST_DUE on the new plan, and told", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "c");
        const down = await start(ctx, "b");
        expect(down.kind).toBe("SCHEDULED");
        await deliver(down.ref, "authenticated");

        await expect(
            deliver(down.ref, "pending", {
                now: new Date(periodEnd.getTime() + 1000),
            }),
        ).resolves.toMatchObject({ status: "processed", changed: true });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            providerSubscriptionId: down.ref,
            status: "PAST_DUE",
        });
        const emails = await prisma.job.findMany({
            where: { type: BILLING_EMAIL_TYPE },
        });
        expect(emails.map((j) => j.payload)).toContainEqual(
            expect.objectContaining({ kind: "PAYMENT_FAILED", final: false }),
        );
    });
});

describe("a suspended business, still billed, can always pay less (17 Oct 2026)", () => {
    it("its plan routes are open to it as lower-charges", () => {
        // Read from the source, as plan-owner-only.spec.ts reads routes:
        // importing the controller would load the auth guard's ESM.
        const source = readFileSync(
            join(__dirname, "billing.controller.ts"),
            "utf8",
        );
        for (const route of [
            '@Post("change-plan")',
            '@Put("addons/:addonId")',
        ]) {
            const at = source.indexOf(route);
            expect(at).toBeGreaterThan(-1);
            const head = source.slice(
                at,
                source.indexOf("(\n", at + route.length),
            );
            expect([
                route,
                head.includes('@LifecycleWrite("lower-charges")'),
            ]).toEqual([route, true]);
        }
        expect(lifecycleAllows("SUSPENDED", "lower-charges")).toBe(true);
        expect(lifecycleAllows("SUSPENDED", "new")).toBe(false);
    });

    it("moves to Free, and is refused a dearer plan", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { lifecycleStatus: "SUSPENDED" },
        });
        await expect(
            checkout.changePlan(ctx, { plan: "c", cycle: "month" }),
        ).rejects.toMatchObject({
            status: 403,
            response: { error: "ORGANIZATION_NOT_ACTIVE" },
        });
        await expect(
            checkout.changePlan(ctx, { plan: "free", cycle: "month" }),
        ).resolves.toMatchObject({
            kind: "TO_FREE",
            effectiveAt: periodEnd.toISOString(),
        });
    });
});
