// DB-free unit tests for `payOnline` on an order's pay page (R33, 6 Oct
// 2026): a link made before a downgrade still opens, but view-only. The
// plan check, the Payments switch and the storefront's provider are each
// asked; any one off turns Pay off. Then the read itself carries it.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

const plan = { takes: true };
jest.mock("../billing/online-payments-plan", () => ({
    ...jest.requireActual("../billing/online-payments-plan"),
    planTakesOnlinePayment: jest.fn(() => Promise.resolve(plan.takes)),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
        prisma: {
            order: { findUnique: jest.fn(), findFirst: jest.fn() },
            site: { findFirst: jest.fn().mockResolvedValue(null) },
            organizationModule: { findFirst: jest.fn() },
            merchantPaymentProvider: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
            },
            storeSettings: { findUnique: jest.fn() },
        },
    };
});
jest.mock("../invoices/pay-link-url", () => ({
    orderPayLinkUrlFor: jest.fn(
        (_org: string, token: string) => `https://saroh.app/pay/o/${token}`,
    ),
}));

import { prisma } from "@saroh/database";

import { orderPayOnline } from "./order-pay-online";
import type { PaymentsService } from "./payments.service";
import { PublicOrderPayService } from "./public-order-pay.service";

const db = prisma as unknown as {
    order: { findUnique: jest.Mock; findFirst: jest.Mock };
    organizationModule: { findFirst: jest.Mock };
    merchantPaymentProvider: { findFirst: jest.Mock; findUnique: jest.Mock };
    storeSettings: { findUnique: jest.Mock };
};

const PROVIDER = {
    id: "p1",
    provider: "RAZORPAY",
    status: "CONNECTED",
    publicKey: "rzp_test_key",
};

beforeEach(() => {
    plan.takes = true;
    // Payments on (no row switching it off), no storefront pin, and a
    // connected provider that opens the checkout window.
    db.organizationModule.findFirst.mockResolvedValue(null);
    db.storeSettings.findUnique.mockResolvedValue({ checkoutProvider: null });
    db.merchantPaymentProvider.findFirst.mockResolvedValue(PROVIDER);
    db.merchantPaymentProvider.findUnique.mockResolvedValue(PROVIDER);
});

describe("orderPayOnline", () => {
    it("is yes on a plan with online payments, Payments on and a provider", async () => {
        await expect(orderPayOnline(prisma, "org1", "s1")).resolves.toBe(true);
    });

    it("is no on a plan without online payments, provider or not", async () => {
        plan.takes = false;
        await expect(orderPayOnline(prisma, "org1", "s1")).resolves.toBe(false);
    });

    it("is no with Payments switched off", async () => {
        db.organizationModule.findFirst.mockResolvedValue({ id: "m1" });
        await expect(orderPayOnline(prisma, "org1", "s1")).resolves.toBe(false);
    });

    it("is no when no provider can take it, without throwing", async () => {
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        await expect(orderPayOnline(prisma, "org1", "s1")).resolves.toBe(false);
    });
});

describe("the order pay read carries payOnline", () => {
    const service = new PublicOrderPayService({} as PaymentsService);

    beforeEach(() => {
        db.order.findUnique.mockResolvedValue({
            id: "o1",
            organizationId: "org1",
        });
        db.order.findFirst.mockResolvedValue({
            id: "o1",
            organizationId: "org1",
            storeId: "s1",
            orderId: "1042",
            status: "PENDING",
            paymentStatus: "UNPAID",
            placedOnline: false,
            total: "500.00",
            currency: "INR",
            store: { settings: { pausedAt: null } },
            paymentIntents: [],
            organization: { name: "Northwind" },
            customer: { firstName: "Asha" },
            walkInName: null,
            items: [],
        });
    });

    it("offers Pay on a plan with online payments", async () => {
        const view = await service.read("tok-on", "caller-on");
        expect(view.payOnline).toBe(true);
        expect(view.status).toBe("DUE");
    });

    it("is view-only for a link made before a downgrade", async () => {
        plan.takes = false;
        const view = await service.read("tok-off", "caller-off");
        expect(view.payOnline).toBe(false);
        // Still the order and what's due: the page shows it, without Pay.
        expect(view.status).toBe("DUE");
        expect(view.due).toBe("500.00");
    });
});
