/**
 * New order v2 (plan B, B13) against a real Postgres: a walk-in paid in
 * cash, a known customer picked from the search, someone new by email, a
 * pay link made with the order, the refusals, and how a walk-in's order
 * reads everywhere an order's customer is named (deploy 1's readers). And
 * B13b: a walk-in who gives a phone is a customer, found or made by it.
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
import { isReservedContactEmail } from "../contacts/contact-email";
import { PrivacyRemovalService } from "../customer-workspace/privacy-removal.service";
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
            walkIn: { name: "Asha" },
            payment: { kind: "CASH", received: "500" },
        });
        const order = await stored(made.id);
        expect(order).toMatchObject({
            customerId: null,
            walkInName: "Asha",
            walkInPhone: null,
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

    it("with only a name, makes no customer and no contact", async () => {
        const [customers, contacts] = await Promise.all([
            prisma.customer.count({ where: { storeId } }),
            prisma.contact.count({ where: { organizationId: orgId } }),
        ]);
        await place({
            walkIn: { name: "Ravi", phone: "   " },
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
                walkIn: { name: "Zoya" },
                payment: { kind: "CASH" },
            })
        ).id;
        // A walk-in taken before B13b kept the phone they gave on the order.
        await prisma.order.update({
            where: { id },
            data: { walkInPhone: "+91 97000 55555" },
        });
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

describe("a walk-in who gives a phone is a customer (B13b)", () => {
    const customersHere = () => prisma.customer.count({ where: { storeId } });
    const contactsHere = () =>
        prisma.contact.count({ where: { organizationId: orgId } });
    const linkOf = (customerId: string) =>
        prisma.customerIdentityLink.findMany({
            where: { customerId },
            select: { contactId: true, reason: true, linkedByUserId: true },
        });

    it("matches the business's contact by phone, +91 or not, spaces or not", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `meera-${tag}@example.in`,
                firstName: "Meera",
                lastName: "Iyer",
                phone: "+91 98450 12345",
            },
        });
        const before = await contactsHere();
        const first = await place({
            walkIn: { name: "Meera", phone: "9845012345" },
        });
        const made = await stored(first.id);
        expect(made).toMatchObject({ walkInName: null, walkInPhone: null });
        expect(await linkOf(made.customerId!)).toEqual([
            {
                contactId: contact.id,
                reason: "MANUAL",
                linkedByUserId: ownerId,
            },
        ]);
        // Their real email, not a placeholder: as if picked.
        expect(
            await prisma.customer.findUniqueOrThrow({
                where: { id: made.customerId! },
                select: { email: true },
            }),
        ).toEqual({ email: `meera-${tag}@example.in` });
        // Typed another way: the same customer, and no new contact.
        const again = await place({
            walkIn: { name: "Meera I", phone: "+91-98450 123 45" },
        });
        expect((await stored(again.id)).customerId).toBe(made.customerId);
        expect(await contactsHere()).toBe(before);
    });

    it("matches the storefront's customer by phone when no contact holds it, and links them", async () => {
        const existing = await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `tara-${tag}@example.in`,
                firstName: "Tara",
                phone: "98451 22222",
            },
        });
        const made = await place({
            walkIn: { name: "Tara S", phone: "+91 9845122222" },
        });
        expect((await stored(made.id)).customerId).toBe(existing.id);
        const [link] = await linkOf(existing.id);
        expect(link).toMatchObject({
            reason: "MANUAL",
            linkedByUserId: ownerId,
        });
        expect(
            await prisma.contact.findUniqueOrThrow({
                where: { id: link.contactId },
                select: { email: true, firstName: true, phone: true },
            }),
        ).toEqual({
            email: `tara-${tag}@example.in`,
            firstName: "Tara",
            phone: "+91 9845122222",
        });
    });

    it("a new phone makes one customer and one contact, and a second order reuses them", async () => {
        const [customers, contacts] = await Promise.all([
            customersHere(),
            contactsHere(),
        ]);
        const first = await place({
            walkIn: { name: "Farah Khan", phone: "+91 90000 77777" },
            payment: { kind: "CASH" },
        });
        const made = await stored(first.id);
        expect(made).toMatchObject({ walkInName: null, walkInPhone: null });
        expect(await customersHere()).toBe(customers + 1);
        expect(await contactsHere()).toBe(contacts + 1);
        const customer = await prisma.customer.findUniqueOrThrow({
            where: { id: made.customerId! },
            select: {
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
            },
        });
        expect(customer).toMatchObject({
            firstName: "Farah",
            lastName: "Khan",
            phone: "+91 90000 77777",
        });
        expect(isReservedContactEmail(customer.email)).toBe(true);
        const [link] = await linkOf(made.customerId!);
        expect(link).toMatchObject({
            reason: "MANUAL",
            linkedByUserId: ownerId,
        });
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: link.contactId },
            select: { email: true, firstName: true, phone: true },
        });
        expect(contact).toMatchObject({
            firstName: "Farah",
            phone: "+91 90000 77777",
        });
        expect(isReservedContactEmail(contact.email)).toBe(true);
        // Paid, and C2 found them linked already: still one contact.
        expect(made.paymentStatus).toBe("PAID");

        const second = await place({
            walkIn: { name: "Farah", phone: "9000077777" },
        });
        expect((await stored(second.id)).customerId).toBe(made.customerId);
        expect(await customersHere()).toBe(customers + 1);
        expect(await contactsHere()).toBe(contacts + 1);

        // Picked from the search by that contact: the same customer.
        const picked = await place({ contactId: link.contactId });
        expect((await stored(picked.id)).customerId).toBe(made.customerId);
    });

    it("two orders for the same new phone at once make one customer", async () => {
        const customers = await customersHere();
        const [a, b] = await Promise.all([
            place({ walkIn: { name: "Ivy", phone: "+91 90000 66666" } }),
            place({ walkIn: { name: "Ivy", phone: "90000 66666" } }),
        ]);
        expect((await stored(a.id)).customerId).toBe(
            (await stored(b.id)).customerId,
        );
        expect(await customersHere()).toBe(customers + 1);
    });

    it("never matches a contact removed for privacy", async () => {
        const ctx: OrganizationContext = owner;
        const gone = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `gone-${tag}@example.in`,
                firstName: "Gone",
                phone: "+91 90000 44444",
            },
        });
        await new PrivacyRemovalService().remove(ctx, gone.id);
        // A removal clears the phone; a row that kept it still never matches.
        await prisma.contact.update({
            where: { id: gone.id },
            data: { phone: "+91 90000 44444" },
        });
        const made = await place({
            walkIn: { name: "Neha", phone: "+91 90000 44444" },
        });
        const [link] = await linkOf((await stored(made.id)).customerId!);
        expect(link.contactId).not.toBe(gone.id);
        expect(
            await prisma.customerIdentityLink.count({
                where: { contactId: gone.id },
            }),
        ).toBe(0);
    });

    it("a privacy removal reaches the customer a phone made", async () => {
        const made = await place({
            walkIn: { name: "Leela", phone: "+91 90000 33333" },
            payment: { kind: "CASH" },
        });
        // Their order counts as theirs: an open one holds the removal back.
        await prisma.order.update({
            where: { id: made.id },
            data: { status: "DELIVERED" },
        });
        const customerId = (await stored(made.id)).customerId!;
        const [link] = await linkOf(customerId);
        await new PrivacyRemovalService().remove(owner, link.contactId);
        expect(
            await prisma.customer.findUniqueOrThrow({
                where: { id: customerId },
                select: { firstName: true, phone: true },
            }),
        ).toEqual({ firstName: null, phone: null });
    });

    it("answers the same whether or not someone was found", async () => {
        await place({ walkIn: { name: "Omar", phone: "+91 90000 22222" } });
        const found = await place({
            walkIn: { name: "Omar", phone: "+91 90000 22222" },
        });
        const fresh = await place({
            walkIn: { name: "Omar", phone: "+91 90000 22223" },
        });
        expect(Object.keys(found).sort()).toEqual(Object.keys(fresh).sort());
    });

    it("refuses a phone too short to keep them by, and makes no order", async () => {
        const before = await prisma.order.count({ where: { storeId } });
        await expect(
            place({ walkIn: { name: "Sam", phone: "12345" } }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    });

    it("reads as their customer, never with a placeholder email", async () => {
        const made = await place({
            walkIn: { name: "Ritu", phone: "+91 90000 11112" },
            payment: { kind: "CASH" },
        });
        const read = await kitchen.read(owner, made.id);
        expect(read.walkIn).toBeNull();
        expect(read.customer).toMatchObject({
            name: "Ritu",
            phone: "+91 90000 11112",
        });
        expect(JSON.stringify(read)).not.toContain(".invalid");
        const page = await listOrderRows(
            orgId,
            { q: "Ritu" },
            { money: true, contact: true },
        );
        expect(page.rows.map((r) => r.id)).toContain(made.id);
        expect(JSON.stringify(page.rows)).not.toContain(".invalid");
        const { invoices } = await stored(made.id);
        expect(invoices).toEqual([
            expect.objectContaining({ billToName: "Ritu", billToEmail: null }),
        ]);
        await prisma.order.update({
            where: { id: made.id },
            data: { status: "DELIVERED" },
        });
        const reviews = new ProductReviewsService(
            { record: jest.fn() } as unknown as AuditService,
            new FixedWindowRateLimiter(100, 60_000),
        );
        const offered = await reviews.invitableOrders(orgId);
        expect(offered.map((o) => o.id)).not.toContain(made.id);
    });
});
