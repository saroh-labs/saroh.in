/**
 * The site's checkout offering payment at the handover (the owner's rule of
 * 2026-10-06: online needs a paid plan, Free takes money offline):
 *
 * - on a plan without online payments, the bag offers only "Pay when you
 *   collect" / "Pay on delivery", never a shipment, and placing it makes
 *   the unpaid order with nothing to pay now;
 * - on a paid plan with the storefront's switch off, online only;
 * - with it on, both, online first.
 *
 * The service runs with its collaborators mocked: the bag's pricing, the
 * order's write (`offline-checkout-order.spec.ts` has its own) and the
 * database. `planMeter` is spied on. Rows and amounts are made up.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        runInOrgContext: jest.fn((_org: string, cb: () => unknown) => cb()),
        prisma: {
            site: { findFirst: jest.fn() },
            customerAccount: { findFirst: jest.fn() },
            customer: { findMany: jest.fn() },
            order: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
            storeSettings: { findUnique: jest.fn() },
            merchantPaymentProvider: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
        },
    };
});

jest.mock("../sites/sells-from", () => ({
    shopRolloutOn: jest.fn().mockResolvedValue(true),
    commerceOpen: jest.fn().mockResolvedValue(true),
    effectiveStorefront: jest
        .fn()
        .mockResolvedValue({ id: "store_1", name: "Hill Road" }),
}));

jest.mock("../organizations/organization-lifecycle.gate", () => ({
    assertOrganizationOpen: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./checkout-bag", () => ({
    priceBag: jest.fn(),
    shopSettings: jest.fn(),
}));

jest.mock("./checkout-order", () => ({
    createCheckoutOrder: jest.fn().mockResolvedValue("order_1"),
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
import type { PaymentsService } from "../payments/payments.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { priceBag, shopSettings } from "./checkout-bag";
import { createCheckoutOrder } from "./checkout-order";
import type { CheckoutStartDto } from "./checkout.dto";
import { PublicCheckoutService } from "./public-checkout.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    customerAccount: { findFirst: jest.Mock };
    customer: { findMany: jest.Mock };
    order: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    storeSettings: { findUnique: jest.Mock };
    merchantPaymentProvider: { findFirst: jest.Mock; findMany: jest.Mock };
};

const customer = {
    siteId: "site_1",
    organizationId: "org_1",
    accountId: "acc_1",
} as CustomerContext;

const intent = { provider: "RAZORPAY", amountCents: 50_000 };
const createIntent = jest.fn().mockResolvedValue(intent);
const service = new PublicCheckoutService({
    createIntentForOnlineOrder: createIntent,
} as unknown as PaymentsService);

function start(payment?: "ONLINE" | "ON_HANDOVER", fulfilment = "PICKUP") {
    return service.start("site_1", customer, "hash_1", {
        lines: [{ listingId: "listing_1", quantity: 2 }],
        fulfilment,
        key: "key-12345678",
        ...(payment ? { payment } : {}),
    } as CheckoutStartDto);
}

function onPlan(plan: "free" | "grow", payOnHandoverSwitch = false) {
    jest.spyOn(planMeter, "enforcedRow").mockResolvedValue(
        fakePaymentsRow(plan, "payments"),
    );
    db.storeSettings.findUnique.mockResolvedValue({
        pausedAt: null,
        offerPayOnHandover: payOnHandoverSwitch,
        checkoutProvider: null,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findFirst.mockResolvedValue({
        organizationId: "org_1",
        storefrontId: "store_1",
    });
    db.customerAccount.findFirst.mockResolvedValue({
        email: "asha@example.com",
        contactId: "contact_1",
        contact: { firstName: "Asha", lastName: null },
    });
    db.customer.findMany.mockResolvedValue([{ id: "cust_1" }]);
    db.order.findUnique.mockResolvedValue(null);
    db.order.findUniqueOrThrow.mockResolvedValue({
        orderId: "ORD-101",
        total: "500.00",
        currency: "INR",
    });
    const connection = {
        id: "mpp_1",
        provider: "RAZORPAY",
        status: "CONNECTED",
        publicKey: "rzp_key",
    };
    db.merchantPaymentProvider.findFirst.mockResolvedValue(connection);
    db.merchantPaymentProvider.findMany.mockResolvedValue([connection]);
    (shopSettings as jest.Mock).mockResolvedValue({
        currency: "INR",
        ways: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
        fees: { localDeliveryFee: null, shippingFee: null },
    });
    (priceBag as jest.Mock).mockImplementation(
        (_scope: unknown, _bag: unknown, asked: string | null) =>
            Promise.resolve({
                quote: {
                    currency: "INR",
                    lines: [],
                    ways: [],
                    fulfilment: asked ?? "PICKUP",
                    subtotal: "500.00",
                    delivery: "0.00",
                    total: "500.00",
                    ready: true,
                },
                lines: [
                    {
                        listingId: "listing_1",
                        productId: "product_1",
                        fulfilmentTypes: [],
                    },
                ],
                settings: {
                    currency: "INR",
                    ways: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
                    fees: { localDeliveryFee: null, shippingFee: null },
                },
            }),
    );
});

afterEach(() => jest.restoreAllMocks());

describe("Free takes money offline", () => {
    it("offers orders, paid at the handover, never shipped", async () => {
        onPlan("free");

        const options = await service.options("site_1", "hash_1");
        expect(options.canOrder).toBe(true);
        expect(options.payments).toEqual({ online: false, onHandover: true });
        expect(options.ways.map((w) => w.type)).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
        ]);
    });

    it("prices the bag with only paying at the handover", async () => {
        onPlan("free");

        const quote = await service.quote(
            "site_1",
            { lines: [{ listingId: "listing_1", quantity: 2 }] },
            "hash_1",
        );
        expect(quote.payments).toEqual([
            { type: "ON_HANDOVER", label: "Pay when you collect" },
        ]);
        // Its ways are kept to those it can be paid for.
        expect((priceBag as jest.Mock).mock.calls[0][3]).toEqual({
            online: false,
            onHandover: true,
        });
    });

    it("places the unpaid order, with nothing to pay now", async () => {
        onPlan("free");

        await expect(start("ON_HANDOVER")).resolves.toEqual({
            orderId: "order_1",
            orderNumber: "ORD-101",
            total: "500.00",
            currency: "INR",
            payBy: "ON_HANDOVER",
            payment: null,
        });
        expect(createCheckoutOrder).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ accountId: "acc_1" }),
            expect.objectContaining({ type: "PICKUP", payOnHandover: true }),
        );
        expect(createIntent).not.toHaveBeenCalled();
    });

    it("refuses paying online, and makes nothing", async () => {
        onPlan("free");

        for (const payment of ["ONLINE", undefined] as const) {
            await expect(start(payment)).rejects.toBeInstanceOf(
                ConflictException,
            );
        }
        expect(createCheckoutOrder).not.toHaveBeenCalled();
        expect(createIntent).not.toHaveBeenCalled();
    });

    it("gives the same order back for the same key", async () => {
        onPlan("free");
        db.order.findUnique.mockResolvedValue({
            id: "order_1",
            payOnHandover: true,
            customer: { email: "ASHA@example.com" },
        });

        await expect(start("ON_HANDOVER")).resolves.toMatchObject({
            orderId: "order_1",
            payBy: "ON_HANDOVER",
            payment: null,
        });
        expect(createCheckoutOrder).not.toHaveBeenCalled();
    });
});

describe("a paid plan", () => {
    it("pays online only with the switch off", async () => {
        onPlan("grow");

        const quote = await service.quote(
            "site_1",
            {
                lines: [{ listingId: "listing_1", quantity: 2 }],
                fulfilment: "PICKUP",
            },
            "hash_1",
        );
        expect(quote.payments).toEqual([
            { type: "ONLINE", label: "Pay online" },
        ]);
        await expect(start("ON_HANDOVER")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(createCheckoutOrder).not.toHaveBeenCalled();
    });

    it("offers both with the switch on, and pays online as before", async () => {
        onPlan("grow", true);

        const quote = await service.quote(
            "site_1",
            {
                lines: [{ listingId: "listing_1", quantity: 2 }],
                fulfilment: "LOCAL_DELIVERY",
            },
            "hash_1",
        );
        expect(quote.payments).toEqual([
            { type: "ONLINE", label: "Pay online" },
            { type: "ON_HANDOVER", label: "Pay on delivery" },
        ]);

        await expect(start("ONLINE")).resolves.toMatchObject({
            payBy: "ONLINE",
            payment: intent,
        });
        expect(createCheckoutOrder).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ payOnHandover: false }),
        );
        expect(createIntent).toHaveBeenCalled();
    });
});
