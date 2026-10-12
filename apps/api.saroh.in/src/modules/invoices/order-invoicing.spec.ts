// creditNoteForRefund's early answers, without a database: which refunds
// make no credit note on their order's invoice.
import { nextInvoiceNumber } from "./numbering";
import {
    addedProductLines,
    correctOrderInvoiceForEdit,
    creditNoteForRefund,
    ensureOrderInvoice,
} from "./order-invoicing";

jest.mock("./numbering", () => ({
    ...jest.requireActual<typeof import("./numbering")>("./numbering"),
    nextInvoiceNumber: jest.fn().mockResolvedValue("RC/26-27/0002"),
}));
jest.mock("../customer-workspace/ensure-contact", () => ({
    ensureContactForPaidOrder: jest.fn(),
}));

function txWith(refund: Record<string, unknown> | null) {
    return {
        paymentRefund: { findUnique: jest.fn().mockResolvedValue(refund) },
        invoice: {
            findFirst: jest.fn().mockResolvedValue({ id: "inv_1" }),
        },
        $queryRaw: jest.fn(),
    };
}

const REFUND = {
    id: "rf_1",
    amountCents: 12000,
    forEdit: false,
    reason: null,
    status: "SUCCEEDED",
    paymentIntent: { orderId: "order_1", status: "SUCCEEDED" },
    lines: [],
};

describe("creditNoteForRefund", () => {
    it("credits money handed back from a superseded edit charge like any other", async () => {
        // Paid on a charge a later edit replaced, and invoiced when it came
        // in (#508, U8): its refund looks for the order's invoice to credit,
        // as every refund does. The note itself is specced against a real
        // database (order-kitchen.db.spec.ts).
        const tx = txWith({
            ...REFUND,
            paymentIntent: {
                id: "pi_old",
                orderId: "order_1",
                status: "SUPERSEDED",
            },
        });
        tx.invoice.findFirst.mockResolvedValue(null);
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).toHaveBeenCalledWith({
            where: { orderId: "order_1", kind: "INVOICE" },
            select: { id: true },
        });
    });

    it.each([
        ["an edit's refund", { forEdit: true }],
        ["a failed refund", { status: "FAILED" }],
    ])("credits nothing for %s", async (_what, over) => {
        const tx = txWith({ ...REFUND, ...over });
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).not.toHaveBeenCalled();
    });

    it("looks for the order's invoice for any other refund", async () => {
        const tx = txWith(REFUND);
        tx.invoice.findFirst.mockResolvedValue(null);
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).toHaveBeenCalledWith({
            where: { orderId: "order_1", kind: "INVOICE" },
            select: { id: true },
        });
    });
});

// A treatment's balance invoice (E9, DEC-050), raised after its deposit's:
// a supplementary invoice that prints the deposit's frozen seller and is
// taxed as the deposit was (ADR-008, DEC-082) — never today's settings.
describe("a treatment's balance invoice", () => {
    const money = (v: string) => ({ toString: () => v });

    /** A ₹1,180 deposit of a ₹2,360 treatment at 18%, as frozen at issue. */
    function deposit(over: Record<string, unknown> = {}) {
        return {
            id: "inv_dep",
            organizationId: "org_1",
            orderId: "order_1",
            currency: "INR",
            status: "PAID",
            source: "BOOKING",
            sellerGstin: "29AAGCR4375J1ZU",
            sellerState: "29",
            sellerAddress: "3 Hill Road, Bengaluru 560038, Karnataka",
            sellerName: "Kavi Dental",
            sellerLegalName: "Kavi Dental LLP",
            sellerEmail: "desk@kavi.in",
            placeOfSupply: "29",
            taxType: "INTRA",
            tax: money("180"),
            total: money("1180"),
            billToName: "Farah Khan",
            billToEmail: "farah@example.in",
            billToAddress: null,
            billToState: null,
            billToGstin: null,
            contactId: null,
            lines: [],
            ...over,
        };
    }

    /** Settings since changed: moved to Mumbai, a new GSTIN and name. */
    const TODAY = {
        gstRegistered: true,
        gstState: "27",
        taxId: "27AAGCR4375J1ZV",
        invoicePrefix: "RC",
        invoiceNumberFormat: null,
        timezone: "Asia/Kolkata",
        deliveryGstRate: "18",
        deliverySacCode: null,
        addressLine1: "12 Hill Road",
        addressLine2: null,
        city: "Mumbai",
        postalCode: "400050",
        legalName: "Kavi Dental Private Limited",
        contactEmail: "hello@kavi.in",
    };

    function balanceTx(original: ReturnType<typeof deposit>, today = TODAY) {
        return {
            $queryRaw: jest.fn(),
            order: {
                findUnique: jest
                    .fn()
                    // Whoever paid: nobody to link here.
                    .mockResolvedValueOnce(null)
                    .mockResolvedValueOnce({
                        total: money("2360"),
                        items: [
                            {
                                id: "item_1",
                                service: {
                                    name: "Root canal treatment",
                                    gstRate: money("18"),
                                    sacCode: "999312",
                                },
                            },
                        ],
                    }),
            },
            invoice: {
                findFirst: jest.fn().mockResolvedValue({
                    id: "inv_dep",
                    number: "RC/26-27/0001",
                }),
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce({ source: "BOOKING" })
                    .mockResolvedValueOnce(original),
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _sum: { total: null } }),
                create: jest.fn().mockResolvedValue({ id: "inv_bal" }),
            },
            invoiceLine: { createMany: jest.fn() },
            businessProfile: { findUnique: jest.fn().mockResolvedValue(today) },
            organization: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue({ name: "Kavi Dental Clinic" }),
            },
        };
    }

    async function balanceOf(
        original: ReturnType<typeof deposit>,
        today = TODAY,
    ) {
        const tx = balanceTx(original, today);
        await ensureOrderInvoice(tx as never, "order_1", {
            at: new Date("2026-10-05T06:00:00.000Z"),
            method: "CASH",
        });
        expect(tx.invoice.create).toHaveBeenCalledTimes(1);
        const data = (
            tx.invoice.create.mock.calls[0][0] as {
                data: Record<string, unknown>;
            }
        ).data;
        const lines = (
            tx.invoiceLine.createMany.mock.calls[0][0] as {
                data: Record<string, unknown>[];
            }
        ).data;
        return { data, lines };
    }

    beforeEach(() => jest.mocked(nextInvoiceNumber).mockClear());

    it("prints the deposit's seller, not today's settings", async () => {
        const { data } = await balanceOf(deposit());
        expect(data).toMatchObject({
            kind: "SUPPLEMENTARY",
            relatedInvoiceId: "inv_dep",
            status: "PAID",
            sellerGstin: "29AAGCR4375J1ZU",
            sellerState: "29",
            sellerAddress: "3 Hill Road, Bengaluru 560038, Karnataka",
            sellerName: "Kavi Dental",
            sellerLegalName: "Kavi Dental LLP",
            sellerEmail: "desk@kavi.in",
        });
    });

    it("is taxed as the deposit was: CGST + SGST in its state, though the business has moved", async () => {
        const { data, lines } = await balanceOf(deposit());
        expect(data).toMatchObject({
            placeOfSupply: "29",
            taxType: "INTRA",
            total: "1180.00",
            tax: "180.00",
            cgst: "90.00",
            sgst: "90.00",
            igst: "0.00",
        });
        expect(lines[0]).toMatchObject({
            description: "Balance for Root canal treatment",
            hsnSac: "999312",
            orderItemId: "item_1",
        });
        // Numbered in the registered series the deposit's paper is in.
        expect(nextInvoiceNumber).toHaveBeenCalledWith(
            expect.anything(),
            "org_1",
            expect.objectContaining({ stem: expect.stringContaining("/") }),
        );
    });

    it("keeps the deposit's IGST when it was billed to another state", async () => {
        // The deposit went to a Maharashtra buyer from Karnataka: IGST.
        // Today the business is in Maharashtra too — the balance still
        // follows the deposit's frozen state and place of supply.
        const { data } = await balanceOf(
            deposit({
                placeOfSupply: "27",
                taxType: "INTER",
                billToState: "27",
            }),
        );
        expect(data).toMatchObject({
            sellerState: "29",
            placeOfSupply: "27",
            taxType: "INTER",
            cgst: "0.00",
            sgst: "0.00",
            igst: "180.00",
        });
    });

    it("an unregistered deposit's balance is a receipt, though the business has registered since", async () => {
        const { data, lines } = await balanceOf(
            deposit({
                sellerGstin: null,
                sellerState: null,
                placeOfSupply: null,
                taxType: null,
                tax: money("0"),
            }),
        );
        expect(data).toMatchObject({
            sellerGstin: null,
            sellerState: null,
            sellerAddress: "3 Hill Road, Bengaluru 560038, Karnataka",
            sellerName: "Kavi Dental",
            placeOfSupply: null,
            taxType: null,
            total: "1180.00",
            tax: "0.00",
            cgst: "0.00",
            sgst: "0.00",
            igst: "0.00",
        });
        expect(lines[0]).toMatchObject({ gstRate: null, hsnSac: null });
        // A receipt's series: no financial year in the number.
        expect(nextInvoiceNumber).toHaveBeenCalledWith(
            expect.anything(),
            "org_1",
            expect.objectContaining({
                stem: expect.not.stringContaining("/"),
            }),
        );
    });

    it("recorded by the team: the balance of a tax invoice is refused while the service has no rate", async () => {
        const tx = balanceTx(deposit());
        tx.order.findUnique = jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                total: money("2360"),
                items: [
                    {
                        id: "item_1",
                        service: {
                            id: "svc_root",
                            name: "Root canal treatment",
                            gstRate: null,
                            sacCode: "999312",
                        },
                    },
                ],
            });
        await expect(
            ensureOrderInvoice(tx as never, "order_1", {
                method: "CASH",
                refuseUnsetRate: true,
            }),
        ).rejects.toMatchObject({
            response: {
                details: {
                    reason: "GST_RATE_MISSING",
                    items: [
                        {
                            kind: "SERVICE",
                            id: "svc_root",
                            name: "Root canal treatment",
                        },
                    ],
                },
            },
        });
        expect(tx.invoice.create).not.toHaveBeenCalled();
    });
});

// An order's invoice and an item with no GST rate chosen
// (`gst-rate-required.ts`): refused only where someone at the business is
// taking the payment; a customer's own payment writes the paper as before.
describe("an order's invoice and an item with no GST rate", () => {
    const money = (v: string) => ({ toString: () => v });

    const PROFILE = {
        gstRegistered: true,
        gstState: "29",
        taxId: "29AAGCR4375J1ZU",
        invoicePrefix: "RC",
        invoiceNumberFormat: null,
        timezone: "Asia/Kolkata",
        deliveryGstRate: "18",
        deliverySacCode: null,
        addressLine1: "14 Hill Road",
        addressLine2: null,
        city: "Bengaluru",
        postalCode: "560038",
        legalName: null,
        contactEmail: null,
    };

    const item = (
        id: string,
        product: Record<string, unknown> | null,
        service: Record<string, unknown> | null = null,
    ) => ({
        id,
        quantity: 1,
        price: money("590"),
        product,
        service,
        variant: null,
    });

    function orderTx(
        items: ReturnType<typeof item>[],
        profile: Record<string, unknown> | null = PROFILE,
    ) {
        const total = money(String(590 * items.length));
        return {
            $queryRaw: jest.fn(),
            order: {
                findUnique: jest
                    .fn()
                    // Whoever paid: nobody to link here.
                    .mockResolvedValueOnce(null)
                    .mockResolvedValueOnce({
                        organizationId: "org_1",
                        orderId: "ORD-014",
                        currency: "INR",
                        subtotal: total,
                        tax: money("0"),
                        shipping: money("0"),
                        discount: money("0"),
                        total,
                        fulfilment: "PICKUP",
                        deliveryName: null,
                        deliveryLine1: null,
                        deliveryLine2: null,
                        deliveryCity: null,
                        deliveryState: null,
                        deliveryPostalCode: null,
                        customer: {
                            firstName: "Asha",
                            lastName: "Rao",
                            email: "asha.rao@example.com",
                        },
                        walkInName: null,
                        items,
                    }),
            },
            invoice: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: "inv_new" }),
            },
            invoiceLine: { createMany: jest.fn() },
            businessProfile: {
                findUnique: jest.fn().mockResolvedValue(profile),
            },
            organization: {
                findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co." }),
            },
        };
    }

    const SERUM = {
        id: "prod_serum",
        name: "Vitamin C serum",
        gstRate: null,
        hsnCode: null,
    };
    const BREAD = {
        id: "prod_bread",
        name: "Sourdough loaf",
        gstRate: money("0"),
        hsnCode: "1905",
    };
    const FACIAL = {
        id: "svc_facial",
        name: "Facial, 3 visits",
        gstRate: null,
        sacCode: null,
    };

    it("refuses a payment taken by the team, naming each item once", async () => {
        const tx = orderTx([
            item("i_1", SERUM),
            item("i_2", BREAD),
            item("i_3", SERUM),
            item("i_4", null, FACIAL),
        ]);
        await expect(
            ensureOrderInvoice(tx as never, "order_1", {
                method: "CASH",
                refuseUnsetRate: true,
            }),
        ).rejects.toMatchObject({
            response: {
                message:
                    "Vitamin C serum and Facial, 3 visits have no GST rate. Choose one for each to issue this invoice.",
                details: {
                    reason: "GST_RATE_MISSING",
                    items: [
                        {
                            kind: "PRODUCT",
                            id: "prod_serum",
                            name: "Vitamin C serum",
                        },
                        {
                            kind: "SERVICE",
                            id: "svc_facial",
                            name: "Facial, 3 visits",
                        },
                    ],
                },
            },
        });
        expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("takes it when every item has a rate, 0% included", async () => {
        const tx = orderTx([
            item("i_1", { ...SERUM, gstRate: money("18") }),
            item("i_2", BREAD),
        ]);
        await expect(
            ensureOrderInvoice(tx as never, "order_1", {
                method: "CASH",
                refuseUnsetRate: true,
            }),
        ).resolves.toMatchObject({ id: "inv_new", created: true });
    });

    it("never asks a business that isn't registered", async () => {
        const tx = orderTx([item("i_1", SERUM)], {
            ...PROFILE,
            gstRegistered: false,
            taxId: null,
        });
        await expect(
            ensureOrderInvoice(tx as never, "order_1", {
                method: "CASH",
                refuseUnsetRate: true,
            }),
        ).resolves.toMatchObject({ created: true });
    });

    it("a customer's own payment is never refused: its invoice is written with the rate unset, as before", async () => {
        const tx = orderTx([item("i_1", SERUM)]);
        // The webhook's call: no `refuseUnsetRate`.
        await expect(
            ensureOrderInvoice(tx as never, "order_1", {
                method: "ONLINE",
                reference: "pay_123",
            }),
        ).resolves.toMatchObject({ id: "inv_new", created: true });
        const data = (
            tx.invoice.create.mock.calls[0][0] as {
                data: Record<string, unknown>;
            }
        ).data;
        expect(data).toMatchObject({
            sellerGstin: "29AAGCR4375J1ZU",
            total: "590.00",
            tax: "0.00",
        });
        const lines = (
            tx.invoiceLine.createMany.mock.calls[0][0] as {
                data: Record<string, unknown>[];
            }
        ).data;
        expect(lines[0]).toMatchObject({ gstRate: null });
    });
});

// An edit to an order whose tax invoice is out (`gst-rate-required.ts`):
// units added go on a supplementary invoice, written by someone at the
// business, so a product with no GST rate is asked for there.
describe("an edit's supplementary invoice and a product with no GST rate", () => {
    const unrated = {
        id: "prod_cake",
        name: "Walnut cake",
        gstRate: null,
        hsnCode: null,
    };
    const change = (productId: string | null, deltaQuantity: number) => ({
        orderItemId: null,
        productId,
        description: "Walnut cake",
        deltaQuantity,
        unitCents: 59000,
    });

    function editTx(sellerGstin: string | null) {
        return {
            $queryRaw: jest.fn(),
            invoice: {
                findFirst: jest.fn().mockResolvedValue({ id: "inv_1" }),
                findUnique: jest.fn().mockResolvedValue({
                    id: "inv_1",
                    organizationId: "org_1",
                    sellerGstin,
                    lines: [],
                }),
                create: jest.fn(),
            },
            product: { findMany: jest.fn().mockResolvedValue([unrated]) },
        };
    }

    it("refuses the edit, naming the product once, before anything is written", async () => {
        const tx = editTx("29AAGCR4375J1ZU");
        await expect(
            correctOrderInvoiceForEdit(tx as never, {
                orderId: "order_1",
                changes: [change("prod_cake", 1), change("prod_cake", 2)],
                note: null,
                createdByUserId: "user_1",
                settled: false,
            }),
        ).rejects.toMatchObject({
            response: {
                message:
                    "Walnut cake has no GST rate. Choose one to issue this invoice.",
                details: {
                    reason: "GST_RATE_MISSING",
                    items: [
                        {
                            kind: "PRODUCT",
                            id: "prod_cake",
                            name: "Walnut cake",
                        },
                    ],
                },
            },
        });
        expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("asks only about units added: never units taken off, delivery, or a product that is gone", () => {
        const products = new Map([[unrated.id, unrated]]);
        expect(addedProductLines([change("prod_cake", 2)], products)).toEqual([
            {
                kind: "PRODUCT",
                id: "prod_cake",
                name: "Walnut cake",
                rate: null,
            },
        ]);
        expect(addedProductLines([change("prod_cake", -1)], products)).toEqual(
            [],
        );
        expect(addedProductLines([change(null, 1)], products)).toEqual([]);
        expect(addedProductLines([change("prod_gone", 1)], products)).toEqual(
            [],
        );
    });

    it("an order with no invoice yet is edited as before", async () => {
        const tx = editTx("29AAGCR4375J1ZU");
        tx.invoice.findFirst.mockResolvedValue(null);
        await expect(
            correctOrderInvoiceForEdit(tx as never, {
                orderId: "order_1",
                changes: [change("prod_cake", 1)],
                note: null,
                createdByUserId: "user_1",
                settled: false,
            }),
        ).resolves.toEqual({ supplementary: null, creditNote: null });
        expect(tx.product.findMany).not.toHaveBeenCalled();
    });
});
