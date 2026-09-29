// Sending an invoice (D17) with the database mocked: who may, the refusals a
// real database can't easily stage, the channel rule's order, and the money
// and date words. The full send runs in invoice-send.db.spec.ts.
jest.mock("../../env", () => ({
    env: { NODE_ENV: "test", RENDERER_URL: "https://saroh.app" },
}));

jest.mock("../communications/account-thread", () => ({
    ACCOUNT_THREAD_POSTER: Symbol("ACCOUNT_THREAD_POSTER"),
    accountThreadOn: jest.fn().mockResolvedValue(true),
}));

// The business-details refusal (DEC-068) has its own specs
// (`business-details.spec.ts`, `business-details.db.spec.ts`); here
// the business has its address.
jest.mock("./business-details", () => ({
    ...jest.requireActual<typeof import("./business-details")>(
        "./business-details",
    ),
    assertBusinessDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@saroh/database", () => {
    const client = {
        invoice: { findFirst: jest.fn() },
        message: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        customerThreadMessage: { findFirst: jest.fn(), count: jest.fn() },
        merchantPaymentProvider: { count: jest.fn() },
        // D13: an autopay charge under way holds the send.
        paymentIntent: { findMany: jest.fn() },
        customerAccount: { count: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        organization: { findUnique: jest.fn() },
        $queryRaw: jest.fn(),
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { accountThreadOn } from "../communications/account-thread";
import type { CommunicationsService } from "../communications/communications.service";
import {
    formatDay,
    formatMoney,
    formatWhen,
    InvoiceSendService,
} from "./invoice-send.service";
import type { InvoicesService } from "./invoices.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked>;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

const decimal = (s: string) => ({ toString: () => s });

function row(over: Record<string, unknown> = {}) {
    return {
        id: "inv_1",
        number: "INV-0042",
        status: "ISSUED",
        kind: "INVOICE",
        source: "MANUAL",
        orderId: null,
        contactId: "c_1",
        billToName: "Asha Rao",
        currency: "INR",
        total: decimal("2400"),
        dueAt: null,
        contact: { firstName: "Asha", lastName: "Rao" },
        ...over,
    };
}

const comms = {
    emailConnected: jest.fn(),
    transactionalAddress: jest.fn(),
    queueTransactional: jest.fn(),
};
const poster = { post: jest.fn() };

function service(withPoster = false) {
    return new InvoiceSendService(
        {} as InvoicesService,
        comms as unknown as CommunicationsService,
        withPoster ? poster : undefined,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    db.invoice!.findFirst!.mockResolvedValue(row());
    db.message!.findFirst!.mockResolvedValue(null);
    db.message!.findMany!.mockResolvedValue([]);
    db.message!.count!.mockResolvedValue(0);
    db.customerThreadMessage!.findFirst!.mockResolvedValue(null);
    db.customerThreadMessage!.count!.mockResolvedValue(0);
    db.merchantPaymentProvider!.count!.mockResolvedValue(1);
    db.paymentIntent!.findMany!.mockResolvedValue([]);
    db.customerAccount!.count!.mockResolvedValue(0);
    db.businessProfile!.findUnique!.mockResolvedValue(null);
    comms.emailConnected.mockResolvedValue(true);
    comms.transactionalAddress.mockResolvedValue({
        address: "asha@example.com",
        contactId: "c_1",
    });
    (accountThreadOn as jest.Mock).mockResolvedValue(true);
});

describe("the send flag", () => {
    it("needs a payment provider: no pay link, nothing to send", async () => {
        db.merchantPaymentProvider!.count!.mockResolvedValue(0);
        const { send } = await service().readFor("org_1", "inv_1");
        expect(send).toEqual({
            channels: [],
            reason: "NO_PAYMENT_PROVIDER",
            nextReminderAt: null,
        });
    });

    it("an autopay charge under way holds it: AUTOPAY_PENDING, and a send is a 409 (D13)", async () => {
        db.paymentIntent!.findMany!.mockResolvedValue([
            {
                id: "pi_m",
                invoiceId: "inv_1",
                debitAfter: new Date("2026-10-02T10:00:00Z"),
                createdAt: new Date("2026-10-01T10:00:00Z"),
            },
        ]);
        const { send } = await service().readFor("org_1", "inv_1");
        expect(send).toMatchObject({ channels: [], reason: "AUTOPAY_PENDING" });
        await expect(service().remind(owner, "inv_1")).rejects.toThrow(
            "Autopay charge in progress",
        );
        expect(comms.queueTransactional).not.toHaveBeenCalled();
    });

    it("no email address and no thread: NO_EMAIL_ADDRESS", async () => {
        comms.transactionalAddress.mockResolvedValue(null);
        const { send } = await service().readFor("org_1", "inv_1");
        expect(send.reason).toBe("NO_EMAIL_ADDRESS");
    });

    it.each([
        ["an order's invoice", { orderId: "o_1" }],
        ["a credit note", { kind: "CREDIT_NOTE" }],
        ["a void one", { status: "VOID" }],
        ["a credited one", { status: "CREDITED" }],
        ["a booking's pay-now hold", { status: "DRAFT", source: "BOOKING" }],
    ])("is off for %s", async (_label, over) => {
        db.invoice!.findFirst!.mockResolvedValue(row(over));
        const { send } = await service().readFor("org_1", "inv_1");
        expect(send.channels).toEqual([]);
        expect(send.reason).toBe("NOT_OWED");
    });

    it("offers the thread only with the poster, the flag and an active account", async () => {
        db.customerAccount!.count!.mockResolvedValue(1);
        expect(
            (await service().readFor("org_1", "inv_1")).send.channels,
        ).toEqual(["email"]);
        expect(
            (await service(true).readFor("org_1", "inv_1")).send.channels,
        ).toEqual(["email", "thread"]);
        (accountThreadOn as jest.Mock).mockResolvedValue(false);
        expect(
            (await service(true).readFor("org_1", "inv_1")).send.channels,
        ).toEqual(["email"]);
    });

    it("reads its sends newest first, within the business", async () => {
        db.message!.findMany!.mockResolvedValue([
            {
                id: "m_2",
                toAddress: "asha@example.com",
                createdAt: new Date("2026-09-03T05:00:00Z"),
                template: "INVOICE_REMINDER",
                status: "SUPPRESSED",
            },
        ]);
        const { sent } = await service().readFor("org_1", "inv_1");
        expect(sent).toEqual([
            {
                id: "m_2",
                channel: "email",
                to: "asha@example.com",
                at: "2026-09-03T05:00:00.000Z",
                reminder: true,
                status: "SUPPRESSED",
            },
        ]);
        expect(db.message!.findMany!.mock.calls[0][0].where).toMatchObject({
            organizationId: "org_1",
            invoiceId: "inv_1",
        });
    });
});

describe("sending", () => {
    it("needs invoice:write", async () => {
        await expect(
            service().send({ ...owner, role: "MEMBER" }, "inv_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it.each([
        [{ orderId: "o_1" }, "belongs to an order"],
        [{ kind: "CREDIT_NOTE" }, "A credit note isn't sent for payment."],
        [{ status: "DRAFT" }, "Issue the invoice before sending it."],
        [{ status: "PAID" }, "Already paid."],
        [{ status: "VOID" }, "A void invoice isn't sent."],
    ])("refuses %o with 409", async (over, message) => {
        db.invoice!.findFirst!.mockResolvedValue(row(over));
        await expect(service().send(owner, "inv_1")).rejects.toThrow(message);
        expect(comms.queueTransactional).not.toHaveBeenCalled();
    });

    it("locks the invoice row before it reads it", async () => {
        comms.queueTransactional.mockResolvedValue({
            id: "m_1",
            status: "QUEUED",
            toAddress: "asha@example.com",
        });
        db.organization!.findUnique!.mockResolvedValue({ name: "Rye & Co." });
        await service().send(owner, "inv_1");
        const lock = db.$queryRaw!.mock.invocationCallOrder[0]!;
        const read = db.invoice!.findFirst!.mock.invocationCallOrder[0]!;
        expect(lock).toBeLessThan(read);
        expect(comms.queueTransactional.mock.calls[0][2]).toMatchObject({
            template: "INVOICE_SENT",
            recipient: { kind: "INVOICE_BILL_TO", invoiceId: "inv_1" },
            invoiceId: "inv_1",
            createdByUserId: "user_1",
            vars: {
                business: "Rye & Co.",
                firstName: "Asha",
                number: "INV-0042",
                total: "₹2,400.00",
                dueOn: null,
                overdue: false,
            },
        });
    });
});

describe("the words", () => {
    it("formats money from its decimal string, Indian grouping", () => {
        expect(formatMoney(decimal("2400"), "INR")).toBe("₹2,400.00");
        expect(formatMoney(decimal("1234567.5"), "INR")).toBe("₹12,34,567.50");
    });

    it("formats a day and a moment in the business's zone", () => {
        const late = new Date("2026-10-02T20:00:00Z"); // 3 Oct, 1:30 am in India
        expect(formatDay(late, "Asia/Kolkata")).toBe("3 Oct 2026");
        expect(formatDay(late, "UTC")).toBe("2 Oct 2026");
        expect(formatWhen(late, "Asia/Kolkata")).toMatch(/^3 Oct, 1:30 am$/i);
    });
});
