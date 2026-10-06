/**
 * The plan's say over taking money online (`online-payments-plan.ts`)
 * against a real Postgres: on a plan without online payments, new online
 * payments and new subscriptions stop — no first provider connection, no
 * pay link that charges for the business's own invoice, no site checkout
 * paid online (it takes payment at the handover instead), no booking page
 * or plan join paid online, nobody subscribed — while a
 * subscription the business already has keeps renewing and its renewal
 * invoice stays payable online. Invoicing by hand goes on (DEC-070), and
 * PAYMENTS stays available. With `PLAN_ENFORCEMENT` off, none of it is
 * refused.
 *
 * The services run as the API builds them; `planMeter` reads the real
 * switch, turned on per business (an override). Catalogue rows are made
 * up (`fakePaymentsCatalog`). Runs in the integration project
 * (TEST_DATABASE_URL), plain and RLS.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakePaymentsCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { takesOnlinePayment } from "../bookings/public-booking-page";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import { invoicePayOnline } from "../invoices/pay-online";
import { checkoutReadiness } from "../orders/checkout-readiness";
import { encryptSecret } from "../payments/crypto";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { EntitlementService } from "./entitlement.service";
import { MODULE_LOCKED } from "./plan-limit-errors";

const tag = `${process.pid}-${Date.now()}`;
const V = 830_000 + Math.floor(Math.random() * 9_000);
const MINUTE = 60_000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const availability = new ModuleAvailabilityService(
    new FeatureFlagService(),
    new EntitlementService(),
    new ModuleReadinessRegistry(),
);

interface Business {
    orgId: string;
    owner: OrganizationContext;
}

async function planRow(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
}

/** A business on `planId`@V with its owner, its details and the switch. */
async function business(planId: string, enforce = true): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Online pay", slug: uniq("pay") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: (await planRow(planId)).id,
            status: "ACTIVE",
        },
    });
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: enforce,
        },
    });
    await giveBusinessDetails(org.id);
    return {
        orgId: org.id,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

/** Move the business to another plan, as a downgrade does. */
async function moveTo(b: Business, planId: string): Promise<void> {
    await prisma.subscription.updateMany({
        where: { organizationId: b.orgId },
        data: { planId: (await planRow(planId)).id },
    });
}

/** A Razorpay connection that can open the checkout window. */
async function connect(b: Business): Promise<void> {
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "rzp_test_Plan1", keySecret: "plan-secret" }),
    );
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: b.orgId,
            provider: "RAZORPAY",
            status: "CONNECTED",
            publicKey: "rzp_test_Plan1",
            encryptedCredentials: sealed.ciphertext,
            credentialsIv: sealed.iv,
            credentialsAuthTag: sealed.authTag,
        },
    });
}

async function contact(b: Business): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: b.orgId,
                email: `${uniq("member")}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
}

async function membershipPlan(b: Business): Promise<string> {
    return (
        await subscriptions.createPlan(b.owner, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
}

/** Push a subscription's period into the past so it is due now. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

async function locked(p: Promise<unknown>, moduleId: string) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { code: MODULE_LOCKED, moduleId },
    });
}

/** An issued invoice of the business's own, by hand. */
async function ownInvoice(b: Business, contactId: string): Promise<string> {
    const draft = await invoices.createDraft(b.owner, {
        contactId,
        currency: "INR",
        lines: [{ description: "Repair", quantity: 1, unitPrice: "500" }],
    });
    await invoices.issue(b.owner, draft.id);
    return draft.id;
}

beforeAll(async () => {
    const catalog = fakePaymentsCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * MINUTE),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("new online payments on a plan without them (DB)", () => {
    it("refuses connecting a payment provider for the first time", async () => {
        const b = await business("free");

        await locked(
            payments.connectProvider(b.owner, {
                provider: "RAZORPAY",
                keyId: "rzp_test_First1",
                keySecret: "first-secret",
            }),
            "payments",
        );
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: b.orgId },
            }),
        ).toBe(0);
    });

    it("lets a business re-enter the keys of a connection it already has", async () => {
        const b = await business("free");
        await connect(b);

        await expect(
            payments.connectProvider(b.owner, {
                provider: "RAZORPAY",
                keyId: "rzp_test_Again1",
                keySecret: "again-secret",
            }),
        ).resolves.toMatchObject({ publicKey: "rzp_test_Again1" });
    });

    it("takes no pay-online for its own invoice, but invoicing by hand goes on (DEC-070)", async () => {
        const b = await business("free");
        await connect(b);
        const id = await ownInvoice(b, await contact(b));

        await locked(invoices.createPayLink(b.owner, id), "payments");
        // A view link: the same page without a Pay button.
        await expect(
            prisma.$transaction((tx) =>
                invoices.createPayLinkInTx(tx, b.owner, id, {
                    requireProvider: false,
                }),
            ),
        ).resolves.toHaveProperty("token");
        expect(await invoicePayOnline(prisma, b.orgId, null)).toBe(false);
    });

    it("takes no site checkout, booking page or pack paid online", async () => {
        const b = await business("free");
        await connect(b);
        const store = await prisma.store.create({
            data: {
                organizationId: b.orgId,
                name: "Hill Road",
                slug: uniq("s"),
            },
        });

        // The site's checkout still takes orders, paid at the handover
        // (2026-10-06: Free takes money offline) — never online.
        await expect(
            checkoutReadiness(prisma, b.orgId, store.id),
        ).resolves.toEqual({ ok: true, online: false, onHandover: true });
        expect(await takesOnlinePayment(b.orgId)).toBe(false);
    });

    it("leaves PAYMENTS available, so what the business already has stays reachable", async () => {
        const b = await business("free");

        await expect(
            availability.evaluate({
                organizationId: b.orgId,
                moduleKey: "PAYMENTS",
                organizationRole: "OWNER",
            }),
        ).resolves.toMatchObject({ entitled: true });
    });

    it("takes all of it on a plan with online payments", async () => {
        const b = await business("grow");
        await connect(b);
        const id = await ownInvoice(b, await contact(b));

        await expect(
            invoices.createPayLink(b.owner, id),
        ).resolves.toHaveProperty("token");
        expect(await invoicePayOnline(prisma, b.orgId, null)).toBe(true);
        expect(await takesOnlinePayment(b.orgId)).toBe(true);
    });

    it("refuses nothing with PLAN_ENFORCEMENT off", async () => {
        const b = await business("free", false);
        await connect(b);
        const id = await ownInvoice(b, await contact(b));

        await expect(
            invoices.createPayLink(b.owner, id),
        ).resolves.toHaveProperty("token");
        await expect(
            subscriptions.subscribe(b.owner, {
                contactId: await contact(b),
                planId: await membershipPlan(b),
            }),
        ).resolves.toHaveProperty("id");
    });
});

describe("subscriptions on a plan without online payments (DB)", () => {
    it("starts no new one", async () => {
        const b = await business("free");
        await connect(b);
        const planId = await membershipPlan(b);

        await locked(
            subscriptions.subscribe(b.owner, {
                contactId: await contact(b),
                planId,
            }),
            "subscriptions",
        );
        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: b.orgId },
            }),
        ).toBe(0);
    });

    it("keeps renewing one the business already has, and its renewal stays payable online", async () => {
        // Subscribed on a plan with memberships, then moved to one without.
        const b = await business("grow");
        await connect(b);
        const s = await subscriptions.subscribe(b.owner, {
            contactId: await contact(b),
            planId: await membershipPlan(b),
        });
        await moveTo(b, "free");
        await makeDue(s.id);

        await expect(subscriptions.renewOne(s.id, new Date())).resolves.toBe(
            "renewed",
        );
        const issued = await prisma.invoice.findMany({
            where: { subscriptionId: s.id },
            orderBy: { periodStart: "asc" },
        });
        // One from signing up, one from the renewal.
        expect(issued).toHaveLength(2);
        const renewal = issued[1]!;
        expect(renewal.status).toBe("ISSUED");

        // Its pay link and the pay page both still take it online.
        expect(await invoicePayOnline(prisma, b.orgId, renewal)).toBe(true);
        await expect(
            invoices.createPayLink(b.owner, renewal.id),
        ).resolves.toHaveProperty("token");
        // Re-entering the provider's keys is never refused either.
        await expect(
            payments.connectProvider(b.owner, {
                provider: "RAZORPAY",
                keyId: "rzp_test_Keep1",
                keySecret: "keep-secret",
            }),
        ).resolves.toHaveProperty("publicKey");
    });
});
