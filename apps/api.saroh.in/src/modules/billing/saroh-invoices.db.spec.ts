/**
 * Saroh's own invoices against a real Postgres (pricing catalogue U17): the
 * billing webhook writes a numbered GST invoice for every charge, in the
 * same transaction, once per charge, and queues its email; the email job
 * sends it through a watched sender (never the network) and retries a
 * failure without losing the invoice.
 *
 * - A new plan's first charge, then a renewal: numbered in series, CGST +
 *   SGST in Saroh's state, IGST in another (the state and GSTIN given at
 *   checkout).
 * - `activated` and `charged` for one payment, and a redelivered event,
 *   make one invoice; a number is never burned on a duplicate.
 * - An upgrade's difference; a scheduled change's first charge.
 * - A failed charge is told once; one paid since is not.
 * - Mail down: the invoice stands and the job throws to retry.
 *
 * Every catalogue, price and seller detail is made up (`fakeCatalog`: Plan
 * A/B/C, 222, 333; seller "Example Labs", prefix TST). Rows satisfy the
 * migration's CHECKs, so it holds in RLS mode. Integration project
 * (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { gstPaise, planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { SarohBillingEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { gstinCheckChar } from "../invoices/gst-states";
import { BILLING_EMAIL_TYPE, BillingEmailHandler } from "./billing-email.job";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
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

/** A GSTIN that checks out, in `state`. */
function gstin(state: string): string {
    const first = `${state}AAAAA0000A1Z`;
    return `${first}${gstinCheckChar(first)}`;
}

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let invoices: SarohInvoicesService;
let sent: SarohBillingEmail[];
let outcome: "sent" | "failed" | "not-configured";
let mailer: BillingEmailHandler;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    invoices = new SarohInvoicesService(SELLER);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(factory, undefined, invoices);
    sent = [];
    outcome = "sent";
    mailer = new BillingEmailHandler((email) => {
        sent.push(email);
        return Promise.resolve(outcome);
    });
    createTransport.mockClear();
    await prisma.job.deleteMany({});
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

afterEach(() => {
    // Nothing in this file ever reaches a real mail transport.
    expect(createTransport).not.toHaveBeenCalled();
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
async function business(
    profile: { gstState?: string } = {},
): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Invoice Shop ${seq}`, slug: `sinv-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    if (profile.gstState) {
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                legalName: `Invoice Shop ${seq} LLP`,
                addressLine1: "2 Shop Lane",
                city: "Testville",
                postalCode: "560001",
                gstState: profile.gstState,
            },
        });
    }
    const owner = await prisma.user.create({
        data: { email: `owner-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const member = await prisma.user.create({
        data: { email: `member-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: member.id, role: "MEMBER" },
    });
    return { organizationId: org.id, userId: owner.id, role: "OWNER" };
}

let evt = 0;
async function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    over: {
        currentPeriodEnd?: Date | null;
        id?: string;
        now?: Date;
        paymentId?: string;
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
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: over.id ?? `evt_${evt}_${tag}`,
            type: `subscription.${phase}`,
            providerSubscriptionId,
            status,
            phase,
            eventAt: (over.now ?? new Date()).toISOString(),
            ...(over.paymentId ? { providerPaymentId: over.paymentId } : {}),
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
        over.now ?? new Date(),
    );
}

async function invoicesOf(organizationId: string) {
    return prisma.sarohInvoice.findMany({
        where: { organizationId },
        include: { lines: true },
        orderBy: { number: "asc" },
    });
}

async function emailJobs() {
    return prisma.job.findMany({
        where: { type: BILLING_EMAIL_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

/** Free → `plan` monthly, its first charge paid. */
async function onPaidPlan(
    ctx: OrganizationContext,
    plan = "b",
    billTo: { billingState?: string; gstin?: string } = {},
) {
    const r = await checkout.changePlan(ctx, {
        plan,
        cycle: "month",
        ...billTo,
    });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const providerSub = `fake_sub_${r.checkout.id}`;
    const end = new Date(Date.now() + 30 * DAY);
    await deliver(providerSub, "activated", { currentPeriodEnd: end });
    return { checkoutId: r.checkout.id, providerSub, periodEnd: end };
}

describe("a plan's charges", () => {
    it("a new plan's first charge, then a renewal: numbered in series, CGST + SGST in Saroh's state", async () => {
        const ctx = await business({ gstState: "29" });
        const b = await row("b");
        const { providerSub, periodEnd } = await onPaidPlan(ctx);

        let rows = await invoicesOf(ctx.organizationId);
        expect(rows).toHaveLength(1);
        const first = rows[0]!;
        expect(first.number).toMatch(/^TST\/\d{2}-\d{2}\/00001$/);
        expect(first).toMatchObject({
            source: "NEW",
            planName: "Plan B",
            cycle: "month",
            periodEnd,
            sellerGstin: SELLER.gstin,
            sellerLegalName: SELLER.legalName,
            billToName: `Invoice Shop ${seq} LLP`,
            placeOfSupply: "29",
            taxType: "INTRA",
            taxablePaise: b.priceCents,
            taxPaise: gstPaise(b.priceCents),
            totalPaise: withGstPaise(b.priceCents),
            igstPaise: 0,
        });
        expect(first.cgstPaise + first.sgstPaise).toBe(gstPaise(b.priceCents));
        expect(first.lines).toEqual([
            expect.objectContaining({
                description: "Plan B plan, monthly",
                sac: "999999",
                unitPaise: b.priceCents,
                amountPaise: withGstPaise(b.priceCents),
            }),
        ]);

        // Razorpay's `charged` for the same payment: no second invoice.
        await deliver(providerSub, "charged", {
            currentPeriodEnd: periodEnd,
            paymentId: "pay_first",
        });
        expect(await invoicesOf(ctx.organizationId)).toHaveLength(1);

        // The next month's charge: a renewal, the next number.
        const next = new Date(periodEnd.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", {
            currentPeriodEnd: next,
            paymentId: "pay_second",
        });
        rows = await invoicesOf(ctx.organizationId);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({
            source: "RENEWAL",
            periodEnd: next,
            providerPaymentId: "pay_second",
            totalPaise: withGstPaise(b.priceCents),
        });
        expect(rows[1]!.number).toMatch(/\/00002$/);
        // One email job per invoice.
        const jobs = await emailJobs();
        expect(jobs.map((j) => j.payload)).toEqual([
            {
                kind: "INVOICE",
                organizationId: ctx.organizationId,
                invoiceId: rows[0]!.id,
            },
            {
                kind: "INVOICE",
                organizationId: ctx.organizationId,
                invoiceId: rows[1]!.id,
            },
        ]);
    });

    it("a redelivered event makes nothing and burns no number", async () => {
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        const providerSub = `fake_sub_${r.checkout.id}`;
        const end = new Date(Date.now() + 30 * DAY);
        await deliver(providerSub, "activated", {
            currentPeriodEnd: end,
            id: `evt_once_${tag}`,
        });
        await expect(
            deliver(providerSub, "activated", {
                currentPeriodEnd: end,
                id: `evt_once_${tag}`,
            }),
        ).resolves.toMatchObject({ status: "duplicate" });
        expect(await invoicesOf(ctx.organizationId)).toHaveLength(1);

        // The next business's invoice takes the next number: none was lost.
        const other = await business();
        await onPaidPlan(other);
        const [mine] = await invoicesOf(ctx.organizationId);
        const [theirs] = await invoicesOf(other.organizationId);
        expect(mine!.number.endsWith("/00001")).toBe(true);
        expect(theirs!.number.endsWith("/00002")).toBe(true);
    });

    it("IGST for a business in another state, with the GSTIN given at checkout", async () => {
        const ctx = await business({ gstState: "29" });
        const theirs = gstin("27");
        await onPaidPlan(ctx, "b", {
            billingState: "Maharashtra",
            gstin: theirs,
        });

        const [invoice] = await invoicesOf(ctx.organizationId);
        expect(invoice).toMatchObject({
            billToGstin: theirs,
            billToState: "27",
            placeOfSupply: "27",
            taxType: "INTER",
            cgstPaise: 0,
            sgstPaise: 0,
        });
        expect(invoice!.igstPaise).toBe(invoice!.taxPaise);
        const saved = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(saved).toMatchObject({ billToState: "27", billToGstin: theirs });
    });

    it("refuses a GSTIN that doesn't check out, or isn't in the state given, before the provider is asked", async () => {
        const ctx = await business();
        const good = gstin("27");
        const bad = `${good.slice(0, 14)}${good[14] === "A" ? "B" : "A"}`;
        await expect(
            checkout.changePlan(ctx, { plan: "b", cycle: "month", gstin: bad }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            checkout.changePlan(ctx, {
                plan: "b",
                cycle: "month",
                billingState: "29",
                gstin: good,
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            checkout.changePlan(ctx, {
                plan: "b",
                cycle: "month",
                billingState: "Atlantis",
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fake.createCalls).toHaveLength(0);
    });

    it("an upgrade's difference is invoiced once authorised; the new plan's first charge later is a renewal", async () => {
        const ctx = await business({ gstState: "29" });
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind !== "UPGRADE") throw new Error("expected an upgrade");
        const upgradeSub = `fake_sub_${r.checkout.id}`;

        await deliver(upgradeSub, "authenticated");
        let rows = await invoicesOf(ctx.organizationId);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({
            source: "UPGRADE",
            planName: "Plan C",
            periodEnd,
            taxablePaise: r.quote.chargeNowPaise,
            taxPaise: r.quote.chargeNowGstPaise,
            totalPaise: r.quote.chargeNowTotalPaise,
        });
        expect(rows[1]!.lines[0]!.description).toBe(
            "Plan C: the rest of this period, up from Plan B",
        );

        // Its own first charge, when the paid period ends.
        const c = await row("c");
        await deliver(upgradeSub, "charged", {
            currentPeriodEnd: new Date(periodEnd.getTime() + 30 * DAY),
        });
        rows = await invoicesOf(ctx.organizationId);
        expect(rows).toHaveLength(3);
        expect(rows[2]).toMatchObject({
            source: "RENEWAL",
            totalPaise: withGstPaise(c.priceCents),
        });
    });

    it("a cheaper plan's first charge is invoiced when its date comes, not when it's authorised", async () => {
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "c");
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "SCHEDULED") throw new Error("expected scheduled");
        const scheduledSub = `fake_sub_${r.checkout.id}`;

        await deliver(scheduledSub, "authenticated");
        expect(await invoicesOf(ctx.organizationId)).toHaveLength(1);

        const later = new Date(periodEnd.getTime() + 1000);
        const nextEnd = new Date(periodEnd.getTime() + 30 * DAY);
        await deliver(scheduledSub, "activated", {
            currentPeriodEnd: nextEnd,
            now: later,
        });
        await deliver(scheduledSub, "charged", {
            currentPeriodEnd: nextEnd,
            now: new Date(later.getTime() + 1000),
        });
        const rows = await invoicesOf(ctx.organizationId);
        expect(rows).toHaveLength(2);
        const b = await row("b");
        expect(rows[1]).toMatchObject({
            source: "SCHEDULED",
            planName: "Plan B",
            periodEnd: nextEnd,
            totalPaise: withGstPaise(b.priceCents),
        });
    });
});

describe("billing emails", () => {
    async function runJobs(): Promise<Job[]> {
        const jobs = await emailJobs();
        for (const job of jobs) await mailer.handle(job);
        return jobs;
    }

    it("emails the invoice with its PDF to the people who manage billing, once", async () => {
        const ctx = await business({ gstState: "29" });
        await onPaidPlan(ctx);
        await runJobs();

        expect(sent).toHaveLength(1);
        const owner = await prisma.user.findUniqueOrThrow({
            where: { id: ctx.userId },
        });
        expect(sent[0]!.to).toEqual([owner.email]);
        expect(sent[0]!.subject).toMatch(/^Your Saroh invoice TST\//);
        expect(
            sent[0]!.attachments?.[0]?.content.subarray(0, 4).toString(),
        ).toBe("%PDF");
        const [invoice] = await invoicesOf(ctx.organizationId);
        expect(invoice!.emailedAt).not.toBeNull();

        // Run again (a redelivered job): nothing more is sent.
        await runJobs();
        expect(sent).toHaveLength(1);
    });

    it("mail down: the invoice stands, the job throws to be retried, and the retry sends it", async () => {
        const ctx = await business();
        await onPaidPlan(ctx);
        const [job] = await emailJobs();
        outcome = "failed";
        await expect(mailer.handle(job!)).rejects.toThrow(
            /billing_email_send_failed/,
        );
        const [invoice] = await invoicesOf(ctx.organizationId);
        expect(invoice!.emailedAt).toBeNull();

        outcome = "sent";
        await mailer.handle(job!);
        expect(
            (await invoicesOf(ctx.organizationId))[0]!.emailedAt,
        ).not.toBeNull();
    });

    it("the real sender with no mail set up: nothing leaves, and the invoice is kept unsent", async () => {
        const ctx = await business();
        await onPaidPlan(ctx);
        const [job] = await emailJobs();
        await new BillingEmailHandler().handle(job!);
        expect(createTransport).not.toHaveBeenCalled();
        expect((await invoicesOf(ctx.organizationId))[0]!.emailedAt).toBeNull();
    });

    it("a failed charge is told once; a final one says Free; one paid since says nothing", async () => {
        const ctx = await business();
        const { providerSub, periodEnd } = await onPaidPlan(ctx);
        await prisma.job.deleteMany({});

        await deliver(providerSub, "pending");
        await runJobs();
        await runJobs();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.subject).toMatch(/didn't go through/);

        // A retry went through before the next failure's email ran.
        await prisma.job.deleteMany({});
        await deliver(providerSub, "charged", {
            currentPeriodEnd: new Date(periodEnd.getTime() + 30 * DAY),
        });
        await prisma.job.deleteMany({ where: { type: BILLING_EMAIL_TYPE } });
        await deliver(providerSub, "pending");
        await deliver(providerSub, "charged", {
            currentPeriodEnd: new Date(periodEnd.getTime() + 30 * DAY),
        });
        const failed = (await emailJobs()).filter(
            (j) => (j.payload as { kind: string }).kind === "PAYMENT_FAILED",
        );
        expect(failed).toHaveLength(1);
        for (const j of failed) await mailer.handle(j);
        expect(sent).toHaveLength(1);

        await deliver(providerSub, "pending");
        await deliver(providerSub, "halted");
        const final = (await emailJobs()).filter(
            (j) => (j.payload as { final?: boolean }).final === true,
        );
        expect(final).toHaveLength(1);
        await mailer.handle(final[0]!);
        expect(sent.at(-1)!.subject).toMatch(/is now on the Free plan$/);
    });
});

describe("reading them", () => {
    it("lists the business's own, and draws one as a PDF; another business's is not found", async () => {
        const ctx = await business({ gstState: "29" });
        await onPaidPlan(ctx);
        const list = await invoices.list(ctx);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ source: "NEW", planName: "Plan B" });

        const { file, fileName } = await invoices.pdf(ctx, list[0]!.id);
        expect(file.subarray(0, 4).toString()).toBe("%PDF");
        expect(fileName).toMatch(/^TST-\d{2}-\d{2}-00001\.pdf$/);

        const other = await business();
        await expect(invoices.pdf(other, list[0]!.id)).rejects.toMatchObject({
            status: 404,
        });
        expect(await invoices.list(other)).toEqual([]);
        await expect(
            invoices.list({ ...ctx, role: "MEMBER" }),
        ).rejects.toMatchObject({ status: 403 });
    });
});
