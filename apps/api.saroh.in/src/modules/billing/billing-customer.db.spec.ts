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
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { OrganizationOnboardingService } from "../organizations/organization-onboarding.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import {
    BillingCustomerSyncHandler,
    billingCustomerOf,
} from "./billing-customer";
import {
    BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS,
    BILLING_CUSTOMER_SYNC_TYPE,
    enqueueOwnedBusinessesSync,
} from "./billing-customer-sync";
import { BILLING_NOTE_AUTHOR } from "./billing-ops-notice";
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
const members = new OrganizationMembersService(audit);

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
    await prisma.adminOrganizationNote.deleteMany({
        where: { authorUserId: BILLING_NOTE_AUTHOR },
    });
});

const opsNotes = (organizationId: string) =>
    prisma.adminOrganizationNote.findMany({
        where: { organizationId, authorUserId: BILLING_NOTE_AUTHOR },
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
        const queued = await syncJobs(organizationId);
        expect(queued).toHaveLength(1);
        // Enough tries to ride out a provider's blip or rate limiting.
        expect(queued[0]!.maxAttempts).toBe(BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS);
        expect(BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS).toBeGreaterThanOrEqual(10);
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

describe("the owner's email reaches the customer (17 Oct 2026)", () => {
    const waiting = async (organizationId: string) =>
        (await syncJobs(organizationId)).filter((j) => j.status === "PENDING");
    const settle = () =>
        prisma.job.updateMany({
            where: { type: BILLING_CUSTOMER_SYNC_TYPE },
            data: { status: "DONE" },
        });

    it("a change of the owner's email queues the sync for every business they own, and none they only work in", async () => {
        const email = `${uniq("mail-")}@example.com`;
        const one = await signUp(email);
        const two = await signUp(email);
        const elsewhere = await signUp();
        await prisma.membership.create({
            data: {
                organizationId: elsewhere.organizationId,
                userId: one.userId,
                role: "ADMIN",
            },
        });
        await settle();
        await expect(enqueueOwnedBusinessesSync(one.userId)).resolves.toBe(2);
        expect(await waiting(one.organizationId)).toHaveLength(1);
        expect(await waiting(two.organizationId)).toHaveLength(1);
        expect(await waiting(elsewhere.organizationId)).toHaveLength(0);
    });

    it("a new owner, or an owner's role changed, queues the sync", async () => {
        const owner = await signUp();
        const other = await prisma.user.create({
            data: { email: `${uniq("next-")}@example.com`, name: "Ravi" },
        });
        await prisma.membership.create({
            data: {
                organizationId: owner.organizationId,
                userId: other.id,
                role: "ADMIN",
            },
        });
        await settle();
        await members.updateRole(
            {
                organizationId: owner.organizationId,
                userId: owner.userId,
                role: "OWNER",
            },
            other.id,
            { role: "OWNER" },
        );
        expect(await waiting(owner.organizationId)).toHaveLength(1);
    });
});

describe("never a second customer for one business (17 Oct 2026)", () => {
    it("a create whose answer was lost: the next try finds its own customer by its notes, never makes a second", async () => {
        const { organizationId } = await signUp();
        const [job] = await syncJobs(organizationId);
        fake.customers.loseNextAnswer = true;
        await expect(handler.handle(job!)).rejects.toThrow("network error");
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: null,
        });
        await handler.handle(job!);
        expect(fake.customers.created).toHaveLength(1);
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: `fake_cus_${organizationId}`,
            // Its own: the phone was never another's.
            contactWithheld: false,
            lastError: null,
        });
        // Adopted, then brought up to date.
        expect(fake.customers.updated.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${organizationId}`,
            withContact: true,
        });
    });

    it("details saved since that are another customer's email and phone: sent without the phone, withheld from then on", async () => {
        const email = `${uniq("move-")}@example.com`;
        const first = await signUp(email);
        await runSync(first.organizationId);
        const second = await signUp(email);
        await prisma.businessProfile.update({
            where: { organizationId: second.organizationId },
            data: { phone: "+919811111111" },
        });
        await runSync(second.organizationId);
        expect(await row(second.organizationId)).toMatchObject({
            contactWithheld: false,
        });
        // The owner gives the second business the first's phone.
        await settings.update(
            {
                organizationId: second.organizationId,
                userId: second.userId,
                role: "OWNER",
            },
            { profile: { phone: "+919800000000" } },
        );
        const waiting = (await syncJobs(second.organizationId)).filter(
            (j) => j.status === "PENDING",
        );
        await handler.handle(waiting[0]!);
        expect(fake.customers.updated.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${second.organizationId}`,
            withContact: false,
        });
        expect(await row(second.organizationId)).toMatchObject({
            contactWithheld: true,
            lastError: null,
        });
        expect(await opsNotes(second.organizationId)).toHaveLength(0);
    });

    it("any other refusal of an update is an operator's note, once, however often it is asked", async () => {
        const { organizationId } = await signUp();
        await runSync(organizationId);
        const refused = () =>
            new BillingProviderError(
                "REFUSED",
                "Razorpay customer update failed (HTTP 400)",
            );
        const job = { ...(await syncJobs(organizationId))[0]! };
        fake.customers.failNext = refused();
        await expect(handler.handle(job)).resolves.toBeUndefined();
        fake.customers.failNext = refused();
        await expect(handler.handle(job)).resolves.toBeUndefined();
        const told = await opsNotes(organizationId);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain("refused this business's customer");
        expect(await row(organizationId)).toMatchObject({
            lastError: "Razorpay customer update failed (HTTP 400)",
        });
    });

    it("sends the profile's GSTIN only while the business says it is GST-registered, as its invoice does", async () => {
        const { organizationId } = await signUp();
        await prisma.businessProfile.update({
            where: { organizationId },
            data: { taxId: "29ABCDE1234F1ZW", gstRegistered: false },
        });
        expect((await billingCustomerOf(organizationId)).gstin).toBeNull();
        await prisma.businessProfile.update({
            where: { organizationId },
            data: { gstRegistered: true },
        });
        expect((await billingCustomerOf(organizationId)).gstin).toBe(
            "29ABCDE1234F1ZW",
        );
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
                    completedAt: at,
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

    it("a provider that can't make the customer stops the checkout before anything is made there; a refusal goes on without one", async () => {
        const { organizationId, userId } = await signUp();
        const before = fake.createCalls.length;
        fake.customers.failNext = new BillingProviderError(
            "UNKNOWN",
            "Razorpay customer creation failed (HTTP 503)",
        );
        await expect(
            paidCheckout(organizationId, userId),
        ).rejects.toMatchObject({
            status: 503,
        });
        expect(fake.createCalls).toHaveLength(before);
        expect(
            await prisma.billingCheckout.count({ where: { organizationId } }),
        ).toBe(0);

        fake.customers.failNext = new BillingProviderError(
            "REFUSED",
            "Razorpay customer skipped: no usable name",
        );
        const r = await paidCheckout(organizationId, userId);
        expect(r.kind).not.toBe("TO_FREE");
        expect(fake.createCalls.at(-1)?.providerCustomerId ?? null).toBeNull();
    });

    /** A business on a paid plan from before DEC-165: Razorpay's customer. */
    async function paidBefore(organizationId: string, customerId: string) {
        const plan = await prisma.plan.findFirstOrThrow({
            where: { priceCents: { gt: 0 } },
        });
        const data = {
            planId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: uniq("sub_before_"),
            providerCustomerId: customerId,
        };
        await prisma.subscription.upsert({
            where: { organizationId },
            create: { organizationId, ...data },
            update: data,
        });
    }

    it("a business that paid before DEC-165 keeps the customer Razorpay made at its payment: adopted, brought up to date", async () => {
        const { organizationId } = await signUp();
        await paidBefore(organizationId, "cust_paid_before");
        fake.customers.addCustomer("cust_paid_before", null);
        await runSync(organizationId);
        expect(fake.customers.created).toHaveLength(0);
        expect(fake.customers.looked).toEqual(["cust_paid_before"]);
        expect(await row(organizationId)).toMatchObject({
            providerCustomerId: "cust_paid_before",
            contactWithheld: false,
        });
        expect(fake.customers.updated).toEqual([
            expect.objectContaining({
                providerCustomerId: "cust_paid_before",
                withContact: true,
                input: expect.objectContaining({ organizationId }),
            }),
        ]);
    });

    it("an earlier customer the provider no longer has, or another business holds, is not adopted", async () => {
        const gone = await signUp();
        await paidBefore(gone.organizationId, "cust_deleted");
        await runSync(gone.organizationId);
        expect((await row(gone.organizationId))?.providerCustomerId).toBe(
            `fake_cus_${gone.organizationId}`,
        );

        // Razorpay reused one customer for an owner's two businesses.
        const first = await signUp();
        await runSync(first.organizationId);
        const shared = `fake_cus_${first.organizationId}`;
        const second = await signUp();
        await paidBefore(second.organizationId, shared);
        await runSync(second.organizationId);
        expect((await row(second.organizationId))?.providerCustomerId).not.toBe(
            shared,
        );
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
