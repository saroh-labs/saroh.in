/**
 * Commission against a real Postgres (DEC-169, admin console U21).
 *
 * First, payments stay correct: the billing webhook records every charge
 * exactly as it would with no commission at all when the commission job
 * fails on every try, when queueing it after the commit fails, and when
 * the commission tables are gone; the job retries, then raises a Needs
 * action, and the hourly sweep writes what was missed.
 *
 * Then the lines: one per cleared payment, for the manager the business
 * had when it cleared, at the rate in force for the link's kind, copied
 * onto the line; pending until its period ends clean, then payable in that
 * month; held on a mismatch, NO_RATE without a rate; cancelled by a refund
 * or a lost dispute before payout, raised after it.
 *
 * Every rate is drawn at random for the run (`randomRate`) and every amount
 * is asserted against it; the catalogue's prices are `fakeCatalog`'s made-up
 * ones. Rows satisfy the migrations' CHECKs, so it holds with TEST_RLS=on.
 * Integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import {
    endLink,
    linkTo,
    manager,
    randomRate,
    runJobs,
    setRate,
    twoRates,
    waitingJobs,
    wipeCommission,
} from "../../../test/fixtures/commission";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { isRlsTestMode } from "../../../test/rls-mode";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminCommissionService } from "../admin/admin-commission.service";
import { AdminPermission, AdminRole } from "../admin/admin-permissions";
import { BILLING_EMAIL_TYPE } from "../billing/billing-email.job";
import { recordRefundInTx } from "../billing/billing-refunds";
import { BillingWebhookService } from "../billing/billing-webhook.service";
import { CheckoutService } from "../billing/checkout.service";
import { keepProviderAmountInTx } from "../billing/invoice-amount";
import { PlansService } from "../billing/plans.service";
import type { BillingEventPhase } from "../billing/providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "../billing/providers/fake.provider";
import { SarohInvoicesService } from "../billing/saroh-invoices.service";
import type { SarohSeller } from "../billing/saroh-seller";
import { CommissionLineHandler } from "./commission-line.job";
import {
    COMMISSION_LINE_TYPE,
    COMMISSION_REFUND_TYPE,
    CommissionQueue,
} from "./commission-queue";
import { commissionPaise, monthOf, splitEvenly } from "./commission-rules";
import { CommissionSweepJob } from "./commission-sweep.job";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const FIRST = 700;
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

const quiet = { warn: () => undefined, error: () => undefined };

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let queue: CommissionQueue;
let lines: CommissionLineHandler;
let sweep: CommissionSweepJob;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    queue = new CommissionQueue();
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
        undefined,
        queue,
    );
    lines = new CommissionLineHandler();
    sweep = new CommissionSweepJob(lines);
    await wipe();
    await install();
});

afterEach(() => {
    jest.restoreAllMocks();
});

async function wipe() {
    await prisma.job.deleteMany({});
    await wipeCommission();
    await prisma.subscriptionAddonCharge.deleteMany({});
    await prisma.subscriptionAddon.deleteMany({});
    await prisma.pricingCouponRedemption.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.sarohInvoiceSequence.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.pricingCoupon.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
}

async function install(catalog: Catalog = fakeCatalog()) {
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

/** Start again on another catalogue (a first month, a free trial). */
async function reinstall(catalog: Catalog) {
    await wipe();
    await install(catalog);
}

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Commission ${seq}`, slug: `comm-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

let evt = 0;
async function send(body: Record<string, unknown>) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_${evt}_${tag}`,
            eventAt: new Date(Date.now() + evt).toISOString(),
            ...body,
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, { "x-fake-signature": signature });
}

const STATUS = {
    authenticated: "IGNORED",
    activated: "ACTIVE",
    charged: "ACTIVE",
    pending: "PAST_DUE",
    halted: "PAST_DUE",
    cancelled: "CANCELLED",
    completed: "CANCELLED",
    other: "IGNORED",
} as const;

function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    over: { currentPeriodEnd?: Date; paymentId?: string } = {},
) {
    return send({
        type: `subscription.${phase}`,
        providerSubscriptionId,
        status: STATUS[phase],
        phase,
        ...(over.paymentId ? { providerPaymentId: over.paymentId } : {}),
        ...(over.currentPeriodEnd
            ? { currentPeriodEnd: over.currentPeriodEnd.toISOString() }
            : {}),
    });
}

function refund(
    providerPaymentId: string,
    providerRefundId: string,
    status: "PENDING" | "PROCESSED" | "FAILED",
) {
    return send({
        type: `refund.${status.toLowerCase()}`,
        status: "IGNORED",
        refund: {
            providerRefundId,
            providerPaymentId,
            amountPaise: null,
            status,
        },
    });
}

function dispute(
    providerPaymentId: string,
    providerDisputeId: string,
    status: string,
) {
    return send({
        type: `payment.dispute.${status.toLowerCase()}`,
        status: "IGNORED",
        dispute: {
            providerDisputeId,
            providerPaymentId,
            amountPaise: null,
            status,
            reason: null,
        },
    });
}

/** Free → `plan` monthly, its first charge paid, its period ending `end`. */
async function onPlan(
    ctx: OrganizationContext,
    end: Date = new Date(Date.now() + 30 * DAY),
    plan = "c",
) {
    const r = await checkout.changePlan(ctx, { plan, cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const providerSub = `fake_sub_${r.checkout.id}`;
    const result = await deliver(providerSub, "activated", {
        currentPeriodEnd: end,
    });
    return { providerSub, periodEnd: end, result, checkoutId: r.checkout.id };
}

/** The next month's charge on `providerSub`, paid with `paymentId`. */
async function renew(providerSub: string, after: Date, paymentId: string) {
    const end = new Date(after.getTime() + 30 * DAY);
    const result = await deliver(providerSub, "charged", {
        currentPeriodEnd: end,
        paymentId,
    });
    return { periodEnd: end, result };
}

function invoicesOf(organizationId: string) {
    return prisma.sarohInvoice.findMany({
        where: { organizationId },
        include: { lines: { orderBy: { position: "asc" } } },
        orderBy: { issuedAt: "asc" },
    });
}

async function renewalOf(organizationId: string) {
    const rows = await invoicesOf(organizationId);
    const renewal = rows.find((r) => r.source === "RENEWAL");
    if (!renewal) throw new Error("no renewal invoice");
    return renewal;
}

function linesOf(sarohInvoiceId: string) {
    return prisma.commissionLine.findMany({
        where: { sarohInvoiceId },
        orderBy: { installment: "asc" },
    });
}

const handlers = () => ({
    [COMMISSION_LINE_TYPE]: lines.handleLine,
    [COMMISSION_REFUND_TYPE]: lines.handleRefund,
});

const runCommission = () => runJobs(handlers());

/**
 * What a business's payments recorded, without what differs between two
 * businesses by nature (ids, numbers' counts, names, times of issue).
 */
async function paymentSnapshot(organizationId: string) {
    const invoices = await invoicesOf(organizationId);
    const sub = await prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
    });
    const emails = (
        await prisma.job.findMany({ where: { type: BILLING_EMAIL_TYPE } })
    ).filter(
        (j) =>
            (j.payload as { organizationId?: string }).organizationId ===
            organizationId,
    );
    return {
        invoices: invoices.map((i) => ({
            numbered: /^TST\/\d{2}-\d{2}\/\d{4}$/.test(i.number),
            source: i.source,
            cycle: i.cycle,
            planName: i.planName,
            periodStart: i.periodStart?.toISOString(),
            periodEnd: i.periodEnd?.toISOString(),
            paid: Boolean(i.providerPaymentId),
            taxType: i.taxType,
            placeOfSupply: i.placeOfSupply,
            amounts: [
                i.subtotalPaise,
                i.discountPaise,
                i.taxablePaise,
                i.cgstPaise,
                i.sgstPaise,
                i.igstPaise,
                i.taxPaise,
                i.totalPaise,
            ],
            lines: i.lines.map((l) => ({
                position: l.position,
                description: l.description,
                sac: l.sac,
                amounts: [
                    l.quantity,
                    l.unitPaise,
                    l.discountPaise,
                    l.taxablePaise,
                    l.gstRateBps,
                    l.cgstPaise,
                    l.sgstPaise,
                    l.igstPaise,
                    l.taxPaise,
                    l.amountPaise,
                ],
            })),
            emailed: emails.filter(
                (j) => (j.payload as { invoiceId?: string }).invoiceId === i.id,
            ).length,
        })),
        subscription: {
            status: sub.status,
            plan: sub.plan.key,
            interval: sub.plan.interval,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            provider: sub.provider,
        },
    };
}

/** A renewal for one business and for a control with no manager, identically. */
async function twoBusinesses() {
    const managed = await business();
    const control = await business();
    return { managed, control };
}

async function payBoth(
    managed: OrganizationContext,
    control: OrganizationContext,
) {
    const end = new Date(Date.now() + 20 * DAY);
    for (const ctx of [managed, control]) {
        const { providerSub, result } = await onPlan(ctx, end);
        expect(result.status).toBe("processed");
        const r = await renew(providerSub, end, `pay_${ctx.organizationId}`);
        expect(r.result.status).toBe("processed");
    }
}

/** A Billing teammate who marks payouts, nobody's manager. */
function billingStaff(userId = "billing-user"): PlatformAdminInfo {
    return {
        userId,
        platformAdminId: "pa_billing_spec",
        roles: [AdminRole.Billing],
        permissions: [AdminPermission.TeamPay],
        viaBootstrap: false,
    };
}

describe("payments stay correct", () => {
    it("the commission job throws on every try: every payment is recorded as without commission; the job retries, then raises a Needs action", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const { managed, control } = await twoBusinesses();
        await linkTo(managed.organizationId, m.platformAdminId);
        const down = jest
            .spyOn(lines, "settle")
            .mockRejectedValue(new Error("commission down"));

        await payBoth(managed, control);
        expect(await paymentSnapshot(managed.organizationId)).toEqual(
            await paymentSnapshot(control.organizationId),
        );
        const snapshot = await paymentSnapshot(managed.organizationId);
        expect(snapshot.invoices).toHaveLength(2);
        expect(
            snapshot.invoices.every((i) => i.numbered && i.emailed === 1),
        ).toBe(true);
        expect(snapshot.subscription).toMatchObject({
            status: "ACTIVE",
            plan: "catalog.c",
        });

        // One line job per invoice, for the managed business only.
        const jobs = await waitingJobs([COMMISSION_LINE_TYPE]);
        expect(jobs).toHaveLength(2);
        expect(
            jobs.every((j) => j.organizationId === managed.organizationId),
        ).toBe(true);

        for (const job of jobs) {
            for (let attempts = 0; attempts < job.maxAttempts - 1; attempts++) {
                await expect(
                    lines.handleLine({ ...job, attempts } as Job),
                ).rejects.toThrow("commission down");
            }
            // The last try raises a Needs action and ends the job.
            await expect(
                lines.handleLine({
                    ...job,
                    attempts: job.maxAttempts - 1,
                } as Job),
            ).resolves.toBeUndefined();
            await lines.handleLine({
                ...job,
                attempts: job.maxAttempts - 1,
            } as Job);
        }
        const actions = await prisma.billingAction.findMany({
            where: { code: "commission_line_failed" },
        });
        expect(actions).toHaveLength(2);
        expect(
            actions.every((a) => a.organizationId === managed.organizationId),
        ).toBe(true);
        expect(await prisma.commissionLine.count()).toBe(0);
        // Still exactly what it was.
        expect(await paymentSnapshot(managed.organizationId)).toEqual(snapshot);

        // Back up: the sweep writes the lines the job gave up on.
        down.mockRestore();
        const swept = await sweep.sweep(new Date());
        expect(swept.written).toBe(2);
        expect(await prisma.commissionLine.count()).toBe(2);
        expect(await paymentSnapshot(managed.organizationId)).toEqual(snapshot);
    });

    it("the enqueue after commit throws: the webhook still answers, the invoice is saved, and the next sweep writes the line", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const { managed, control } = await twoBusinesses();
        await linkTo(managed.organizationId, m.platformAdminId);

        // The whole after-commit step throws (the webhook's own net)...
        const outer = jest
            .spyOn(queue, "afterBillingEvent")
            .mockRejectedValue(new Error("queue down"));
        const end = new Date(Date.now() + 20 * DAY);
        const a = await onPlan(managed, end);
        const b = await onPlan(control, end);
        expect(a.result).toEqual({ status: "processed", changed: true });
        outer.mockRestore();

        // ...or the job insert inside it does (the queue's own).
        jest.spyOn(queue, "queueLine").mockRejectedValue(
            new Error("queue down"),
        );
        const r = await renew(a.providerSub, end, "pay_managed");
        expect(r.result).toEqual({ status: "processed", changed: true });
        await renew(b.providerSub, end, "pay_control");
        jest.restoreAllMocks();

        expect(await invoicesOf(managed.organizationId)).toHaveLength(2);
        expect(await paymentSnapshot(managed.organizationId)).toEqual(
            await paymentSnapshot(control.organizationId),
        );
        expect(await waitingJobs([COMMISSION_LINE_TYPE])).toHaveLength(0);

        const swept = await sweep.sweep(new Date());
        expect(swept).toMatchObject({ written: 2, failed: 0 });
        const renewal = await renewalOf(managed.organizationId);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({ status: "PENDING" }),
        ]);
        // A second sweep writes nothing more.
        expect((await sweep.sweep(new Date())).written).toBe(0);
    });

    it("the commission tables missing or unreachable: payments are recorded unchanged", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const { managed, control } = await twoBusinesses();
        await linkTo(managed.organizationId, m.platformAdminId);

        // The suite's role in RLS mode may not change tables, so there the
        // tables are "unreachable" as the job sees them: every settle fails
        // the way a missing relation does.
        const rename = !isRlsTestMode();
        if (rename) {
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "CommissionLine" RENAME TO "CommissionLine_gone"`,
            );
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "CommissionRate" RENAME TO "CommissionRate_gone"`,
            );
        } else {
            jest.spyOn(lines, "settle").mockRejectedValue(
                Object.assign(
                    new Error('relation "CommissionLine" does not exist'),
                    {
                        code: "P2021",
                    },
                ),
            );
        }
        try {
            await payBoth(managed, control);
            // The jobs fail and are retried; nothing else notices.
            for (const job of await waitingJobs([COMMISSION_LINE_TYPE])) {
                await expect(lines.handleLine(job)).rejects.toBeDefined();
            }
            await refund(
                `pay_${managed.organizationId}`,
                `rfnd_gone_${tag}`,
                "FAILED",
            );
        } finally {
            if (rename) {
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "CommissionLine_gone" RENAME TO "CommissionLine"`,
                );
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "CommissionRate_gone" RENAME TO "CommissionRate"`,
                );
            }
        }
        expect(await paymentSnapshot(managed.organizationId)).toEqual(
            await paymentSnapshot(control.organizationId),
        );
        expect(await prisma.billingRefund.count()).toBe(1);
    });

    it("with no organization context, the webhook path queues the job with the business's id and the job writes the line", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await renew(providerSub, periodEnd, "pay_ctx");
        const jobs = await waitingJobs([COMMISSION_LINE_TYPE]);
        expect(jobs.map((j) => j.organizationId)).toEqual([
            ctx.organizationId,
            ctx.organizationId,
        ]);
        expect(await runCommission()).toBe(2);
        expect(
            await prisma.commissionLine.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(2);
    });
});

describe("a line for each cleared payment", () => {
    it("a renewal for a brought-in business: one PENDING line on the amount before GST, at the brought-in rate", async () => {
        const { broughtIn, assigned } = twoRates();
        await setRate("BROUGHT_IN", broughtIn);
        await setRate("ASSIGNED", assigned);
        const m = await manager();
        const ctx = await business();
        const linkId = await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await renew(providerSub, periodEnd, "pay_bi");
        await runCommission();

        const renewal = await renewalOf(ctx.organizationId);
        const rows = await linesOf(renewal.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            organizationId: ctx.organizationId,
            platformAdminId: m.platformAdminId,
            linkId,
            kind: "BROUGHT_IN",
            installment: 1,
            installments: 1,
            baseAmountPaise: renewal.taxablePaise,
            basisPoints: broughtIn,
            amountPaise: commissionPaise(renewal.taxablePaise, broughtIn),
            periodEnd: renewal.periodEnd,
            status: "PENDING",
            statementMonth: null,
            payoutId: null,
        });
        // Before GST: never the total the business paid.
        expect(renewal.totalPaise).toBeGreaterThan(renewal.taxablePaise);
    });

    it("an assigned business earns at the assigned rate", async () => {
        const { broughtIn, assigned } = twoRates();
        await setRate("BROUGHT_IN", broughtIn);
        await setRate("ASSIGNED", assigned);
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId, "ASSIGNED");
        const { providerSub, periodEnd } = await onPlan(ctx);
        await renew(providerSub, periodEnd, "pay_as");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                kind: "ASSIGNED",
                basisPoints: assigned,
                amountPaise: commissionPaise(renewal.taxablePaise, assigned),
            }),
        ]);
    });

    it("the same invoice processed twice, by the job, its repeat and the sweep, is one line", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await renew(providerSub, periodEnd, "pay_twice");
        const [job] = await waitingJobs([COMMISSION_LINE_TYPE]);
        await lines.handleLine(job!);
        await lines.handleLine(job!);
        await runCommission();
        await sweep.sweep(new Date());
        const renewal = await renewalOf(ctx.organizationId);
        expect(await linesOf(renewal.id)).toHaveLength(1);
        expect(await prisma.commissionLine.count()).toBe(2);
    });

    it("a rate changed later doesn't change a line written; the next payment takes the new one", async () => {
        const first = randomRate();
        let second = randomRate();
        while (second === first) second = randomRate();
        await setRate("BROUGHT_IN", first);
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await runCommission();
        await setRate("BROUGHT_IN", second, new Date());
        await sweep.sweep(new Date());

        const [opening] = await invoicesOf(ctx.organizationId);
        expect(await linesOf(opening!.id)).toEqual([
            expect.objectContaining({ basisPoints: first }),
        ]);
        await renew(providerSub, periodEnd, "pay_after_change");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                basisPoints: second,
                amountPaise: commissionPaise(renewal.taxablePaise, second),
            }),
        ]);
    });

    it("no manager, or a manager not on commission: no line", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const nobody = await business();
        const a = await onPlan(nobody);
        await renew(a.providerSub, a.periodEnd, "pay_nobody");
        // Nothing to do, so nothing is queued.
        expect(await waitingJobs([COMMISSION_LINE_TYPE])).toHaveLength(0);

        const salaried = await manager({ onCommission: false });
        const ctx = await business();
        await linkTo(ctx.organizationId, salaried.platformAdminId);
        const b = await onPlan(ctx);
        await renew(b.providerSub, b.periodEnd, "pay_salaried");
        await runCommission();
        await sweep.sweep(new Date());
        expect(await prisma.commissionLine.count()).toBe(0);
    });

    it("a link that started after the payment, or ended before it, earns nothing for it", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        const { providerSub, periodEnd } = await onPlan(ctx);
        await linkTo(
            ctx.organizationId,
            m.platformAdminId,
            "BROUGHT_IN",
            new Date(),
        );
        await runCommission();
        await sweep.sweep(new Date());
        expect(await prisma.commissionLine.count()).toBe(0);

        await endLink(ctx.organizationId);
        await renew(providerSub, periodEnd, "pay_after_end");
        await runCommission();
        await sweep.sweep(new Date());
        expect(await prisma.commissionLine.count()).toBe(0);
    });

    it("no rate set: NO_RATE, and a rate set later never back-pays it", async () => {
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await renew(providerSub, periodEnd, "pay_norate");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                status: "NO_RATE",
                basisPoints: null,
                amountPaise: null,
                rateId: null,
                baseAmountPaise: renewal.taxablePaise,
            }),
        ]);

        await setRate("BROUGHT_IN", randomRate(), new Date());
        await sweep.sweep(new Date());
        await sweep.sweep(new Date(periodEnd.getTime() + 40 * DAY));
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                status: "NO_RATE",
                basisPoints: null,
                amountPaise: null,
                rateId: null,
            }),
        ]);
    });

    it("the provider took a different amount: HELD until the mismatch is resolved", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        const renewed = await renew(providerSub, periodEnd, "pay_mismatch");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        await prisma.$transaction((tx) =>
            keepProviderAmountInTx(tx, quiet, renewal, renewal.totalPaise - 1),
        );

        const after = new Date(renewed.periodEnd.getTime() + HOUR);
        await sweep.sweep(after);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({ status: "HELD" }),
        ]);
        await prisma.billingAction.update({
            where: { dedupeKey: `amount-mismatch:${renewal.id}` },
            data: {
                resolvedAt: new Date(),
                resolvedBy: "spec",
                resolution: "checked with the provider",
            },
        });
        await sweep.sweep(after);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                status: "PAYABLE",
                statementMonth: monthOf(renewal.periodEnd!),
            }),
        ]);
    });

    it("the period ends with no refund: PAYABLE in the month it ended in", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        const renewed = await renew(providerSub, periodEnd, "pay_clean");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);

        await sweep.sweep(new Date(renewed.periodEnd.getTime() - HOUR));
        expect((await linesOf(renewal.id))[0]!.status).toBe("PENDING");
        await sweep.sweep(new Date(renewed.periodEnd.getTime() + HOUR));
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                status: "PAYABLE",
                statementMonth: monthOf(renewed.periodEnd),
            }),
        ]);
    });
});

describe("refunds and disputes", () => {
    async function managedRenewal(paymentId: string) {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        const renewed = await renew(providerSub, periodEnd, paymentId);
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        return {
            ctx,
            m,
            renewal,
            providerSub,
            periodEnd: renewed.periodEnd,
            after: new Date(renewed.periodEnd.getTime() + HOUR),
        };
    }

    it("a refund created, then processed, during the period cancels the line once", async () => {
        const { renewal, after } = await managedRenewal("pay_refunded");
        await refund("pay_refunded", `rfnd_1_${tag}`, "PENDING");
        await runCommission();
        expect((await linesOf(renewal.id))[0]!.status).toBe("PENDING");
        // Still waiting on the refund when the period ends: not payable.
        await sweep.sweep(after);
        expect((await linesOf(renewal.id))[0]!.status).toBe("PENDING");

        await refund("pay_refunded", `rfnd_1_${tag}`, "PROCESSED");
        await runCommission();
        const [cancelled] = await linesOf(renewal.id);
        expect(cancelled).toMatchObject({ status: "CANCELLED" });
        await sweep.sweep(after);
        await runCommission();
        const [again] = await linesOf(renewal.id);
        expect(again!.updatedAt).toEqual(cancelled!.updatedAt);
        expect(
            await prisma.billingAction.count({
                where: { code: "commission_refund_after_payout" },
            }),
        ).toBe(0);
    });

    it("a FAILED refund changes nothing", async () => {
        const { renewal, after } = await managedRenewal("pay_failed_refund");
        await refund("pay_failed_refund", `rfnd_f_${tag}`, "FAILED");
        await runCommission();
        await sweep.sweep(after);
        expect((await linesOf(renewal.id))[0]!.status).toBe("PAYABLE");
    });

    it("a dispute waits; WON changes nothing, LOST cancels", async () => {
        const won = await managedRenewal("pay_disputed_won");
        await dispute("pay_disputed_won", `disp_w_${tag}`, "OPEN");
        await sweep.sweep(won.after);
        expect((await linesOf(won.renewal.id))[0]!.status).toBe("PENDING");
        await dispute("pay_disputed_won", `disp_w_${tag}`, "WON");
        await runCommission();
        await sweep.sweep(won.after);
        expect((await linesOf(won.renewal.id))[0]!.status).toBe("PAYABLE");

        const lost = await managedRenewal("pay_disputed_lost");
        await dispute("pay_disputed_lost", `disp_l_${tag}`, "OPEN");
        await dispute("pay_disputed_lost", `disp_l_${tag}`, "LOST");
        await runCommission();
        expect((await linesOf(lost.renewal.id))[0]!.status).toBe("CANCELLED");
    });

    it("a refund after payout is a Needs action for the owner, once, and the line is unchanged", async () => {
        const { renewal, m, after } = await managedRenewal("pay_after_payout");
        await sweep.sweep(after);
        const commission = new AdminCommissionService(new AdminAuditService());
        await commission.markPaid(
            billingStaff(),
            {
                platformAdminId: m.platformAdminId,
                month: monthOf(renewal.periodEnd!),
                reference: "UTR-SPEC-1",
                reason: "paid by bank transfer",
            },
            after,
        );
        const [paid] = await linesOf(renewal.id);
        expect(paid).toMatchObject({ status: "PAID" });

        await refund("pay_after_payout", `rfnd_late_${tag}`, "PROCESSED");
        await runCommission();
        await sweep.sweep(after);
        await refund("pay_after_payout", `rfnd_late_${tag}`, "PROCESSED");
        await runCommission();
        const [still] = await linesOf(renewal.id);
        expect(still).toEqual(paid);
        const raised = await prisma.billingAction.findMany({
            where: { code: "commission_refund_after_payout" },
        });
        expect(raised).toHaveLength(1);
        expect(raised[0]).toMatchObject({
            organizationId: renewal.organizationId,
            resolvedAt: null,
        });
    });

    it("a refund recorded before its invoice: the line is written as cancelled", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const { providerSub, periodEnd } = await onPlan(ctx);
        await runCommission();
        await refund("pay_early", `rfnd_early_${tag}`, "PROCESSED");
        await renew(providerSub, periodEnd, "pay_early");
        await runCommission();
        const renewal = await renewalOf(ctx.organizationId);
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({ status: "CANCELLED" }),
        ]);
    });

    it("a double charge's automatic refund touches no line", async () => {
        const { ctx, renewal, after } = await managedRenewal("pay_kept");
        await prisma.$transaction((tx) =>
            recordRefundInTx(tx, quiet, {
                provider: "RAZORPAY",
                kind: "REFUND",
                providerRefundId: `rfnd_dc_${tag}`,
                providerPaymentId: "pay_double_charge",
                amountPaise: null,
                status: "PROCESSED",
                source: "AUTO",
                organizationId: ctx.organizationId,
            }),
        );
        expect(await queue.queueRefund("RAZORPAY", "pay_double_charge")).toBe(
            false,
        );
        const before = await prisma.commissionLine.findMany({
            orderBy: { id: "asc" },
        });
        await sweep.sweep(new Date());
        expect(
            await prisma.commissionLine.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(before);
        await sweep.sweep(after);
        expect((await linesOf(renewal.id))[0]!.status).toBe("PAYABLE");
    });

    it("a refund after the business moved to another manager cancels the first manager's line", async () => {
        const { ctx, m, renewal } = await managedRenewal("pay_moved");
        await endLink(ctx.organizationId);
        const next = await manager();
        await linkTo(
            ctx.organizationId,
            next.platformAdminId,
            "ASSIGNED",
            new Date(),
        );
        await refund("pay_moved", `rfnd_moved_${tag}`, "PROCESSED");
        await runCommission();
        expect(await linesOf(renewal.id)).toEqual([
            expect.objectContaining({
                platformAdminId: m.platformAdminId,
                status: "CANCELLED",
            }),
        ]);
        expect(
            await prisma.commissionLine.count({
                where: { platformAdminId: next.platformAdminId },
            }),
        ).toBe(0);
    });
});

describe("trials, upgrades and years", () => {
    it("a paid first month in a trial earns a line; a trial with no charge earns none", async () => {
        await reinstall(
            fakeCatalog((c) => {
                c.plans[1]!.trial = { on: true, days: 30, firstPaise: FIRST };
            }),
        );
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager();
        const paid = await business();
        await linkTo(paid.organizationId, m.platformAdminId);
        const r = await checkout.changePlan(paid, {
            plan: "b",
            cycle: "month",
        });
        if (r.kind !== "TRIAL") throw new Error("expected the first month");
        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        await runCommission();
        const [first] = await invoicesOf(paid.organizationId);
        expect(first!.taxablePaise).toBe(FIRST);
        expect(await linesOf(first!.id)).toEqual([
            expect.objectContaining({
                baseAmountPaise: FIRST,
                amountPaise: commissionPaise(FIRST, rate),
                status: "PENDING",
            }),
        ]);

        await reinstall(
            fakeCatalog((c) => {
                c.plans[1]!.trial = { on: true, days: 30 };
            }),
        );
        await setRate("BROUGHT_IN", rate);
        const other = await manager();
        const free = await business();
        await linkTo(free.organizationId, other.platformAdminId);
        const t = await checkout.changePlan(free, {
            plan: "b",
            cycle: "month",
        });
        if (t.kind !== "TRIAL") throw new Error("expected a trial");
        await deliver(`fake_sub_${t.checkout.id}`, "authenticated");
        await runCommission();
        await sweep.sweep(new Date());
        expect(await invoicesOf(free.organizationId)).toHaveLength(0);
        expect(await prisma.commissionLine.count()).toBe(0);
    });

    it("an upgrade earns on the upgrade invoice's prorated amount before GST", async () => {
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        await onPlan(ctx, new Date(Date.now() + 15 * DAY), "b");
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind !== "UPGRADE") throw new Error("expected an upgrade");
        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        await runCommission();
        const upgrade = (await invoicesOf(ctx.organizationId)).find(
            (i) => i.source === "UPGRADE",
        );
        expect(upgrade?.taxablePaise).toBe(r.quote.chargeNowPaise);
        expect(await linesOf(upgrade!.id)).toEqual([
            expect.objectContaining({
                baseAmountPaise: r.quote.chargeNowPaise,
                amountPaise: commissionPaise(r.quote.chargeNowPaise, rate),
            }),
        ]);
    });

    it("a year paid at once earns one twelfth each month, each payable as its month ends", async () => {
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager();
        const ctx = await business();
        await linkTo(ctx.organizationId, m.platformAdminId);
        const start = new Date();
        const end = new Date(
            Date.UTC(
                start.getUTCFullYear() + 1,
                start.getUTCMonth(),
                start.getUTCDate(),
                start.getUTCHours(),
            ),
        );
        const taxable = 1_200_000 + Math.floor(Math.random() * 99_999);
        const invoice = await prisma.sarohInvoice.create({
            data: {
                organizationId: ctx.organizationId,
                number: `TST/YR/${tag}`,
                series: "TST/YR",
                chargeKey: `year:${tag}`,
                source: "NEW",
                provider: "RAZORPAY",
                providerEventId: `evt_year_${tag}`,
                providerPaymentId: `pay_year_${tag}`,
                planName: "Plan C",
                cycle: "year",
                periodStart: start,
                periodEnd: end,
                issuedAt: start,
                sellerName: "Saroh",
                billToName: "Year Shop",
                taxType: "INTRA",
                subtotalPaise: taxable,
                taxablePaise: taxable,
                cgstPaise: 0,
                sgstPaise: 0,
                igstPaise: 0,
                taxPaise: 0,
                totalPaise: taxable,
            },
        });
        expect(await queue.queueLine(invoice)).toBe(true);
        await runCommission();
        const rows = await linesOf(invoice.id);
        expect(rows).toHaveLength(12);
        expect(rows.map((r) => r.installment)).toEqual(
            Array.from({ length: 12 }, (_, i) => i + 1),
        );
        expect(
            rows.every((r) => r.installments === 12 && r.basisPoints === rate),
        ).toBe(true);
        expect(rows.map((r) => r.amountPaise)).toEqual(
            splitEvenly(commissionPaise(taxable, rate), 12),
        );
        expect(rows.reduce((t, r) => t + r.baseAmountPaise, 0)).toBe(taxable);
        expect(rows[11]!.periodEnd).toEqual(end);

        // A month on, the first twelfth only.
        await sweep.sweep(new Date(rows[0]!.periodEnd.getTime() + HOUR));
        const after = await linesOf(invoice.id);
        expect(after.filter((r) => r.status === "PAYABLE")).toEqual([
            expect.objectContaining({
                installment: 1,
                statementMonth: monthOf(rows[0]!.periodEnd),
            }),
        ]);
        expect(after.filter((r) => r.status === "PENDING")).toHaveLength(11);
    });
});
