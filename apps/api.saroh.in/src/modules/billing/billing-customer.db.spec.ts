/**
 * One customer per business at Saroh's billing provider, made at sign-up
 * (DEC-165, owner, 17 Oct 2026), against a real Postgres through the fake
 * billing provider (no Razorpay call is ever made):
 *
 * - sign-up queues the sync; the job makes the customer once, and an
 *   owner's second business with the same email and phone is made without
 *   the phone, never handed the first's customer;
 * - a change of billing details in Settings queues it again, and the job
 *   updates the customer rather than making another;
 * - a checkout uses the stored customer, and makes it only when missing;
 * - with no provider keys nothing is asked; a failure is kept on the row;
 * - the backfill queues one sync per business without a customer.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import type { Job } from "@saroh/database";
import {
    backfillBillingCustomers,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationOnboardingService } from "../organizations/organization-onboarding.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import {
    BillingCustomerSyncHandler,
    billingCustomerOf,
} from "./billing-customer";
import { BILLING_CUSTOMER_SYNC_TYPE } from "./billing-customer-sync";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import { BillingProviderError } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const DAY = 24 * 60 * 60 * 1000;
const audit = new AuditService();
const onboarding = new OrganizationOnboardingService(audit);
const settings = new OrganizationSettingsService(audit, {} as MediaService);

let fake: FakeBillingProvider;
let handler: BillingCustomerSyncHandler;
let checkout: CheckoutService;

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeEach(async () => {
    fake = new FakeBillingProvider();
    const factory = new FakeBillingProviderFactory(fake);
    handler = new BillingCustomerSyncHandler(factory);
    checkout = new CheckoutService(new PlansService(), factory);
    await prisma.job.deleteMany({});
    await prisma.billingCustomer.deleteMany({});
});

async function signUp(email = `${uniq("owner-")}@example.com`) {
    const user =
        (await prisma.user.findUnique({ where: { email } })) ??
        (await prisma.user.create({ data: { email, name: "Asha Rao" } }));
    const org = await onboarding.onboard(user.id, {
        name: "Asha's Kitchen",
        address: uniq("asha-"),
    });
    await prisma.businessProfile.update({
        where: { organizationId: org.id },
        data: { phone: "+919800000000" },
    });
    return { organizationId: org.id, userId: user.id };
}

const syncJobs = (organizationId?: string) =>
    prisma.job.findMany({
        where: {
            type: BILLING_CUSTOMER_SYNC_TYPE,
            ...(organizationId ? { organizationId } : {}),
        },
    });

async function runSync(organizationId: string) {
    const [job] = await syncJobs(organizationId);
    await handler.handle(job!);
    await prisma.job.update({
        where: { id: job!.id },
        data: { status: "DONE" },
    });
}

const row = (organizationId: string) =>
    prisma.billingCustomer.findUnique({
        where: {
            organizationId_provider: { organizationId, provider: "RAZORPAY" },
        },
    });

describe("one customer per business, made at sign-up (DEC-165)", () => {
    it("sign-up queues the sync once; the job makes the customer with its details", async () => {
        const { organizationId } = await signUp();
        expect(await syncJobs(organizationId)).toHaveLength(1);
        await runSync(organizationId);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.created[0]).toMatchObject({
            withContact: true,
            input: {
                organizationId,
                businessName: "Asha's Kitchen",
                contact: "+919800000000",
            },
        });
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: `fake_cus_${organizationId}`,
            contactWithheld: false,
            lastError: null,
        });
    });

    it("an owner's second business with the same email and phone: made without the phone, never the first's", async () => {
        const email = `${uniq("two-")}@example.com`;
        const first = await signUp(email);
        await runSync(first.organizationId);
        const second = await signUp(email);
        await runSync(second.organizationId);
        expect(await row(second.organizationId)).toMatchObject({
            providerCustomerId: `fake_cus_${second.organizationId}`,
            contactWithheld: true,
        });
        expect(fake.customers.created.at(-1)).toMatchObject({
            withContact: false,
            input: { organizationId: second.organizationId },
        });
        // Kept current, the phone stays withheld.
        await settings.update(
            {
                organizationId: second.organizationId,
                userId: second.userId,
                role: "OWNER",
            },
            { profile: { legalName: "Asha Foods LLP" } },
        );
        await runSync(second.organizationId);
        expect(fake.customers.updated.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${second.organizationId}`,
            withContact: false,
        });
    });

    it("a change of billing details queues the sync, which updates the customer rather than making another", async () => {
        const { organizationId, userId } = await signUp();
        await runSync(organizationId);
        await settings.update(
            { organizationId, userId, role: "OWNER" },
            { profile: { legalName: "Asha Foods Pvt Ltd" } },
        );
        // A second save before it runs: still one waiting.
        await settings.update(
            { organizationId, userId, role: "OWNER" },
            { profile: { legalName: "Asha Foods Private Limited" } },
        );
        const waiting = (await syncJobs(organizationId)).filter(
            (j) => j.status === "PENDING",
        );
        expect(waiting).toHaveLength(1);
        await handler.handle(waiting[0]!);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.updated).toEqual([
            expect.objectContaining({
                providerCustomerId: `fake_cus_${organizationId}`,
                withContact: true,
                input: expect.objectContaining({
                    name: "Asha Foods Private Limited",
                }),
            }),
        ]);
        expect((await row(organizationId))?.syncedAt).not.toBeNull();
    });

    it("a change that isn't about billing queues nothing", async () => {
        const { organizationId, userId } = await signUp();
        await runSync(organizationId);
        await settings.update(
            { organizationId, userId, role: "OWNER" },
            { profile: { website: "https://example.com" } },
        );
        expect(
            (await syncJobs(organizationId)).filter(
                (j) => j.status === "PENDING",
            ),
        ).toHaveLength(0);
    });

    it("with no provider keys nothing is asked and nothing kept", async () => {
        const { organizationId } = await signUp();
        fake.customers.keys = false;
        await runSync(organizationId);
        expect(fake.customers.created).toHaveLength(0);
        expect(await row(organizationId)).toBeNull();
    });

    it("a provider that can't answer: kept on the row and retried; a refusal is not retried", async () => {
        const { organizationId } = await signUp();
        const [job] = await syncJobs(organizationId);
        fake.customers.failNext = new BillingProviderError(
            "UNKNOWN",
            "network error",
        );
        await expect(handler.handle(job!)).rejects.toThrow("network error");
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: null,
            lastError: "network error",
        });
        fake.customers.failNext = new BillingProviderError(
            "REFUSED",
            "HTTP 400",
        );
        await expect(handler.handle(job!)).resolves.toBeUndefined();
        await handler.handle(job!);
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: `fake_cus_${organizationId}`,
            lastError: null,
        });
    });
});

describe("a checkout uses the business's customer", () => {
    beforeEach(async () => {
        await prisma.sarohInvoice.deleteMany({});
        await prisma.billingWebhookEvent.deleteMany({});
        await prisma.billingCheckout.deleteMany({});
        await prisma.subscription.deleteMany({});
        await prisma.pricingProviderPlan.deleteMany({});
        await prisma.pricingCatalogVersion.deleteMany({});
        await prisma.plan.deleteMany({});
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

    async function paidCheckout(organizationId: string, userId: string) {
        await giveBillingDetails(organizationId);
        return checkout.changePlan(
            { organizationId, userId, role: "OWNER" },
            { plan: "b", cycle: "month" },
        );
    }

    it("takes each detail from the latest checkout that gave it, past one that asked nothing", async () => {
        const { organizationId } = await signUp();
        await prisma.businessProfile.update({
            where: { organizationId },
            data: { phone: null, taxId: null },
        });
        const plan = await prisma.plan.findFirstOrThrow({
            where: { priceCents: { gt: 0 } },
        });
        const checkout = (
            at: Date,
            given: { phone?: string; gstin?: string },
        ) =>
            prisma.billingCheckout.create({
                data: {
                    organizationId,
                    planId: plan.id,
                    cycle: "month",
                    kind: "NEW",
                    status: "COMPLETED",
                    provider: "RAZORPAY",
                    providerSubscriptionId: uniq("sub_given_"),
                    providerPlanId: "plan_test",
                    pricePaise: plan.priceCents,
                    chargeNowPaise: 0,
                    createdAt: at,
                    expiresAt: new Date(at.getTime() + DAY),
                    billToPhone: given.phone ?? null,
                    billToGstin: given.gstin ?? null,
                },
            });
        await checkout(new Date(Date.now() - 2 * DAY), {
            phone: "+919845012345",
            gstin: "29ABCDE1234F1ZW",
        });
        // An upgrade later, every detail on file: it was given nothing.
        await checkout(new Date(Date.now() - DAY), {});
        expect(await billingCustomerOf(organizationId)).toMatchObject({
            contact: "+919845012345",
            gstin: "29ABCDE1234F1ZW",
        });
    });

    it("the stored one, asking the provider for no other", async () => {
        const { organizationId, userId } = await signUp();
        await prisma.billingCustomer.create({
            data: {
                organizationId,
                provider: "RAZORPAY",
                providerCustomerId: "cust_stored",
            },
        });
        const r = await paidCheckout(organizationId, userId);
        expect(fake.customers.created).toHaveLength(0);
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: "cust_stored",
        });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({ providerCustomerId: "cust_stored" });
        // What the checkout was given reaches the customer by the job.
        expect(
            (await syncJobs(organizationId)).filter(
                (j) => j.status === "PENDING",
            ),
        ).toHaveLength(1);
    });

    it("made now when the sign-up's job hasn't run, and kept for the job", async () => {
        const { organizationId, userId } = await signUp();
        await paidCheckout(organizationId, userId);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${organizationId}`,
        });
        await runSync(organizationId);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.updated).toHaveLength(1);
    });

    it("with no keys the checkout goes on without one", async () => {
        const { organizationId, userId } = await signUp();
        fake.customers.keys = false;
        const r = await paidCheckout(organizationId, userId);
        expect(r.kind).not.toBe("TO_FREE");
        expect(fake.createCalls.at(-1)?.providerCustomerId ?? null).toBeNull();
    });
});

describe("the backfill (DEC-165)", () => {
    it("queues one sync per business without a customer, and nothing the second time", async () => {
        const made = await signUp();
        const without = await signUp();
        await runSync(made.organizationId);
        await prisma.job.deleteMany({
            where: { organizationId: without.organizationId },
        });
        const first = await backfillBillingCustomers(prisma);
        expect(first.queued).toBeGreaterThanOrEqual(1);
        const queued: Job[] = await syncJobs(without.organizationId);
        expect(queued).toHaveLength(1);
        expect(
            (await syncJobs(made.organizationId)).filter(
                (j) => j.status === "PENDING",
            ),
        ).toHaveLength(0);
        const second = await backfillBillingCustomers(prisma);
        expect(second.queued).toBe(0);
    });
});
