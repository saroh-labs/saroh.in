/**
 * One customer per billing profile at Saroh's billing provider (DEC-167,
 * replacing DEC-165's one per business), against a real Postgres through
 * the fake billing provider (no Razorpay call is ever made):
 *
 * - the profile's job makes the customer once, and a profile whose email
 *   and phone another customer has is made without the phone, never
 *   handed the other's;
 * - a provider that can't answer is retried; a refusal is not, and is an
 *   operator's note once on each business billed to the profile;
 * - a customer made before profiles (at a payment, or per business) is
 *   adopted when it is one of the profile's businesses';
 * - DEC-165's queued `billing.customer.sync` jobs sync the business's
 *   profile;
 * - a checkout uses the profile's customer, and makes it only when missing.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import {
    BillingCustomerSyncHandler,
    BillingProfileSyncHandler,
    profileCustomerOf,
} from "./billing-customer";
import {
    BILLING_CUSTOMER_SYNC_TYPE,
    enqueueBillingCustomerSync,
} from "./billing-customer-sync";
import { BILLING_NOTE_AUTHOR } from "./billing-ops-notice";
import {
    BILLING_PROFILE_SYNC_TYPE,
    enqueueBillingProfileSync,
} from "./billing-profile-sync";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import { BillingProviderError } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const DAY = 24 * 60 * 60 * 1000;

let fake: FakeBillingProvider;
let handler: BillingProfileSyncHandler;
let oldHandler: BillingCustomerSyncHandler;
let checkout: CheckoutService;

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeEach(async () => {
    fake = new FakeBillingProvider();
    const factory = new FakeBillingProviderFactory(fake);
    handler = new BillingProfileSyncHandler(factory);
    oldHandler = new BillingCustomerSyncHandler(factory);
    checkout = new CheckoutService(new PlansService(), factory);
    await prisma.job.deleteMany({});
    await prisma.adminOrganizationNote.deleteMany({
        where: { authorUserId: BILLING_NOTE_AUTHOR },
    });
});

const opsNotes = (organizationId: string) =>
    prisma.adminOrganizationNote.findMany({
        where: { organizationId, authorUserId: BILLING_NOTE_AUTHOR },
    });

/** A profile of its own owner, and a business billed to it. */
async function profile(
    over: {
        ownerUserId?: string;
        billingEmail?: string;
        phone?: string | null;
    } = {},
) {
    const ownerUserId =
        over.ownerUserId ??
        (
            await prisma.user.create({
                data: { email: `${uniq("owner-")}@example.com`, name: "Asha" },
            })
        ).id;
    const made = await prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName: "Asha Foods LLP",
            gstin: "29ABCDE1234F1ZW",
            gstState: "29",
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            billingEmail: over.billingEmail ?? `${uniq("bill-")}@example.com`,
            phone: over.phone === undefined ? "+919800000000" : over.phone,
            provider: "RAZORPAY",
        },
    });
    const org = await business(made.id);
    await prisma.$transaction((tx) => enqueueBillingProfileSync(tx, made.id));
    return { billingProfileId: made.id, ownerUserId, organizationId: org.id };
}

function business(billingProfileId: string | null, name = "Asha's Kitchen") {
    return prisma.organization.create({
        data: { name, slug: uniq("asha-"), billingProfileId },
    });
}

const syncJobs = (billingProfileId: string) =>
    prisma.job.findMany({
        where: {
            type: BILLING_PROFILE_SYNC_TYPE,
            payload: { path: ["billingProfileId"], equals: billingProfileId },
        },
    });

async function job(billingProfileId: string) {
    const [one] = await syncJobs(billingProfileId);
    if (!one) throw new Error("no sync queued");
    return one;
}

const row = (billingProfileId: string) =>
    prisma.billingProfile.findUniqueOrThrow({
        where: { id: billingProfileId },
    });

describe("one customer per billing profile (DEC-167)", () => {
    it("the job makes the customer once, with the profile's details and notes", async () => {
        const p = await profile();
        await handler.handle(await job(p.billingProfileId));
        await handler.handle(await job(p.billingProfileId));
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.created[0]).toMatchObject({
            withContact: true,
            input: {
                billingProfileId: p.billingProfileId,
                ownerUserId: p.ownerUserId,
                name: "Asha Foods LLP",
                businessName: "Asha's Kitchen",
                gstin: "29ABCDE1234F1ZW",
                address: { state: "Karnataka", postalCode: "560038" },
            },
        });
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
            contactWithheld: false,
            lastError: null,
        });
    });

    it("a profile whose email and phone another customer has (another owner billing the same person): made without the phone", async () => {
        const email = `${uniq("same-")}@example.com`;
        const first = await profile({ billingEmail: email });
        await handler.handle(await job(first.billingProfileId));
        const second = await profile({ billingEmail: email });
        await handler.handle(await job(second.billingProfileId));
        expect(await row(second.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${second.billingProfileId}`,
            contactWithheld: true,
        });
        expect(fake.customers.created.at(-1)).toMatchObject({
            withContact: false,
            input: { billingProfileId: second.billingProfileId },
        });
    });

    it("details saved since that are another customer's email and phone: sent without the phone, withheld from then on", async () => {
        const email = `${uniq("move-")}@example.com`;
        const first = await profile({ billingEmail: email });
        await handler.handle(await job(first.billingProfileId));
        const second = await profile({
            billingEmail: email,
            phone: "+919811111111",
        });
        await handler.handle(await job(second.billingProfileId));
        await prisma.billingProfile.update({
            where: { id: second.billingProfileId },
            data: { phone: "+919800000000" },
        });
        await handler.handle(await job(second.billingProfileId));
        expect(fake.customers.updated.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${second.billingProfileId}`,
            withContact: false,
        });
        expect(await row(second.billingProfileId)).toMatchObject({
            contactWithheld: true,
            lastError: null,
        });
        expect(await opsNotes(second.organizationId)).toHaveLength(0);
    });

    it("with no provider keys nothing is asked and nothing kept", async () => {
        const p = await profile();
        fake.customers.keys = false;
        await handler.handle(await job(p.billingProfileId));
        expect(fake.customers.created).toHaveLength(0);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: null,
            lastError: null,
        });
    });

    it("a job for a profile gone with its owner does nothing", async () => {
        const p = await profile();
        const queued = await job(p.billingProfileId);
        await prisma.user.delete({ where: { id: p.ownerUserId } });
        await expect(handler.handle(queued)).resolves.toBeUndefined();
        expect(fake.customers.created).toHaveLength(0);
    });
});

describe("when the provider fails", () => {
    it("one that can't answer: kept on the profile and retried; the next try makes it", async () => {
        const p = await profile();
        const queued = await job(p.billingProfileId);
        fake.customers.failNext = new BillingProviderError(
            "UNKNOWN",
            "network error",
        );
        await expect(handler.handle(queued)).rejects.toThrow("network error");
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: null,
            lastError: "network error",
        });
        await handler.handle(queued);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
            lastError: null,
        });
    });

    it("a refusal is not retried, and is one operator's note on each business on the profile, however often asked", async () => {
        const p = await profile();
        const other = await business(p.billingProfileId, "Asha's Bakery");
        await handler.handle(await job(p.billingProfileId));
        const refused = () =>
            new BillingProviderError(
                "REFUSED",
                "Razorpay customer update failed (HTTP 400)",
            );
        const queued = await job(p.billingProfileId);
        fake.customers.failNext = refused();
        await expect(handler.handle(queued)).resolves.toBeUndefined();
        fake.customers.failNext = refused();
        await expect(handler.handle(queued)).resolves.toBeUndefined();
        for (const organizationId of [p.organizationId, other.id]) {
            const told = await opsNotes(organizationId);
            expect(told).toHaveLength(1);
            expect(told[0]!.body).toContain(
                "refused the details of the billing profile",
            );
        }
        expect(await row(p.billingProfileId)).toMatchObject({
            lastError: "Razorpay customer update failed (HTTP 400)",
        });
    });

    it("a create whose answer was lost: the next try finds its own customer by its notes, never makes a second", async () => {
        const p = await profile();
        const queued = await job(p.billingProfileId);
        fake.customers.loseNextAnswer = true;
        await expect(handler.handle(queued)).rejects.toThrow("network error");
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: null,
        });
        await handler.handle(queued);
        expect(fake.customers.created).toHaveLength(1);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
            contactWithheld: false,
            lastError: null,
        });
        // Adopted, then brought up to date.
        expect(fake.customers.updated.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
            withContact: true,
        });
    });
});

describe("customers made before profiles are kept", () => {
    /** A business on a paid plan from before DEC-165: Razorpay's customer. */
    async function paidBefore(organizationId: string, customerId: string) {
        const plan = await prisma.plan.upsert({
            where: {
                key_version_interval: {
                    key: "test.paid-before",
                    version: 1,
                    interval: "month",
                },
            },
            create: {
                key: "test.paid-before",
                name: "Paid before",
                priceCents: 99_900,
                entitlements: {},
            },
            update: {},
        });
        await prisma.subscription.upsert({
            where: { organizationId },
            create: {
                organizationId,
                planId: plan.id,
                status: "ACTIVE",
                provider: "RAZORPAY",
                providerSubscriptionId: uniq("sub_before_"),
                providerCustomerId: customerId,
            },
            update: { providerCustomerId: customerId },
        });
    }

    it("one Razorpay made at a payment of a business on the profile: adopted, brought up to date", async () => {
        const p = await profile();
        const customer = uniq("cust_paid_before_");
        await paidBefore(p.organizationId, customer);
        fake.customers.addCustomer(customer);
        await handler.handle(await job(p.billingProfileId));
        expect(fake.customers.created).toHaveLength(0);
        expect(fake.customers.looked).toEqual([customer]);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: customer,
        });
        expect(fake.customers.updated).toEqual([
            expect.objectContaining({
                providerCustomerId: customer,
                withContact: true,
            }),
        ]);
    });

    it("one the provider no longer has, or another profile holds, is not adopted", async () => {
        const gone = await profile();
        await paidBefore(gone.organizationId, uniq("cust_deleted_"));
        await handler.handle(await job(gone.billingProfileId));
        expect((await row(gone.billingProfileId)).providerCustomerId).toBe(
            `fake_cus_${gone.billingProfileId}`,
        );

        const first = await profile();
        await handler.handle(await job(first.billingProfileId));
        const shared = `fake_cus_${first.billingProfileId}`;
        const second = await profile();
        await paidBefore(second.organizationId, shared);
        await handler.handle(await job(second.billingProfileId));
        expect(
            (await row(second.billingProfileId)).providerCustomerId,
        ).not.toBe(shared);
    });

    it("one made for a business on the profile (DEC-165) with the same email and phone: adopted by its organizationId note", async () => {
        const p = await profile();
        const customer = uniq("cust_dec165_");
        fake.customers.addCustomer(
            customer,
            { organizationId: p.organizationId },
            {
                email: (await row(p.billingProfileId)).billingEmail,
                contact: "+919800000000",
            },
        );
        await handler.handle(await job(p.billingProfileId));
        expect(fake.customers.created).toHaveLength(0);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: customer,
            contactWithheld: false,
        });
    });

    it("one made for a business on no profile of this one is not taken: made without the phone", async () => {
        const p = await profile();
        const elsewhere = await business(null);
        fake.customers.addCustomer(
            uniq("cust_other_"),
            { organizationId: elsewhere.id },
            {
                email: (await row(p.billingProfileId)).billingEmail,
                contact: "+919800000000",
            },
        );
        await handler.handle(await job(p.billingProfileId));
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
            contactWithheld: true,
        });
    });
});

describe("DEC-165's billing.customer.sync jobs still queued", () => {
    it("sync the profile the business is billed to", async () => {
        const p = await profile();
        await prisma.job.deleteMany({});
        await prisma.$transaction((tx) =>
            enqueueBillingCustomerSync(tx, p.organizationId),
        );
        const [old] = await prisma.job.findMany({
            where: { type: BILLING_CUSTOMER_SYNC_TYPE },
        });
        await oldHandler.handle(old!);
        expect(fake.customers.created).toHaveLength(1);
        expect(await row(p.billingProfileId)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
        });
    });

    it("do nothing for a business with no profile", async () => {
        const org = await business(null);
        await prisma.$transaction((tx) =>
            enqueueBillingCustomerSync(tx, org.id),
        );
        const [old] = await prisma.job.findMany({
            where: { type: BILLING_CUSTOMER_SYNC_TYPE },
        });
        await expect(oldHandler.handle(old!)).resolves.toBeUndefined();
        expect(fake.customers.created).toHaveLength(0);
    });
});

describe("a checkout uses the profile's customer", () => {
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

    it("the stored one, asking the provider for no other; the profile's sync is queued for what it was given", async () => {
        const p = await profile();
        await prisma.billingProfile.update({
            where: { id: p.billingProfileId },
            data: { providerCustomerId: uniq("cust_stored_") },
        });
        const stored = (await row(p.billingProfileId)).providerCustomerId;
        await prisma.job.deleteMany({});
        const r = await paidCheckout(p.organizationId, p.ownerUserId);
        expect(fake.customers.created).toHaveLength(0);
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: stored,
        });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({ providerCustomerId: stored });
        expect(
            (await syncJobs(p.billingProfileId)).filter(
                (j) => j.status === "PENDING",
            ),
        ).toHaveLength(1);
    });

    it("made now when the profile's job hasn't run, and kept for the job", async () => {
        const p = await profile();
        await paidCheckout(p.organizationId, p.ownerUserId);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${p.billingProfileId}`,
        });
        await handler.handle(await job(p.billingProfileId));
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.updated).toHaveLength(1);
    });

    it("a provider that can't make the customer stops the checkout before anything is made there; a refusal goes on without one", async () => {
        const p = await profile();
        const before = fake.createCalls.length;
        fake.customers.failNext = new BillingProviderError(
            "UNKNOWN",
            "Razorpay customer creation failed (HTTP 503)",
        );
        await expect(
            paidCheckout(p.organizationId, p.ownerUserId),
        ).rejects.toMatchObject({ status: 503 });
        expect(fake.createCalls).toHaveLength(before);
        expect(
            await prisma.billingCheckout.count({
                where: { organizationId: p.organizationId },
            }),
        ).toBe(0);

        fake.customers.failNext = new BillingProviderError(
            "REFUSED",
            "Razorpay customer skipped: no usable name",
        );
        const r = await paidCheckout(p.organizationId, p.ownerUserId);
        expect(r.kind).not.toBe("TO_FREE");
        expect(fake.createCalls.at(-1)?.providerCustomerId ?? null).toBeNull();
    });

    it("with no keys the checkout goes on without one", async () => {
        const p = await profile();
        fake.customers.keys = false;
        const r = await paidCheckout(p.organizationId, p.ownerUserId);
        expect(r.kind).not.toBe("TO_FREE");
        expect(fake.createCalls.at(-1)?.providerCustomerId ?? null).toBeNull();
    });

    it("names the first business on the profile in the customer's notes", async () => {
        const p = await profile();
        await business(p.billingProfileId, "Later Business");
        expect(await profileCustomerOf(p.billingProfileId)).toMatchObject({
            businessName: "Asha's Kitchen",
            email: (await row(p.billingProfileId)).billingEmail,
        });
    });
});
