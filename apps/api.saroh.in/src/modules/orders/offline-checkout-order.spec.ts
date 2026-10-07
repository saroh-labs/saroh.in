/**
 * An order placed at the site's checkout to be paid at the handover ("Pay
 * when you collect", "Pay on delivery"; the owner's rule of 2026-10-06):
 * made as a staff pay-later order is — unpaid, its units promised at once,
 * the team told now, never closed as an abandoned checkout — and counted on
 * the plan's monthly orders, softly (the site never turns a customer away).
 * An online checkout beside it still holds nothing and closes in a day.
 *
 * The database is mocked; the real rows are in `public-checkout.db.spec.ts`.
 * Amounts are made up.
 */
jest.mock("../invoices/order-invoicing", () => ({
    loadTaxProfile: jest.fn().mockResolvedValue({
        registered: false,
        gstin: null,
        state: null,
        prefix: null,
        timezone: null,
        deliveryRateBps: 0,
        deliverySac: null,
    }),
}));

jest.mock("./order-inventory", () => ({
    applyInventoryTransition: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../notifications/uncollected-alert", () => ({
    queueUncollectedAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        customer: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        customerIdentityLink: {
            count: jest.fn(),
            create: jest.fn(),
        },
        order: {
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            findUnique: jest.fn(),
        },
        job: { create: jest.fn() },
        discountRedemption: { count: jest.fn(), create: jest.fn() },
    };
    return {
        ...actual,
        nextOrderNumberInTx: jest.fn().mockResolvedValue("ORD-101"),
        prisma: {
            ...tx,
            $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
            __tx: tx,
        },
    };
});

import { ConflictException, HttpException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { queueUncollectedAlert } from "../notifications/uncollected-alert";
import type { SiteAccount } from "./checkout-order";
import { createCheckoutOrder } from "./checkout-order";
import type { QuotedLine } from "./checkout-quote";
import type { CheckoutStartDto } from "./checkout.dto";
import {
    CLOSE_ABANDONED_CHECKOUT_TYPE,
    PAY_ON_HANDOVER_WAITING,
} from "./online-checkout";
import { applyInventoryTransition } from "./order-inventory";

const db = prisma as unknown as {
    customer: { findFirst: jest.Mock; create: jest.Mock };
    customerIdentityLink: { count: jest.Mock; create: jest.Mock };
    order: {
        findMany: jest.Mock;
        count: jest.Mock;
        create: jest.Mock;
    };
    job: { create: jest.Mock };
    discountRedemption: { count: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
};

const scope = {
    organizationId: "org_1",
    storefront: { id: "store_1", name: "Hill Road" },
};

const account: SiteAccount = {
    accountId: "acc_1",
    email: "asha@example.com",
    contactId: "contact_1",
    firstName: "Asha",
    lastName: "Rao",
};

const line: QuotedLine = {
    listingId: "listing_1",
    variantId: null,
    productId: "product_1",
    categoryId: null,
    slug: "sourdough",
    name: "Sourdough",
    variantTitle: null,
    image: null,
    unitCents: 25_000,
    quantity: 2,
    state: "ok",
    available: 5,
    fulfilmentTypes: [],
};

const dto = {
    lines: [{ listingId: "listing_1", quantity: 2 }],
    fulfilment: "PICKUP",
    key: "key-12345678",
} as CheckoutStartDto;

function place(payOnHandover: boolean) {
    return createCheckoutOrder(scope, account, {
        lines: [line],
        type: "PICKUP",
        shippingCents: 0,
        currency: "INR",
        dto: { ...dto, payment: payOnHandover ? "ON_HANDOVER" : undefined },
        payOnHandover,
    });
}

const PLACED = new Date("2026-10-06T09:00:00.000Z");

let room: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    room = jest.spyOn(planMeter, "roomInTx").mockResolvedValue(null);
    db.customer.findFirst.mockResolvedValue({ id: "cust_1" });
    db.customerIdentityLink.count.mockResolvedValue(1);
    db.order.findMany.mockResolvedValue([]);
    db.order.count.mockResolvedValue(0);
    db.order.create.mockResolvedValue({
        id: "order_1",
        createdAt: PLACED,
        items: [{ id: "item_1" }],
    });
});

afterEach(() => room.mockRestore());

describe("an order paid at the handover", () => {
    it("is made unpaid, marked to be paid on handover, and placed online", async () => {
        await expect(place(true)).resolves.toBe("order_1");

        const data = db.order.create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            placedOnline: true,
            payOnHandover: true,
            customerAccountId: "acc_1",
            total: "500.00",
        });
        // Unpaid: the column defaults, nothing sets it paid.
        expect(data.paymentStatus).toBeUndefined();
        expect(data.paidAt).toBeUndefined();
    });

    it("promises its units at once, as a staff pay-later order does", async () => {
        await place(true);

        expect(applyInventoryTransition).toHaveBeenCalledWith(
            expect.anything(),
            [{ id: "item_1" }],
            "RELEASED",
            "RESERVED",
        );
    });

    it("never closes as an abandoned checkout, and tells the team now", async () => {
        await place(true);

        const types = db.job.create.mock.calls.map(
            (c: [{ data: { type: string } }]) => c[0].data.type,
        );
        expect(types).not.toContain("orders.close-abandoned-checkout");
        expect(enqueueTeamAlert).toHaveBeenCalledWith(
            expect.anything(),
            "org_1",
            { event: "order", orderId: "order_1", actorUserId: null },
        );
    });

    it("tells the customer their order is in, once per order (UX-042)", async () => {
        await place(true);

        expect(db.job.create).toHaveBeenCalledTimes(1);
        expect(db.job.create.mock.calls[0][0].data).toEqual({
            organizationId: "org_1",
            type: "customer.notify",
            payload: {
                kind: "ORDER_PLACED",
                eventKey: "order-placed:order_1",
                orderId: "order_1",
            },
        });
    });

    it("queues the team's Not collected for its day, on the same transaction (R34)", async () => {
        await place(true);

        expect(queueUncollectedAlert).toHaveBeenCalledTimes(1);
        expect(queueUncollectedAlert).toHaveBeenCalledWith(
            expect.anything(),
            "org_1",
            expect.objectContaining({ id: "order_1", createdAt: PLACED }),
        );
    });

    it("counts on the monthly orders, softly", async () => {
        await place(true);

        expect(room).toHaveBeenCalledWith(
            expect.anything(),
            "org_1",
            "orders",
            {
                soft: true,
            },
        );
    });

    it("leaves the account's other orders paid on handover alone", async () => {
        await place(true);

        // Only unpaid online checkouts are replaced by a newer one.
        expect(db.order.findMany.mock.calls[0][0].where).toMatchObject({
            placedOnline: true,
            payOnHandover: false,
        });
    });

    it("stops at a few waiting at once, in the customer's words", async () => {
        db.order.count.mockResolvedValue(3);

        const refused = place(true);
        await expect(refused).rejects.toBeInstanceOf(HttpException);
        await expect(refused).rejects.toMatchObject({
            message: PAY_ON_HANDOVER_WAITING,
        });
        expect(db.order.count.mock.calls[0][0].where).toMatchObject({
            payOnHandover: true,
            status: { in: ["PENDING", "PROCESSING"] },
        });
        expect(db.order.create).not.toHaveBeenCalled();
    });
});

describe("an order paid online, beside it", () => {
    it("holds nothing until it is paid, and closes in a day", async () => {
        await place(false);

        expect(db.order.create.mock.calls[0][0].data).toMatchObject({
            placedOnline: true,
            payOnHandover: false,
        });
        expect(applyInventoryTransition).not.toHaveBeenCalled();
        expect(enqueueTeamAlert).not.toHaveBeenCalled();
        expect(queueUncollectedAlert).not.toHaveBeenCalled();
        expect(db.job.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                payload: { orderId: "order_1" },
            }),
        });
    });
});

describe("an order with a discount code (DEC-104)", () => {
    const applied = {
        discountId: "d_1",
        code: "SAVE10",
        kind: "PERCENTAGE" as const,
        percentBps: 1000,
        ruleAmount: null,
        usageLimit: 5,
        amountCents: 5_000,
    };
    const placeWithCode = (payOnHandover: boolean) =>
        createCheckoutOrder(scope, account, {
            lines: [line],
            type: "PICKUP",
            shippingCents: 0,
            currency: "INR",
            dto: {
                ...dto,
                discountCode: "SAVE10",
                payment: payOnHandover ? "ON_HANDOVER" : undefined,
            },
            payOnHandover,
            discount: applied,
        });

    beforeEach(() => {
        db.discountRedemption.count.mockResolvedValue(1);
    });

    it.each([
        ["paid online", false],
        ["paid at the handover", true],
    ])(
        "%s: records the discount, the discounted total and the code's use",
        async (_name, onHandover) => {
            await placeWithCode(onHandover);

            // The online payment is asked for the order's total, so the
            // total is the discounted one.
            expect(db.order.create.mock.calls[0][0].data).toMatchObject({
                subtotal: "500.00",
                discount: "50.00",
                total: "450.00",
            });
            expect(db.discountRedemption.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    discountId: "d_1",
                    orderId: "order_1",
                    amount: "50.00",
                    code: "SAVE10",
                }),
            });
            // Serializable, so the use count sees a concurrent last use.
            expect(db.$transaction.mock.calls[0][1]).toEqual({
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
        },
    );

    it("refuses the order when the code's last use went meanwhile", async () => {
        db.discountRedemption.count.mockResolvedValue(5);

        await expect(placeWithCode(true)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(db.discountRedemption.create).not.toHaveBeenCalled();
    });

    it("runs an order without a code as before", async () => {
        await place(false);

        expect(db.order.create.mock.calls[0][0].data).toMatchObject({
            discount: "0.00",
            total: "500.00",
        });
        expect(db.discountRedemption.create).not.toHaveBeenCalled();
        expect(db.$transaction.mock.calls[0][1]).toBeUndefined();
    });
});
