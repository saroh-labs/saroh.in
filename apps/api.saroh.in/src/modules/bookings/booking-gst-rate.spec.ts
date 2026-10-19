// DB-free: a booking's paper and a service with no GST rate chosen
// (`invoices/gst-rate-required.ts`). Someone at the desk is refused and
// asked for the rate (desk pay, a pay link); a customer booking and paying
// on the site is never refused, and that paper is written as it was.
// The transaction is a mocked client; the numbering and the tax profile are
// stubbed, and the document maths is the real one.
jest.mock("../invoices/order-invoicing", () => {
    const actual = jest.requireActual("../invoices/order-invoicing");
    return {
        ...actual,
        loadTaxProfile: jest.fn(),
        numberFor: jest.fn().mockResolvedValue("RC/26-27/0007"),
        writeDocumentLines: jest.fn(),
    };
});

// The ledger write is the db specs' (`invoice-other-writers.db.spec.ts`).
jest.mock("../invoices/invoice-ledger", () => ({
    lockInvoiceForLedgerOr404: jest
        .fn()
        .mockImplementation((_tx, organizationId, id) =>
            Promise.resolve({ id, organizationId }),
        ),
    recordLedgerPaymentInTx: jest.fn().mockResolvedValue({}),
}));

import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { GST_RATE_MISSING } from "../invoices/gst-rate-required";
import { recordLedgerPaymentInTx } from "../invoices/invoice-ledger";
import {
    loadTaxProfile,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { takeDeskPaymentInTx } from "./booking-desk-pay";
import { createHoldInvoiceInTx } from "./booking-hold";
import { bookingPayLinkInTx } from "./booking-pay-link";

const profile = loadTaxProfile as jest.Mock;
const lines = writeDocumentLines as jest.Mock;

const NOW = new Date("2026-10-12T09:00:00.000Z");
const START = new Date("2026-10-14T05:30:00.000Z");

const REGISTERED = {
    registered: true,
    gstin: "29ABCDE1234F1Z5",
    state: "29",
    prefix: "RC",
    timezone: "Asia/Kolkata",
    numberFormat: null,
    deliveryRateBps: 1800,
    deliverySac: null,
    address: "12 MG Road, Bengaluru 560001, Karnataka",
    seller: {
        sellerName: "Pulse Studio",
        sellerLegalName: null,
        sellerEmail: null,
    },
};
const UNREGISTERED = { ...REGISTERED, registered: false, gstin: null };

type Rate = { toString(): string } | null;

function booking(gstRate: Rate) {
    return {
        id: "bk_1",
        status: "CONFIRMED",
        paidWith: null,
        orderId: null,
        courseEnrollmentId: null,
        startAt: START,
        timezone: "Asia/Kolkata",
        contactId: "c_1",
        bookerName: "Priya Raman",
        bookerEmail: "priya.raman@example.com",
        snapshot: { service: { priceCents: 150_000, currency: "INR" } },
        service: {
            id: "svc_pt",
            name: "Personal Training",
            priceCents: 150_000,
            currency: "INR",
            gstRate,
            sacCode: "999723",
        },
    };
}

function client(opts: { gstRate: Rate; paper?: unknown[] }) {
    return {
        $queryRaw: jest.fn().mockResolvedValue([]),
        booking: {
            findFirst: jest.fn().mockResolvedValue(booking(opts.gstRate)),
            update: jest.fn().mockResolvedValue({}),
        },
        bookingEvent: { create: jest.fn().mockResolvedValue({ id: "ev_1" }) },
        invoice: {
            findMany: jest.fn().mockResolvedValue(opts.paper ?? []),
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest
                .fn()
                .mockResolvedValue({ id: "inv_1", number: "RC/26-27/0007" }),
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
    };
}

const asTx = (c: ReturnType<typeof client>) =>
    c as unknown as Prisma.TransactionClient;

const TAKE = {
    organizationId: "org_1",
    bookingId: "bk_1",
    actorUserId: "user_1",
    method: "CASH" as const,
    amountCents: 150_000,
    now: NOW,
};

/** The refusal's body, as the exception filter sends it. */
async function refusalOf(run: Promise<unknown>) {
    const error = await run.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as {
        message: string;
        details: { reason: string; items: unknown[] };
    };
}

describe("a desk payment for a booking, and the service's GST rate", () => {
    beforeEach(() => jest.clearAllMocks());

    it("is refused for a registered business when the service has no rate, naming the service", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: null });
        const body = await refusalOf(takeDeskPaymentInTx(asTx(c), TAKE));
        expect(body.message).toBe(
            "Personal Training has no GST rate. Choose one to issue this invoice.",
        );
        expect(body.details).toEqual({
            reason: GST_RATE_MISSING,
            items: [
                { kind: "SERVICE", id: "svc_pt", name: "Personal Training" },
            ],
        });
        // Nothing was numbered or written.
        expect(c.invoice.create).not.toHaveBeenCalled();
        expect(c.bookingEvent.create).not.toHaveBeenCalled();
    });

    it("is taken once the rate is chosen, and the line carries it", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: "18" });
        const taken = await takeDeskPaymentInTx(asTx(c), TAKE);
        expect(taken).toMatchObject({ invoiceId: "inv_1", replayed: false });
        const doc = lines.mock.calls[0][3];
        expect(doc.lines[0]).toMatchObject({ rateBps: 1800 });
        expect(doc.taxCents).toBeGreaterThan(0);
    });

    it("takes an exempt service: 0% is a rate somebody chose", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: "0" });
        await expect(takeDeskPaymentInTx(asTx(c), TAKE)).resolves.toMatchObject(
            { invoiceId: "inv_1" },
        );
        const doc = lines.mock.calls[0][3];
        expect(doc.lines[0]).toMatchObject({ rateBps: 0 });
        expect(doc.taxCents).toBe(0);
    });

    it("never asks a business that isn't registered", async () => {
        profile.mockResolvedValue(UNREGISTERED);
        const c = client({ gstRate: null });
        await expect(takeDeskPaymentInTx(asTx(c), TAKE)).resolves.toMatchObject(
            { invoiceId: "inv_1" },
        );
    });

    it("marks an invoice already out as paid without asking: that paper is issued", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({
            gstRate: null,
            paper: [
                {
                    id: "inv_out",
                    number: "RC/26-27/0003",
                    kind: "INVOICE",
                    status: "ISSUED",
                    paymentMethod: null,
                    total: "1500.00",
                    currency: "INR",
                    paidAt: null,
                    sellerGstin: "29ABCDE1234F1Z5",
                    paymentIntents: [],
                },
            ],
        });
        await expect(takeDeskPaymentInTx(asTx(c), TAKE)).resolves.toMatchObject(
            { invoiceId: "inv_out" },
        );
        expect(c.invoice.create).not.toHaveBeenCalled();
        // Paid on its ledger (DEC-173), for what the desk took.
        expect(recordLedgerPaymentInTx).toHaveBeenCalledWith(
            c,
            { id: "inv_out", organizationId: "org_1" },
            expect.objectContaining({ amountCents: 150_000, method: "CASH" }),
        );
    });

    it("is refused for the balance of a tax invoice's deposit, and not for a receipt's", async () => {
        profile.mockResolvedValue(REGISTERED);
        const deposit = (sellerGstin: string | null) => ({
            id: "inv_dep",
            number: "RC/26-27/0002",
            kind: "INVOICE",
            status: "PAID",
            paymentMethod: "ONLINE",
            total: "500.00",
            currency: "INR",
            paidAt: new Date("2026-10-10T09:00:00.000Z"),
            createdByUserId: null,
            sellerGstin,
            sellerState: sellerGstin ? "29" : null,
            sellerAddress: null,
            sellerName: "Pulse Studio",
            sellerLegalName: null,
            sellerEmail: null,
            placeOfSupply: sellerGstin ? "29" : null,
            taxType: sellerGstin ? "INTRA" : null,
            contactId: "c_1",
            billToName: "Priya Raman",
            billToEmail: "priya.raman@example.com",
            billToAddress: null,
            billToState: null,
            billToGstin: null,
            paymentIntents: [{ status: "SUCCEEDED", amountCents: 50_000 }],
        });
        const balance = { ...TAKE, amountCents: 100_000 };

        const taxed = client({
            gstRate: null,
            paper: [deposit("29ABCDE1234F1Z5")],
        });
        const body = await refusalOf(takeDeskPaymentInTx(asTx(taxed), balance));
        expect(body.details.reason).toBe(GST_RATE_MISSING);
        expect(taxed.invoice.create).not.toHaveBeenCalled();

        const receipt = client({ gstRate: null, paper: [deposit(null)] });
        await expect(
            takeDeskPaymentInTx(asTx(receipt), balance),
        ).resolves.toMatchObject({ amountCents: 100_000 });
    });
});

describe("a booking's pay link, and the service's GST rate", () => {
    beforeEach(() => jest.clearAllMocks());

    const LINK = {
        organizationId: "org_1",
        bookingId: "bk_1",
        actorUserId: "user_1",
        now: NOW,
    };

    it("is refused for a registered business when the service has no rate", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: null });
        const body = await refusalOf(bookingPayLinkInTx(asTx(c), LINK));
        expect(body.details).toEqual({
            reason: GST_RATE_MISSING,
            items: [
                { kind: "SERVICE", id: "svc_pt", name: "Personal Training" },
            ],
        });
        expect(c.invoice.create).not.toHaveBeenCalled();
    });

    it("is made once the rate is chosen, and for a business that isn't registered", async () => {
        profile.mockResolvedValue(REGISTERED);
        const rated = client({ gstRate: "5" });
        await expect(
            bookingPayLinkInTx(asTx(rated), LINK),
        ).resolves.toMatchObject({ invoiceId: "inv_1" });

        profile.mockResolvedValue(UNREGISTERED);
        const receipt = client({ gstRate: null });
        await expect(
            bookingPayLinkInTx(asTx(receipt), LINK),
        ).resolves.toMatchObject({ invoiceId: "inv_1" });
    });

    it("makes a new link on an invoice already out without asking", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: null });
        c.invoice.findFirst.mockResolvedValue({
            id: "inv_out",
            status: "ISSUED",
        });
        await expect(bookingPayLinkInTx(asTx(c), LINK)).resolves.toMatchObject({
            invoiceId: "inv_out",
        });
    });
});

describe("a customer booking and paying on the site", () => {
    beforeEach(() => jest.clearAllMocks());

    it("is never refused for an unset rate: the hold's invoice is written as before, untaxed", async () => {
        profile.mockResolvedValue(REGISTERED);
        const c = client({ gstRate: null });
        const made = await createHoldInvoiceInTx(asTx(c), {
            organizationId: "org_1",
            bookingId: "bk_1",
            contactId: "c_1",
            billToName: "Priya Raman",
            billToEmail: "priya.raman@example.com",
            service: {
                name: "Personal Training",
                priceCents: 150_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
                gstRate: null,
                sacCode: "999723",
            },
            startAt: START,
        });
        expect(made.invoiceId).toBe("inv_1");
        const doc = lines.mock.calls[0][3];
        expect(doc.lines[0]).toMatchObject({ rateBps: null });
        expect(doc.taxCents).toBe(0);
        expect(doc.totalCents).toBe(150_000);
    });
});
