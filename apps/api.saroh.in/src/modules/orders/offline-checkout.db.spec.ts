/**
 * Paying at the handover at the site's checkout against a real Postgres
 * (the owner's rule of 2026-10-06: online needs a paid plan, Free takes
 * money offline):
 *
 * - On a plan without online payments the shop takes orders, paid "when
 *   you collect" or "on delivery", never shipped and never online. The
 *   order is made unpaid and real at once, as a staff pay-later order is:
 *   it promises its units, shows in Orders, counts on the month's orders,
 *   is never closed as an abandoned checkout, and gets its invoice when
 *   staff mark it paid (DEC-023).
 * - On a paid plan it pays online only, unless the storefront turns paying
 *   at the handover on; then both.
 *
 * The service runs as the API builds it, with the fake provider;
 * `planMeter` reads the real switch, turned on per business (an override).
 * Catalogue rows are made up (`fakePaymentsCatalog`). Runs in the
 * integration project (TEST_DATABASE_URL), plain and RLS.
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        ...actual,
        env: {
            ...actual.env,
            PAYMENTS_ENC_KEY:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
    };
});

import { ConflictException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakePaymentsCatalog } from "../../../test/fixtures/pricing-catalog";
import { countUsage } from "../billing/metering";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { encryptSecret } from "../payments/crypto";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { StoresService } from "../stores/stores.service";
import type { CheckoutStartDto } from "./checkout.dto";
import {
    CLOSE_ABANDONED_CHECKOUT_TYPE,
    closeCheckoutInTx,
} from "./online-checkout";
import { realOrderWhere } from "./open-orders";
import { OrdersService } from "./orders.service";
import { PublicCheckoutService } from "./public-checkout.service";

const tag = `${process.pid}-${Date.now()}`;
const V = 840_000 + Math.floor(Math.random() * 9_000);
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const service = new PublicCheckoutService(
    payments,
    new FixedWindowRateLimiter(1_000),
    new FixedWindowRateLimiter(1_000),
);
const orders = new OrdersService(new StoresService(new FeatureFlagService()));

interface Shop {
    organizationId: string;
    ownerId: string;
    storeId: string;
    siteId: string;
    listingId: string;
    productId: string;
    customer: CustomerContext;
}

/**
 * A business on `planId` whose site sells Sourdough (made-up price, 3 on
 * the shelf) from "Online": Pick-up, Local delivery and Shipping. Razorpay
 * connected when asked; the storefront's pay-at-the-handover switch as
 * given. One signed-in site account.
 */
async function shop(
    planId: "free" | "grow",
    over: { provider?: boolean; offerPayOnHandover?: boolean } = {},
): Promise<Shop> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("offline") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    for (const flagKey of [FlagKey.PLAN_ENFORCEMENT, "SITE_SHOP"]) {
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    await giveBusinessDetails(org.id);

    const store = await prisma.store.create({
        data: { name: "Online", slug: uniq("store"), organizationId: org.id },
    });
    // The creator owns the storefront, as creating one in the app records.
    await prisma.storeOwner.create({
        data: { storeId: store.id, userId: owner.id },
    });
    await prisma.storeSettings.create({
        data: {
            storeId: store.id,
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
            collectionEnabled: true,
            shippingEnabled: true,
            offerPayOnHandover: over.offerPayOnHandover ?? false,
        },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Sourdough",
            slug: uniq("sourdough"),
            price: "250.00",
            currency: "INR",
            status: "PUBLISHED",
            stockTracked: true,
        },
    });
    const listing = await prisma.productListing.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            productId: product.id,
        },
    });
    await prisma.stockLevel.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            productId: product.id,
            variantId: null,
            onHand: 3,
            promised: 0,
            lowStockAlert: 0,
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: uniq("site"),
            subdomain: `off${seq}x${process.pid}`,
            storefrontId: store.id,
        },
    });
    if (over.provider) {
        const sealed = encryptSecret(
            JSON.stringify({ keyId: "rzp_test_Off1", keySecret: "secret" }),
        );
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: org.id,
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: "rzp_test_Off1",
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            },
        });
    }
    const email = `${uniq("asha")}@example.in`;
    const contact = await prisma.contact.create({
        data: { organizationId: org.id, email, firstName: "Asha" },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: org.id,
            contactId: contact.id,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return {
        organizationId: org.id,
        ownerId: owner.id,
        storeId: store.id,
        siteId: site.id,
        listingId: listing.id,
        productId: product.id,
        customer: {
            organizationId: org.id,
            siteId: site.id,
            accountId: account.id,
            contactId: contact.id,
            sessionId: "session_1",
        },
    };
}

function start(
    s: Shop,
    over: Partial<{ payment: string; fulfilment: string }> = {},
    quantity = 2,
) {
    return service.start(s.siteId, s.customer, uniq("hash"), {
        lines: [{ listingId: s.listingId, quantity }],
        fulfilment: "PICKUP",
        key: uniq("key")
            .replace(/[^A-Za-z0-9_-]/g, "_")
            .slice(0, 64),
        ...over,
    } as CheckoutStartDto);
}

async function promised(s: Shop): Promise<number> {
    const row = await prisma.stockLevel.findFirstOrThrow({
        where: { storeId: s.storeId, productId: s.productId, variantId: null },
        select: { promised: true },
    });
    return row.promised;
}

beforeAll(async () => {
    const catalog = fakePaymentsCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * 60_000),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
    for (const key of [FlagKey.PLAN_ENFORCEMENT, "SITE_SHOP"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: {},
        });
    }
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("Free takes money offline (DB)", () => {
    it("takes orders paid at the handover, never shipped, with no provider", async () => {
        const s = await shop("free");

        const options = await service.options(s.siteId, uniq("visitor"));
        expect(options).toMatchObject({
            canOrder: true,
            payments: { online: false, onHandover: true },
        });
        expect(options.ways.map((w) => w.type)).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
        ]);

        const quote = await service.quote(
            s.siteId,
            {
                lines: [{ listingId: s.listingId, quantity: 2 }],
                fulfilment: "LOCAL_DELIVERY",
            },
            uniq("visitor"),
        );
        expect(quote.payments).toEqual([
            { type: "ON_HANDOVER", label: "Pay on delivery" },
        ]);
    });

    it("makes a real unpaid order that promises its units, counts, and is invoiced when marked paid", async () => {
        const s = await shop("free");

        const started = await start(s, { payment: "ON_HANDOVER" });
        expect(started).toMatchObject({ payBy: "ON_HANDOVER", payment: null });

        const order = await prisma.order.findUniqueOrThrow({
            where: { id: started.orderId },
        });
        expect(order).toMatchObject({
            placedOnline: true,
            payOnHandover: true,
            paymentStatus: "UNPAID",
            status: "PENDING",
            customerAccountId: s.customer.accountId,
        });
        // Promised at once, as a staff pay-later order's units are.
        expect(await promised(s)).toBe(2);
        // A real order: in Orders, and on the month's count.
        expect(
            await prisma.order.count({
                where: {
                    id: order.id,
                    organizationId: s.organizationId,
                    ...realOrderWhere(),
                },
            }),
        ).toBe(1);
        expect(
            await countUsage(prisma, s.organizationId, "ordersPerMonth"),
        ).toBe(1);
        // Never closed as an abandoned checkout.
        expect(
            await prisma.job.count({
                where: {
                    type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                    organizationId: s.organizationId,
                },
            }),
        ).toBe(0);
        await expect(
            prisma.$transaction((tx) =>
                closeCheckoutInTx(tx, order.id, "Checkout not completed"),
            ),
        ).resolves.toBe(false);
        // No invoice until it is paid (DEC-023, as a pay-later order).
        expect(
            await prisma.invoice.count({ where: { orderId: order.id } }),
        ).toBe(0);

        await orders.updateStatus(s.storeId, order.id, s.ownerId, {
            paymentStatus: "PAID",
        });
        expect(
            await prisma.invoice.count({ where: { orderId: order.id } }),
        ).toBe(1);
    });

    it("refuses paying online, or a shipment, and makes nothing", async () => {
        const s = await shop("free");

        await expect(start(s)).rejects.toBeInstanceOf(ConflictException);
        await expect(start(s, { payment: "ONLINE" })).rejects.toBeInstanceOf(
            ConflictException,
        );
        await expect(
            start(s, { payment: "ON_HANDOVER", fulfilment: "SHIPPING" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(0);
        expect(await promised(s)).toBe(0);
    });

    it("refuses the last units gone meanwhile, and makes nothing", async () => {
        const s = await shop("free");
        await start(s, { payment: "ON_HANDOVER" }); // 2 of 3 promised

        await expect(
            start(s, { payment: "ON_HANDOVER" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(1);
    });
});

describe("a paid plan (DB)", () => {
    it("pays online only with the storefront's switch off", async () => {
        const s = await shop("grow", { provider: true });

        const options = await service.options(s.siteId, uniq("visitor"));
        expect(options.payments).toEqual({ online: true, onHandover: false });
        await expect(
            start(s, { payment: "ON_HANDOVER" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(0);
    });

    it("offers both with the switch on, and takes either", async () => {
        const s = await shop("grow", {
            provider: true,
            offerPayOnHandover: true,
        });

        const quote = await service.quote(
            s.siteId,
            {
                lines: [{ listingId: s.listingId, quantity: 1 }],
                fulfilment: "PICKUP",
            },
            uniq("visitor"),
        );
        expect(quote.payments).toEqual([
            { type: "ONLINE", label: "Pay online" },
            { type: "ON_HANDOVER", label: "Pay when you collect" },
        ]);

        const offline = await start(s, { payment: "ON_HANDOVER" });
        expect(offline.payment).toBeNull();
        // One left on the shelf to sell.
        const online = await start(s, { payment: "ONLINE" }, 1);
        expect(online.payBy).toBe("ONLINE");
        expect(online.payment).not.toBeNull();
        // The online checkout holds nothing yet; the other still does.
        expect(await promised(s)).toBe(2);
        // A new online checkout never replaces the order paid at the handover.
        expect(
            (
                await prisma.order.findUniqueOrThrow({
                    where: { id: offline.orderId },
                })
            ).status,
        ).toBe("PENDING");
    });
});
