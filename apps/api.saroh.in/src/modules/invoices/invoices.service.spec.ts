// Invoices: the lifecycle, who may do what, and whose ids are trusted. The
// database is mocked; the arithmetic has its own spec (totals.spec.ts).
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn(),
        invoice: {
            create: jest.fn(),
            updateMany: jest.fn(),
            findFirst: jest.fn(),
        },
        invoiceLine: { createMany: jest.fn(), deleteMany: jest.fn() },
        invoiceSequence: { upsert: jest.fn() },
        contact: { findFirst: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            invoice: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                updateMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            contact: { findFirst: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoiceInputDto, RecordPaymentDto } from "./dto";
import { InvoicesService } from "./invoices.service";
import { serializeInvoice } from "./serialize";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as {
    invoice: Mocked;
    contact: Mocked;
    $transaction: jest.Mock;
    __tx: Record<string, Mocked>;
};
const tx = db.__tx;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };

const decimal = (s: string) => ({ toString: () => s });

function row(over: Record<string, unknown> = {}) {
    return {
        id: "inv_1",
        number: null,
        status: "DRAFT",
        contactId: "c_1",
        contact: {
            id: "c_1",
            firstName: "Asha",
            lastName: "Rao",
            email: "asha@example.com",
        },
        billToName: null,
        billToEmail: null,
        currency: "INR",
        subtotal: decimal("2200"),
        tax: decimal("396"),
        total: decimal("2596"),
        issuedAt: null,
        dueAt: null,
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdAt: new Date("2026-09-22T09:00:00Z"),
        updatedAt: new Date("2026-09-22T09:00:00Z"),
        lines: [
            {
                id: "l_1",
                position: 0,
                description: "Monthly membership",
                quantity: 1,
                unitPrice: decimal("1200"),
                amount: decimal("1200"),
            },
            {
                id: "l_2",
                position: 1,
                description: "Towel hire",
                quantity: 2,
                unitPrice: decimal("500"),
                amount: decimal("1000"),
            },
        ],
        ...over,
    };
}

const DRAFT_INPUT = {
    contactId: "c_1",
    currency: "INR",
    tax: "396",
    lines: [
        { description: "Monthly membership", quantity: 1, unitPrice: "1200" },
        { description: "Towel hire", quantity: 2, unitPrice: "500" },
    ],
};

const service = new InvoicesService();

beforeEach(() => {
    jest.clearAllMocks();
    db.contact.findFirst!.mockResolvedValue({ id: "c_1" });
    db.invoice.findFirst!.mockResolvedValue(row());
    tx.invoice!.create!.mockResolvedValue({ id: "inv_1" });
    tx.invoice!.updateMany!.mockResolvedValue({ count: 1 });
    tx.invoiceSequence!.upsert!.mockResolvedValue({ lastNumber: 1 });
    tx.contact!.findFirst!.mockResolvedValue({
        firstName: "Asha",
        lastName: "Rao",
        email: "asha@example.com",
    });
    db.invoice.updateMany!.mockResolvedValue({ count: 1 });
    db.invoice.deleteMany!.mockResolvedValue({ count: 1 });
});

describe("drafts", () => {
    it("prices a draft on the server and writes its lines in order", async () => {
        await service.createDraft(owner, DRAFT_INPUT as InvoiceInputDto);

        expect(tx.invoice!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    status: "DRAFT",
                    source: "MANUAL",
                    subtotal: "2200.00",
                    tax: "396.00",
                    total: "2596.00",
                    createdByUserId: "user_1",
                }),
            }),
        );
        expect(tx.invoiceLine!.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    position: 0,
                    organizationId: "org_1",
                    amount: "1200.00",
                }),
                expect.objectContaining({ position: 1, amount: "1000.00" }),
            ],
        });
    });

    it("refuses another business's contact with a 404 and writes nothing", async () => {
        db.contact.findFirst!.mockResolvedValue(null);
        await expect(
            service.createDraft(owner, {
                ...DRAFT_INPUT,
                contactId: "c_other",
            } as InvoiceInputDto),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.contact.findFirst).toHaveBeenCalledWith({
            where: { id: "c_other", organizationId: "org_1" },
            select: { id: true },
        });
        expect(tx.invoice!.create).not.toHaveBeenCalled();
    });

    it("needs someone to bill and a currency", async () => {
        await expect(
            service.createDraft(owner, {
                ...DRAFT_INPUT,
                contactId: undefined,
            } as InvoiceInputDto),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.createDraft(owner, {
                ...DRAFT_INPUT,
                currency: undefined,
            } as InvoiceInputDto),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to edit or delete an issued invoice", async () => {
        db.invoice.findFirst!.mockResolvedValue(
            row({ status: "ISSUED", number: "INV-0001" }),
        );
        await expect(
            service.updateDraft(owner, "inv_1", {
                tax: "0",
            } as InvoiceInputDto),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            service.deleteDraft(owner, "inv_1"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.invoice.deleteMany).not.toHaveBeenCalled();
    });

    it("replaces the lines as a whole when an edit sends them", async () => {
        await service.updateDraft(owner, "inv_1", {
            lines: [{ description: "Day pass", quantity: 1, unitPrice: "300" }],
        } as InvoiceInputDto);
        expect(tx.invoiceLine!.deleteMany).toHaveBeenCalledWith({
            where: { invoiceId: "inv_1" },
        });
        expect(tx.invoice!.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "inv_1",
                    organizationId: "org_1",
                    status: "DRAFT",
                },
                // The stored tax is kept when the edit does not send one.
                data: expect.objectContaining({
                    subtotal: "300.00",
                    tax: "396.00",
                    total: "696.00",
                }),
            }),
        );
    });
});

describe("issuing", () => {
    // The draft as read again under its lock.
    const draft = (over: Record<string, unknown> = {}) => ({
        status: "DRAFT",
        contactId: "c_1",
        dueAt: null,
        ...over,
    });
    beforeEach(() => {
        tx.invoice!.findFirst!.mockResolvedValue(draft());
    });

    it("numbers the invoice, copies the bill-to and makes it due in seven days", async () => {
        await service.issue(owner, "inv_1");

        expect(tx.invoiceSequence!.upsert).toHaveBeenCalled();
        const call = tx.invoice!.updateMany!.mock.calls[0]![0];
        expect(call.where).toEqual({
            id: "inv_1",
            organizationId: "org_1",
            status: "DRAFT",
        });
        expect(call.data).toEqual(
            expect.objectContaining({
                status: "ISSUED",
                number: "INV-0001",
                billToName: "Asha Rao",
                billToEmail: "asha@example.com",
            }),
        );
        const days =
            (call.data.dueAt.getTime() - call.data.issuedAt.getTime()) /
            86_400_000;
        expect(days).toBe(7);
    });

    it("gives the next invoice the next number", async () => {
        tx.invoiceSequence!.upsert!.mockResolvedValue({ lastNumber: 2 });
        await service.issue(owner, "inv_1");
        expect(tx.invoice!.updateMany!.mock.calls[0]![0].data.number).toBe(
            "INV-0002",
        );
    });

    it("keeps a due date the merchant chose", async () => {
        const due = new Date(Date.now() + 10 * 86_400_000);
        tx.invoice!.findFirst!.mockResolvedValue(draft({ dueAt: due }));
        await service.issue(owner, "inv_1");
        expect(tx.invoice!.updateMany!.mock.calls[0]![0].data.dueAt).toEqual(
            due,
        );
    });

    it("refuses a due date that has already passed, rather than issue it overdue", async () => {
        tx.invoice!.findFirst!.mockResolvedValue(
            draft({ dueAt: new Date(Date.now() - 86_400_000) }),
        );
        const attempt = service.issue(owner, "inv_1");
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toThrow("The due date has passed");
        expect(tx.invoiceSequence!.upsert).not.toHaveBeenCalled();
    });

    it("bills whoever the draft names under its lock, not an earlier read", async () => {
        // The first read saw c_1; an edit to c_2 landed before the lock.
        tx.invoice!.findFirst!.mockResolvedValue(draft({ contactId: "c_2" }));
        await service.issue(owner, "inv_1");
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.invoice!.findFirst!.mock.invocationCallOrder[0]!,
        );
        expect(tx.contact!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: "c_2" }),
            }),
        );
    });

    it("refuses a second issue, inside the transaction so its number rolls back", async () => {
        // Two clicks: the read saw a draft, but the other issue won.
        tx.invoice!.updateMany!.mockResolvedValue({ count: 0 });
        await expect(service.issue(owner, "inv_1")).rejects.toBeInstanceOf(
            ConflictException,
        );
        // The number was taken on the same transaction that threw.
        expect(tx.invoiceSequence!.upsert).toHaveBeenCalled();
    });

    it("refuses to issue an invoice that is already issued", async () => {
        db.invoice.findFirst!.mockResolvedValue(row({ status: "ISSUED" }));
        await expect(service.issue(owner, "inv_1")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(tx.invoiceSequence!.upsert).not.toHaveBeenCalled();
    });
});

describe("the bill-to", () => {
    it("reads what was copied on issue, not the contact as it is now", () => {
        const view = serializeInvoice(
            row({
                status: "ISSUED",
                billToName: "Asha Rao",
                billToEmail: "asha@example.com",
                // Edited after the invoice went out.
                contact: {
                    id: "c_1",
                    firstName: "Asha",
                    lastName: "Kumar",
                    email: "asha.k@example.com",
                },
            }) as never,
            new Date(),
        );
        expect(view.billTo).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
        });
    });
});

describe("who issued it", () => {
    it("says a renewal was issued automatically, and a person's was not", () => {
        const auto = serializeInvoice(
            row({
                status: "ISSUED",
                source: "SUBSCRIPTION",
                createdByUserId: null,
            }) as never,
            new Date(),
        );
        expect(auto.issuedAutomatically).toBe(true);
        const byHand = serializeInvoice(
            row({ status: "ISSUED", createdByUserId: "user_1" }) as never,
            new Date(),
        );
        expect(byHand.issuedAutomatically).toBe(false);
    });
});

describe("payments recorded by hand", () => {
    it("marks an issued invoice paid with the method and date", async () => {
        db.invoice.findFirst!.mockResolvedValue(row({ status: "ISSUED" }));
        await service.recordPayment(owner, "inv_1", {
            method: "UPI",
            reference: "UTR 4411",
            paidAt: "2026-09-22T11:00:00.000Z",
        } as RecordPaymentDto);
        expect(db.invoice.updateMany).toHaveBeenCalledWith({
            where: { id: "inv_1", organizationId: "org_1", status: "ISSUED" },
            data: {
                status: "PAID",
                paidAt: new Date("2026-09-22T11:00:00.000Z"),
                paymentMethod: "UPI",
                paymentReference: "UTR 4411",
                paymentNote: null,
            },
        });
    });

    it.each(["DRAFT", "VOID", "PAID"])(
        "refuses to record a payment on a %s invoice",
        async (status) => {
            db.invoice.findFirst!.mockResolvedValue(row({ status }));
            await expect(
                service.recordPayment(owner, "inv_1", {
                    method: "CASH",
                } as RecordPaymentDto),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(db.invoice.updateMany).not.toHaveBeenCalled();
        },
    );
});

describe("void and reissue", () => {
    const period = {
        source: "SUBSCRIPTION",
        subscriptionId: "sub_1",
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-10-01T00:00:00Z"),
    };

    beforeEach(() => {
        tx.invoice!.findFirst!.mockResolvedValueOnce({ status: "ISSUED" });
        tx.invoice!.findFirst!.mockResolvedValueOnce({
            contactId: "c_1",
            currency: "INR",
            subtotal: decimal("1200"),
            tax: decimal("0"),
            total: decimal("1200"),
            courseEnrollmentId: null,
            packPurchaseId: null,
            ...period,
            lines: [
                {
                    position: 0,
                    description: "Monthly membership",
                    quantity: 1,
                    unitPrice: decimal("1200"),
                    amount: decimal("1200"),
                },
            ],
        });
        tx.invoice!.create!.mockResolvedValue({ id: "inv_2" });
    });

    it("voids first, then opens a draft for the same period and lines", async () => {
        await service.reissue(owner, "inv_1", { reason: "Wrong amount" });

        const voidCall = tx.invoice!.updateMany!.mock.calls[0]![0];
        expect(voidCall.where).toEqual({
            id: "inv_1",
            organizationId: "org_1",
            status: "ISSUED",
        });
        expect(voidCall.data).toEqual(
            expect.objectContaining({
                status: "VOID",
                voidReason: "Wrong amount",
            }),
        );
        // The draft is created after the void, so the one-live-invoice-per-
        // period rule never sees two.
        expect(
            tx.invoice!.updateMany!.mock.invocationCallOrder[0],
        ).toBeLessThan(tx.invoice!.create!.mock.invocationCallOrder[0]!);
        expect(tx.invoice!.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                status: "DRAFT",
                reissuedFromId: "inv_1",
                contactId: "c_1",
                ...period,
            }),
            select: { id: true },
        });
        expect(tx.invoiceLine!.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    invoiceId: "inv_2",
                    organizationId: "org_1",
                    description: "Monthly membership",
                }),
            ],
        });
    });

    it("refuses to void a draft", async () => {
        tx.invoice!.findFirst!.mockReset();
        tx.invoice!.findFirst!.mockResolvedValue({ status: "DRAFT" });
        await expect(
            service.voidInvoice(owner, "inv_1", { reason: "x" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("issuing for another module", () => {
    it("writes everything on the caller's transaction, ISSUED with its source", async () => {
        const callerTx = tx as never;
        const result = await service.issueInTx(callerTx, "org_1", {
            contactId: "c_1",
            currency: "INR",
            lines: [
                {
                    description: "10-class pack",
                    quantity: 1,
                    unitPrice: "4500",
                },
            ],
            source: "PACK",
            packPurchaseId: "pp_1",
        });

        expect(result).toEqual({ id: "inv_1", number: "INV-0001" });
        expect(tx.invoice!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "ISSUED",
                    source: "PACK",
                    packPurchaseId: "pp_1",
                    billToName: "Asha Rao",
                    total: "4500.00",
                }),
            }),
        );
        // Never its own transaction: if the caller rolls back, so does this.
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a contact outside the business", async () => {
        tx.contact!.findFirst!.mockResolvedValue(null);
        await expect(
            service.issueInTx(tx as never, "org_1", {
                contactId: "c_other",
                currency: "INR",
                lines: [{ description: "x", quantity: 1, unitPrice: "1" }],
                source: "PACK",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.invoiceSequence!.upsert).not.toHaveBeenCalled();
    });
});

describe("who may", () => {
    it("refuses a Member every read and write", async () => {
        await expect(service.list(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(service.get(member, "inv_1")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.createDraft(member, DRAFT_INPUT as InvoiceInputDto),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.issue(member, "inv_1")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(db.invoice.findFirst).not.toHaveBeenCalled();
    });

    it("refuses a Member every change to an invoice already made", async () => {
        const attempts = [
            service.updateDraft(member, "inv_1", {} as InvoiceInputDto),
            service.deleteDraft(member, "inv_1"),
            service.voidInvoice(member, "inv_1", { reason: "Wrong amount" }),
            service.reissue(member, "inv_1", { reason: "Wrong amount" }),
            service.recordPayment(member, "inv_1", { method: "CASH" }),
        ];
        for (const attempt of attempts) {
            await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(db.invoice.findFirst).not.toHaveBeenCalled();
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("answers another business's invoice with a 404", async () => {
        db.invoice.findFirst!.mockResolvedValue(null);
        await expect(service.get(owner, "inv_other")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(db.invoice.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "inv_other", organizationId: "org_1" },
            }),
        );
    });
});

describe("lists and what is owed", () => {
    it("scopes the list to the business and the chosen view", async () => {
        db.invoice.findMany!.mockResolvedValue([]);
        await service.list(owner, { view: "overdue", contactId: "c_1" });
        const where = db.invoice.findMany!.mock.calls[0]![0].where;
        expect(where).toEqual({
            organizationId: "org_1",
            status: "ISSUED",
            dueAt: { lt: expect.any(Date) },
            contactId: "c_1",
        });
    });

    it("says what each listed invoice is for, without sending every line", async () => {
        db.invoice.findMany!.mockResolvedValue([
            row({
                lines: [{ description: "Personal training", quantity: 4 }],
                _count: { lines: 2 },
            }),
        ]);
        const [listed] = await service.list(owner, {});
        expect(listed!.summary).toEqual({
            description: "Personal training",
            quantity: 4,
            lineCount: 2,
        });
        expect(listed!.lines).toBeUndefined();
        expect(
            db.invoice.findMany!.mock.calls[0]![0].select.lines,
        ).toMatchObject({
            take: 1,
        });
    });

    it("adds up unpaid invoices per currency and counts the overdue", async () => {
        db.invoice.findMany!.mockResolvedValue([
            {
                status: "ISSUED",
                currency: "INR",
                total: decimal("1200"),
                dueAt: new Date(0),
            },
            {
                status: "ISSUED",
                currency: "INR",
                total: decimal("0.5"),
                dueAt: new Date(Date.now() + 86_400_000),
            },
            {
                status: "ISSUED",
                currency: "USD",
                total: decimal("40"),
                dueAt: null,
            },
        ]);
        await expect(
            service.owed(owner, { contactId: "c_1" }),
        ).resolves.toEqual({
            unpaidCount: 3,
            overdueCount: 1,
            totals: [
                { currency: "INR", amount: "1200.50" },
                { currency: "USD", amount: "40.00" },
            ],
        });
    });

    it("asks whose debt it is adding up", async () => {
        await expect(service.owed(owner, {})).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

describe("what the API accepts", () => {
    async function errors(body: unknown) {
        const dto = plainToInstance(InvoiceInputDto, body);
        return (await validate(dto)).flatMap((e) =>
            e.children?.length
                ? e.children.flatMap((c) =>
                      (c.children ?? []).map((cc) => cc.property),
                  )
                : [e.property],
        );
    }

    it("refuses a line with no quantity or a negative price", async () => {
        expect(
            await errors({
                lines: [{ description: "x", quantity: 0, unitPrice: "10" }],
            }),
        ).toContain("quantity");
        expect(
            await errors({
                lines: [{ description: "x", quantity: 1, unitPrice: "-10" }],
            }),
        ).toContain("unitPrice");
    });

    it("refuses an amount with more than two decimals", async () => {
        expect(await errors({ tax: "1.005" })).toContain("tax");
    });

    it("refuses an unknown payment method", async () => {
        const dto = plainToInstance(RecordPaymentDto, { method: "CHEQUE" });
        expect((await validate(dto)).map((e) => e.property)).toContain(
            "method",
        );
    });
});
