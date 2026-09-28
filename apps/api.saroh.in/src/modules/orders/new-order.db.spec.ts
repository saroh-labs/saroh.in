/**
 * New order v2 (plan B, B13) against a real Postgres: a walk-in paid in
 * cash, a known customer picked from the search, someone new by email, a
 * pay link made with the order, the refusals, and how a walk-in's order
 * reads everywhere an order's customer is named (deploy 1's readers).
 *
 * Only the app env is stubbed (for the credential key); the provider is the
 * network-free fake. Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { hashPayToken } from "../invoices/pay-token";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { ProductReviewsService } from "../product-reviews/product-reviews.service";
import { ProductsService } from "../products/products.service";
import { SearchService } from "../search/search.service";
import { StoresService } from "../stores/stores.service";
import type { CreateOrderDto } from "./dto";
import { OrderKitchenService } from "./order-kitchen.service";
import { listOrderRows } from "./order-list";
import { OrdersService } from "./orders.service";

const tag = `${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const kitchen = new OrderKitchenService(payments);

let orgId = "";
let ownerId = "";
let memberId = "";
let storeId = "";
let pickupOnlyStore = "";
let bread = "";
let cake = "";
let owner: OrganizationContext;

const address = {
    name: "Meera",
    line1: "12 Church Street",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
};

/** Two sourdough loaves (₹180 each) and a cake slice (₹70): ₹430. */
const lines = () => [
    { productId: bread, quantity: 2 },
    { productId: cake, quantity: 1 },
];

const place = (over: Partial<CreateOrderDto>, userId = ownerId) =>
    orders.create(storeId, userId, {
        items: lines(),
        fulfilment: "PICKUP",
        payment: { kind: "LATER" },
        ...over,
    } as CreateOrderDto);

const stored = (id: string) =>
    prisma.order.findUniqueOrThrow({
        where: { id },
        select: {
            customerId: true,
            walkInName: true,
            walkInPhone: true,
            paymentStatus: true,
            paidAt: true,
            total: true,
            payTokenHash: true,
            events: {
                select: { kind: true, note: true, amountCents: true },
            },
            invoices: {
                select: {
                    kind: true,
                    status: true,
                    billToName: true,
                    billToEmail: true,
                    paymentMethod: true,
                },
            },
        },
    });

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `b13-owner-${tag}@example.com` },
        })
    ).id;
    memberId = (
        await prisma.user.create({
            data: { email: `b13-member-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye Counter", slug: `b13-org-${tag}` },
        })
    ).id;
    await prisma.membership.createMany({
        data: [
            { organizationId: orgId, userId: ownerId, role: "OWNER" },
            { organizationId: orgId, userId: memberId, role: "MEMBER" },
        ],
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `b13-hill-${tag}`,
        })
    ).id;
    pickupOnlyStore = (
        await stores.createForUser(ownerId, orgId, {
            name: "Kiosk",
            slug: `b13-kiosk-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
            shippingEnabled: true,
            localDeliveryFee: "60.00",
        },
        update: {
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
            shippingEnabled: true,
            localDeliveryFee: "60.00",
        },
    });
    await prisma.storeSettings.upsert({
        where: { storeId: pickupOnlyStore },
        create: {
            storeId: pickupOnlyStore,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    bread = (
        await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "180",
        })
    ).id;
    cake = (
        await products.create(storeId, ownerId, {
            name: "Walnut cake slice",
            slug: "walnut-cake",
            price: "70",
            fulfilmentTypes: ["PICKUP"],
        })
    ).id;
    const peanuts = await prisma.storeAllergen.create({
        data: { organizationId: orgId, name: "Peanuts" },
    });
    await prisma.productAllergen.create({
        data: {
            organizationId: orgId,
            productId: cake,
            allergenId: peanuts.id,
            kind: "MAY_CONTAIN",
        },
    });
});

describe("a walk-in (B13)", () => {
    it("paid in cash: ₹500 for ₹430, paid, and invoiced to them by name", async () => {
        const made = await place({
            walkIn: { name: "Asha", phone: "+91 98450 00002" },
            payment: { kind: "CASH", received: "500" },
        });
        const order = await stored(made.id);
        expect(order).toMatchObject({
            customerId: null,
            walkInName: "Asha",
            walkInPhone: "+91 98450 00002",
            paymentStatus: "PAID",
        });
        expect(order.total.toString()).toBe("430");
        expect(order.paidAt).not.toBeNull();
        // The timeline says how, and keeps what was handed over as the
        // step's amount (a money read); the ₹70 change is the difference.
        expect(order.events).toEqual([
            { kind: "STATUS", note: "Paid in cash", amountCents: 50_000 },
        ]);
        expect(order.invoices).toEqual([
            {
                kind: "INVOICE",
                status: "PAID",
                billToName: "Asha (walk-in)",
                billToEmail: null,
                paymentMethod: "CASH",
            },
        ]);
    });

    it("makes no customer and no contact", async () => {
        const [customers, contacts] = await Promise.all([
            prisma.customer.count({ where: { storeId } }),
            prisma.contact.count({ where: { organizationId: orgId } }),
        ]);
        await place({
            walkIn: { name: "Ravi", phone: "+91 90000 11111" },
            payment: { kind: "UPI" },
        });
        expect(await prisma.customer.count({ where: { storeId } })).toBe(
            customers,
        );
        expect(
            await prisma.contact.count({ where: { organizationId: orgId } }),
        ).toBe(contacts);
    });

    it("refuses a walk-in with no name", async () => {
        await expect(place({ walkIn: { name: "   " } })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("refuses cash short of the total, and makes no order", async () => {
        const before = await prisma.order.count({ where: { storeId } });
        await expect(
            place({
                walkIn: { name: "Asha" },
                payment: { kind: "CASH", received: "400" },
            }),
        ).rejects.toThrow("short");
        expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    });

    it("refuses an order for nobody, or for two people", async () => {
        await expect(place({})).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            place({ walkIn: { name: "Asha" }, customer: { email: "a@x.in" } }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("someone with a record (B13)", () => {
    it("someone new by email gets one storefront customer, and a contact once paid", async () => {
        const email = `nisha-${tag}@example.in`;
        const first = await place({
            customer: { email, name: "Nisha Rao", phone: "+91 98000 00003" },
            payment: { kind: "CARD" },
        });
        const made = await stored(first.id);
        const customer = await prisma.customer.findUniqueOrThrow({
            where: { id: made.customerId! },
            select: { email: true, firstName: true, lastName: true },
        });
        expect(customer).toEqual({
            email,
            firstName: "Nisha",
            lastName: "Rao",
        });
        // Paid: C2 linked a contact to them.
        expect(
            await prisma.customerIdentityLink.count({
                where: { customerId: made.customerId! },
            }),
        ).toBe(1);
        // The same email again, typed differently: the same customer.
        const second = await place({
            customer: { email: email.toUpperCase() },
        });
        expect((await stored(second.id)).customerId).toBe(made.customerId);
        expect(
            await prisma.customer.count({
                where: {
                    storeId,
                    email: { equals: email, mode: "insensitive" },
                },
            }),
        ).toBe(1);
    });

    it("a person picked from the search becomes the storefront's customer, linked to them", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `priya-${tag}@example.in`,
                firstName: "Priya",
                lastName: "Shah",
                phone: "+91 98000 00004",
            },
        });
        const first = await place({ contactId: contact.id });
        const customerId = (await stored(first.id)).customerId!;
        expect(
            await prisma.customerIdentityLink.findFirst({
                where: { customerId },
                select: { contactId: true, reason: true, linkedByUserId: true },
            }),
        ).toEqual({
            contactId: contact.id,
            reason: "MANUAL",
            linkedByUserId: ownerId,
        });
        // Picked again: the customer already linked here, never a second.
        const again = await place({ contactId: contact.id });
        expect((await stored(again.id)).customerId).toBe(customerId);
    });

    it("refuses a picked person with no email yet", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `walkin-${tag}@account.invalid`,
                firstName: "Kiran",
            },
        });
        await expect(place({ contactId: contact.id })).rejects.toBeInstanceOf(
            ConflictException,
        );
    });
});

describe("how it leaves (B13)", () => {
    it("offers only the ways every line allows and the storefront offers, with the fee", async () => {
        expect(await orders.newOrderLines(storeId, ownerId, [])).toMatchObject({
            ways: [
                { type: "PICKUP", label: "Pick-up", fee: null },
                {
                    type: "LOCAL_DELIVERY",
                    label: "Local delivery",
                    fee: "60.00",
                },
            ],
        });
        const read = await orders.newOrderLines(storeId, ownerId, [
            bread,
            cake,
        ]);
        // The cake slice is Pick-up only.
        expect(read.ways.map((w) => w.type)).toEqual(["PICKUP"]);
        expect(read.allergens[cake]).toEqual({
            contains: [],
            mayContain: [expect.objectContaining({ name: "Peanuts" })],
        });
    });

    it("refuses a way an item doesn't allow (B12), and one the storefront doesn't offer", async () => {
        await expect(
            place({
                walkIn: { name: "Asha" },
                fulfilment: "LOCAL_DELIVERY",
                address,
                payment: { kind: "CARD" },
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            orders.create(storeId, ownerId, {
                items: [{ productId: bread, quantity: 1 }],
                walkIn: { name: "Asha" },
                fulfilment: "SHIPPING",
                address,
                payment: { kind: "CARD" },
            } as CreateOrderDto),
        ).rejects.toThrow("This storefront doesn't offer Shipping");
    });
});

describe("a pay link made with the order (B13, B11)", () => {
    it("with no provider to take it, makes no order at all", async () => {
        const before = await prisma.order.count({ where: { storeId } });
        await expect(
            place({
                customer: { email: `link-${tag}@example.in` },
                payment: { kind: "LINK" },
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    });

    it("leaves the order unpaid and hands its link over once", async () => {
        await payments.connectProvider(owner, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_B13",
            keyId: "rzp_test_B13",
            keySecret: "rzp_secret",
            webhookSecret: "whsec_b13",
        });
        const made = await place({
            customer: { email: `link-${tag}@example.in` },
            payment: { kind: "LINK" },
        });
        expect(made).toHaveProperty("payLink");
        const token = (made as { payLink: { token: string } }).payLink.token;
        const order = await stored(made.id);
        expect(order.paymentStatus).toBe("UNPAID");
        expect(order.payTokenHash).toBe(hashPayToken(token));
        expect(order.invoices).toEqual([]);
    });

    it("is not for a role that can't take orders: no order, no link", async () => {
        const before = await prisma.order.count({ where: { storeId } });
        // A Member works the kitchen; taking an order isn't theirs. They see
        // the storefront, so it is a 403 in words (B16: `order:create`).
        await expect(
            place(
                {
                    customer: { email: `link2-${tag}@example.in` },
                    payment: { kind: "LINK" },
                },
                memberId,
            ),
        ).rejects.toThrow(
            new ForbiddenException("Your role can't take new orders."),
        );
        expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    });
});

describe("a walk-in's order, read everywhere (B13 deploy 1)", () => {
    let id = "";
    beforeAll(async () => {
        id = (
            await place({
                walkIn: { name: "Zoya", phone: "+91 97000 55555" },
                payment: { kind: "CASH" },
            })
        ).id;
    });

    it("the Orders list names them, and finds them by name and phone", async () => {
        const page = await listOrderRows(
            orgId,
            { q: "Zoya" },
            { money: true, contact: true },
        );
        expect(page.rows.map((r) => r.id)).toEqual([id]);
        expect(page.rows[0]).toMatchObject({
            customer: null,
            walkIn: { name: "Zoya", phone: "+91 97000 55555" },
        });
        const byPhone = await listOrderRows(
            orgId,
            { q: "97000 55555" },
            { money: true, contact: true },
        );
        expect(byPhone.rows.map((r) => r.id)).toEqual([id]);
    });

    it("Order Detail reads it, with no customer and no Needs attention", async () => {
        const read = await kitchen.read(owner, id);
        expect(read.customer).toBeNull();
        expect(read.walkIn).toEqual({ name: "Zoya", phone: "+91 97000 55555" });
        expect(read.attention).toEqual({
            entries: [],
            hiddenSensitiveCount: 0,
        });
    });

    it("search labels it a walk-in", async () => {
        const { hits } = await new SearchService().search(owner, "Zoya");
        expect(hits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "order",
                    id,
                    subtitle: expect.stringContaining("Zoya (walk-in)"),
                }),
            ]),
        );
    });

    it("gets no review invitation", async () => {
        await prisma.order.update({
            where: { id },
            data: { status: "DELIVERED" },
        });
        const reviews = new ProductReviewsService(
            { record: jest.fn() } as unknown as AuditService,
            new FixedWindowRateLimiter(100, 60_000),
        );
        const offered = await reviews.invitableOrders(orgId);
        expect(offered.map((o) => o.id)).not.toContain(id);
        const [result] = await reviews.invite(owner, [id]);
        expect(result).toMatchObject({ status: "skipped", reason: "no-email" });
    });
});
