// DB-free: @saroh/database and the site origin are mocked; the adapter is a
// plain object of jest functions.
jest.mock("@saroh/database", () => {
    const client = {
        invoice: { findUniqueOrThrow: jest.fn() },
        order: { findUniqueOrThrow: jest.fn() },
        contact: { updateMany: jest.fn() },
        merchantPaymentProvider: { updateMany: jest.fn() },
    };
    return { prisma: client };
});
jest.mock("../sites/site-origin", () => ({
    siteOriginOf: jest.fn(),
    rendererBase: () => "https://saroh.app",
}));

import type { MerchantPaymentProvider } from "@saroh/database";
import { prisma } from "@saroh/database";

import { siteOriginOf } from "../sites/site-origin";
import type { MerchantProvider } from "./providers/provider.port";
import {
    hashCancelToken,
    prepareStripeCheckout,
    safeReturnPath,
} from "./stripe-checkout";

const invoiceFind = prisma.invoice.findUniqueOrThrow as jest.Mock;
const orderFind = prisma.order.findUniqueOrThrow as jest.Mock;
const contactUpdate = prisma.contact.updateMany as jest.Mock;
const providerUpdate = prisma.merchantPaymentProvider.updateMany as jest.Mock;
const origin = siteOriginOf as jest.Mock;

const NOW = new Date("2026-11-08T10:00:00Z");
const CREDENTIALS = { keyId: "pk_test_Madeup1", keySecret: "rk_test_Madeup1" };

function row(
    over: Partial<MerchantPaymentProvider> = {},
): MerchantPaymentProvider {
    return {
        id: "mpp_1",
        organizationId: "org_1",
        provider: "STRIPE",
        accountCountry: "US",
        ...over,
    } as MerchantPaymentProvider;
}

function adapter(over: Partial<MerchantProvider> = {}) {
    return {
        findOrCreateCustomer: jest
            .fn()
            .mockImplementation(({ email }: { email: string | null }) =>
                Promise.resolve({ customerId: email ? "cus_1" : null }),
            ),
        accountCountry: jest.fn().mockResolvedValue("US"),
        ...over,
    } as unknown as MerchantProvider & {
        findOrCreateCustomer: jest.Mock;
        accountCountry: jest.Mock;
    };
}

const HOLD = {
    status: "DRAFT",
    source: "BOOKING",
    number: null,
    bookingId: "bk_1",
    contactId: "ct_1",
    billToEmail: "Asha@Example.com",
    billToName: "Asha Rao",
    lines: [{ description: "Haircut · Mon 9 Nov 2026, 10:00" }],
};

function prepare(
    target: { kind: "order" | "invoice"; id: string },
    over: {
        providerRow?: MerchantPaymentProvider;
        adapter?: MerchantProvider;
        returnPath?: unknown;
    } = {},
) {
    return prepareStripeCheckout({
        organizationId: "org_1",
        target,
        providerRow: over.providerRow ?? row(),
        adapter: over.adapter ?? adapter(),
        credentials: CREDENTIALS,
        intentId: "intent_1",
        returnPath: over.returnPath,
        now: NOW,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    origin.mockResolvedValue("https://shop.example.com");
    contactUpdate.mockResolvedValue({ count: 1 });
    providerUpdate.mockResolvedValue({ count: 1 });
});

describe("prepareStripeCheckout", () => {
    it("a booking hold: instant only, book, the service line, 31 minutes, on the business's own site", async () => {
        invoiceFind.mockResolvedValue(HOLD);
        const stripe = adapter();

        const out = await prepare(
            { kind: "invoice", id: "inv_1" },
            { adapter: stripe },
        );

        expect(out.hosted).toMatchObject({
            instantOnly: true,
            submitType: "book",
            lineName: "Haircut · Mon 9 Nov 2026, 10:00",
            clientReference: "intent_1",
            customerId: "cus_1",
            payerEmail: "asha@example.com",
            billingAddressRequired: false,
            successUrl:
                "https://shop.example.com/paid?session_id={CHECKOUT_SESSION_ID}",
        });
        expect(out.hosted.expiresAt?.getTime()).toBe(
            NOW.getTime() + 31 * 60_000,
        );
        expect(out.hosted.shippingCountries).toBeUndefined();
        expect(out.holdBookingId).toBe("bk_1");
        expect(out.stored.checkoutKind).toBe("hold");
        expect(out.stored.expiresAt).toBe(out.hosted.expiresAt?.toISOString());
        expect(stripe.findOrCreateCustomer).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "asha@example.com",
                name: "Asha Rao",
                organizationId: "org_1",
                contactRef: "ct_1",
            }),
        );
        expect(contactUpdate).toHaveBeenCalledWith({
            where: { id: "ct_1", organizationId: "org_1" },
            data: { stripeCustomerId: "cus_1" },
        });
    });

    it("the cancel URL carries the intent and a token kept only as its hash", async () => {
        invoiceFind.mockResolvedValue(HOLD);

        const out = await prepare({ kind: "invoice", id: "inv_1" });

        const url = new URL(out.hosted.cancelUrl);
        expect(url.origin + url.pathname).toBe("https://shop.example.com/paid");
        expect(url.searchParams.get("cancelled")).toBe("1");
        expect(url.searchParams.get("intent")).toBe("intent_1");
        const token = url.searchParams.get("token") ?? "";
        expect(token.length).toBeGreaterThanOrEqual(40);
        expect(out.stored.cancelTokenHash).toBe(hashCancelToken(token));
        expect(JSON.stringify(out.stored)).not.toContain(token);
    });

    it("an issued invoice with no live site: pay, card and Link, the renderer's apex, Stripe's default day", async () => {
        origin.mockResolvedValue(null);
        invoiceFind.mockResolvedValue({
            ...HOLD,
            status: "ISSUED",
            source: "MANUAL",
            number: "INV-0007",
            bookingId: null,
        });

        const out = await prepare({ kind: "invoice", id: "inv_1" });

        expect(out.hosted).toMatchObject({
            // Card and Link for every Stripe payment (owner, 8 Nov 2026).
            instantOnly: true,
            submitType: "pay",
            lineName: "Invoice INV-0007",
            successUrl:
                "https://saroh.app/pay/paid?session_id={CHECKOUT_SESSION_ID}",
        });
        expect(out.hosted.expiresAt).toBeUndefined();
        expect(out.stored.expiresAt).toBe(
            new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
        );
        expect(out.holdBookingId).toBeNull();
        expect(out.stored.checkoutKind).toBe("invoice");
    });

    it.each([
        ["PACK", "pack"],
        ["SUBSCRIPTION", "join"],
    ])("a %s draft is instant only and pays", async (source, kind) => {
        invoiceFind.mockResolvedValue({ ...HOLD, source, bookingId: null });

        const out = await prepare({ kind: "invoice", id: "inv_1" });

        expect(out.stored.checkoutKind).toBe(kind);
        expect(out.hosted.instantOnly).toBe(true);
        expect(out.hosted.submitType).toBe("pay");
        expect(out.hosted.expiresAt).toBeUndefined();
    });

    describe("an order", () => {
        const ORDER = {
            orderId: "ORD-001",
            fulfilment: "PICKUP",
            deliveryCountry: null,
            customer: {
                email: "Bo@Example.com",
                firstName: "Bo",
                lastName: "Lee",
                identityLinks: [{ contactId: "ct_2" }],
            },
        };

        it("sends the store customer and records the customer on the linked contact", async () => {
            orderFind.mockResolvedValue(ORDER);

            const out = await prepare({ kind: "order", id: "order_1" });

            expect(out.hosted).toMatchObject({
                instantOnly: true,
                submitType: "pay",
                lineName: "Order ORD-001",
                payerEmail: "bo@example.com",
                customerId: "cus_1",
            });
            expect(out.stored.checkoutKind).toBe("order");
            expect(contactUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "ct_2", organizationId: "org_1" },
                }),
            );
        });

        it("a customer with no linked contact is still sent, and no contact is written", async () => {
            orderFind.mockResolvedValue({
                ...ORDER,
                customer: { ...ORDER.customer, identityLinks: [] },
            });

            const out = await prepare({ kind: "order", id: "order_1" });

            expect(out.hosted.customerId).toBe("cus_1");
            expect(contactUpdate).not.toHaveBeenCalled();
        });

        it("a phone-only account's placeholder address is no email: no customer, the session still made", async () => {
            orderFind.mockResolvedValue({
                ...ORDER,
                customer: {
                    ...ORDER.customer,
                    email: "account+ct_2@account.invalid",
                },
            });

            const out = await prepare({ kind: "order", id: "order_1" });

            expect(out.hosted.payerEmail).toBeNull();
            expect(out.hosted.customerId).toBeNull();
            expect(contactUpdate).not.toHaveBeenCalled();
        });

        it("goods sent from an Indian account ask for the shipping address in the delivery country", async () => {
            orderFind.mockResolvedValue({
                ...ORDER,
                fulfilment: "SHIPPING",
                deliveryCountry: "us",
            });

            const out = await prepare(
                { kind: "order", id: "order_1" },
                { providerRow: row({ accountCountry: "IN" }) },
            );

            expect(out.hosted.billingAddressRequired).toBe(true);
            expect(out.hosted.shippingCountries).toEqual(["US"]);
        });

        it("goods sent from a US account ask for no address", async () => {
            orderFind.mockResolvedValue({
                ...ORDER,
                fulfilment: "SHIPPING",
                deliveryCountry: "US",
            });

            const out = await prepare({ kind: "order", id: "order_1" });

            expect(out.hosted.billingAddressRequired).toBe(false);
            expect(out.hosted.shippingCountries).toBeUndefined();
        });
    });

    it("no email anywhere: no customer call result, and the session is still prepared", async () => {
        invoiceFind.mockResolvedValue({ ...HOLD, billToEmail: null });
        const stripe = adapter();

        const out = await prepare(
            { kind: "invoice", id: "inv_1" },
            { adapter: stripe },
        );

        expect(out.hosted.customerId).toBeNull();
        expect(out.hosted.payerEmail).toBeNull();
        expect(contactUpdate).not.toHaveBeenCalled();
    });

    it("a key that can't make customers is passed on to be flagged", async () => {
        invoiceFind.mockResolvedValue(HOLD);
        const stripe = adapter({
            findOrCreateCustomer: jest.fn().mockResolvedValue({
                customerId: null,
                permissionMissing: true,
            }),
        });

        const out = await prepare(
            { kind: "invoice", id: "inv_1" },
            { adapter: stripe },
        );

        expect(out.permissionMissing).toBe(true);
        expect(out.hosted.customerId).toBeNull();
    });

    describe("the account's country", () => {
        beforeEach(() => invoiceFind.mockResolvedValue(HOLD));

        it("stored IN asks for the billing address without asking Stripe", async () => {
            const stripe = adapter();
            const out = await prepare(
                { kind: "invoice", id: "inv_1" },
                { adapter: stripe, providerRow: row({ accountCountry: "IN" }) },
            );
            expect(out.hosted.billingAddressRequired).toBe(true);
            expect(stripe.accountCountry).not.toHaveBeenCalled();
        });

        it("unknown, and Stripe answers GB: stored, no address asked", async () => {
            const stripe = adapter({
                accountCountry: jest.fn().mockResolvedValue("GB"),
            });
            const out = await prepare(
                { kind: "invoice", id: "inv_1" },
                { adapter: stripe, providerRow: row({ accountCountry: null }) },
            );
            expect(out.hosted.billingAddressRequired).toBe(false);
            expect(providerUpdate).toHaveBeenCalledWith({
                where: { id: "mpp_1", organizationId: "org_1" },
                data: { accountCountry: "GB" },
            });
        });

        it("unknown, and Stripe won't say: the address is asked, nothing stored", async () => {
            const stripe = adapter({
                accountCountry: jest.fn().mockResolvedValue(null),
            });
            const out = await prepare(
                { kind: "invoice", id: "inv_1" },
                { adapter: stripe, providerRow: row({ accountCountry: null }) },
            );
            expect(out.hosted.billingAddressRequired).toBe(true);
            expect(providerUpdate).not.toHaveBeenCalled();
        });
    });

    it("keeps a same-site return path, and drops one that isn't", async () => {
        invoiceFind.mockResolvedValue(HOLD);
        const kept = await prepare(
            { kind: "invoice", id: "inv_1" },
            { returnPath: "/book?service=cut" },
        );
        expect(kept.stored.returnPath).toBe("/book?service=cut");
        const dropped = await prepare(
            { kind: "invoice", id: "inv_1" },
            { returnPath: "//evil.example" },
        );
        expect(dropped.stored.returnPath).toBeNull();
    });
});

describe("safeReturnPath", () => {
    it.each([
        ["/book?service=cut", "/book?service=cut"],
        ["/account", "/account"],
        ["//evil.example", null],
        ["https://x", null],
        ["/\\evil.example", null],
        ["book", null],
        ["/a\nb", null],
        ["/" + "a".repeat(600), null],
        [42, null],
        [undefined, null],
    ])("%p → %p", (input, expected) => {
        expect(safeReturnPath(input)).toBe(expected);
    });
});
