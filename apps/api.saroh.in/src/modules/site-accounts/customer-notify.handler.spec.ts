// `customer.notify` (round-2 A14) against a stand-in transaction: what it
// writes into the customer's thread, what it emails through D17's path, and
// every reason it writes nothing. The DB-backed twin is
// customer-notify.db.spec.ts.

jest.mock("../communications/account-thread", () => ({
    accountThreadOn: jest.fn(),
}));
jest.mock("./account-area", () => ({ accountAreaOn: jest.fn() }));
jest.mock("../customer-workspace/resolve-contact", () => ({
    resolveContact: jest.fn(),
}));
jest.mock("./thread-store", () => ({ appendMessage: jest.fn() }));
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { accountThreadOn } from "../communications/account-thread";
import type { CommunicationsService } from "../communications/communications.service";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { accountAreaOn } from "./account-area";
import type { CustomerNotifyPayload } from "./customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "./customer-notify.handler";
import { orderStepNotice } from "./notices/order";
import { appendMessage } from "./thread-store";

const threadFlag = accountThreadOn as jest.Mock;
const areaOn = accountAreaOn as jest.Mock;
const resolve = resolveContact as jest.Mock;
const append = appendMessage as jest.Mock;

const NOW = new Date("2026-10-06T05:30:00.000Z");
const ORG = "org_1";

function makeTx() {
    return {
        // The plan-meter lock a booking notice takes first (DEC-086).
        $executeRaw: jest.fn().mockResolvedValue(1),
        customerNotice: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
        },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co." }),
        },
        booking: { findFirst: jest.fn() },
        bookingEvent: { findFirst: jest.fn() },
        order: {
            findFirst: jest.fn().mockResolvedValue({
                id: "order_1",
                orderId: "ORD-1019",
                status: "PROCESSING",
                fulfilment: "PICKUP",
                customerId: "cus_1",
                customerAccountId: "acc_1",
                courierName: null,
                trackingNumber: null,
                trackingUrl: null,
                customer: { firstName: "Asha" },
            }),
        },
        orderEvent: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ toStage: "READY", undoneAt: null }),
        },
        customerAccount: {
            // By id: the account that placed an order. By contact: the
            // live account whose verified address a notice goes to (A2).
            findFirst: jest.fn(
                (args: { where: { id?: string; contactId?: string } }) =>
                    Promise.resolve(
                        args.where.id
                            ? { contactId: "ct_1" }
                            : account.live
                              ? { email: "asha@example.com" }
                              : null,
                    ),
            ),
            count: jest.fn(() => Promise.resolve(account.live ? 1 : 0)),
        },
        contact: {
            findFirst: jest.fn(() =>
                Promise.resolve({ email: account.contactEmail }),
            ),
        },
        customerNoticeSetting: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
        customerIdentityLink: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ status: "CONNECTED", provider: "RESEND" }),
        },
    };
}
type FakeTx = ReturnType<typeof makeTx>;

/** Whether the contact has a live site account, and their own email. */
const account = { live: true, contactEmail: "asha.own@example.com" };
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

const queueTransactional = jest.fn();
const comms = { queueTransactional } as unknown as CommunicationsService;
const service = new CustomerNotifyService(comms);

const READY: CustomerNotifyPayload = {
    kind: "ORDER_READY",
    eventKey: "order:ev_ready",
    orderId: "order_1",
    orderEventId: "ev_ready",
};

beforeEach(() => {
    jest.clearAllMocks();
    areaOn.mockReturnValue(true);
    threadFlag.mockResolvedValue(true);
    resolve.mockImplementation((_tx: unknown, id: string) =>
        Promise.resolve({
            id,
            organizationId: ORG,
            mergedFrom: null,
            removed: false,
        }),
    );
    append.mockResolvedValue({ id: "ctm_1" });
    account.live = true;
    account.contactEmail = "asha.own@example.com";
    queueTransactional.mockResolvedValue({
        id: "msg_1",
        status: "QUEUED",
        toAddress: "asha@example.com",
    });
});

describe("customer.notify — what it writes", () => {
    it("Ready: a SYSTEM message in their thread and an email to their account, both recorded", async () => {
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);

        expect(out).toEqual({
            duplicate: false,
            threadMessageId: "ctm_1",
            messageId: "msg_1",
        });
        expect(append).toHaveBeenCalledWith(tx, {
            organizationId: ORG,
            contactId: "ct_1",
            author: "SYSTEM",
            body: "Your order ORD-1019 is ready for pick-up.",
            event: "ORDER_READY",
            now: NOW,
        });
        expect(queueTransactional).toHaveBeenCalledWith(tx, ORG, {
            template: "ORDER_READY",
            notice: expect.objectContaining({
                kind: "ORDER_READY",
                order: expect.objectContaining({
                    business: "Rye & Co.",
                    number: "ORD-1019",
                }) as unknown,
            }) as unknown,
            // Through the business's own provider, read once and handed
            // over.
            provider: "RESEND",
            recipient: { kind: "CONTACT", contactId: "ct_1" },
            createdByUserId: null,
        });
        // The event is claimed before anything is written, then filled in.
        expect(tx.customerNotice.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: ORG,
                    eventKey: "order:ev_ready",
                    kind: "ORDER_READY",
                    bookingId: null,
                    orderId: "order_1",
                },
            ],
            skipDuplicates: true,
        });
        expect(tx.customerNotice.update.mock.calls[0][0].data).toEqual({
            contactId: "ct_1",
            bookingId: null,
            orderId: "order_1",
            threadMessageId: "ctm_1",
            messageId: "msg_1",
        });
    });

    it("no email provider: the thread message only", async () => {
        const tx = makeTx();
        tx.communicationProvider.findUnique.mockResolvedValue(null);
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out.threadMessageId).toBe("ctm_1");
        expect(out.messageId).toBeNull();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("a disconnected provider sends nothing either", async () => {
        const tx = makeTx();
        tx.communicationProvider.findUnique.mockResolvedValue({
            status: "DISABLED",
        });
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("the thread flag off (the default): email alone", async () => {
        threadFlag.mockResolvedValue(false);
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
        expect(out).toMatchObject({
            threadMessageId: null,
            messageId: "msg_1",
        });
    });

    // `accountThreadOn` is one answer for the rollout flag and the
    // business's own choice (`account-thread.spec.ts`): turned off by the
    // business, the notice goes exactly as it did with the flag off.
    it("a business that turned its updates off and has no email: nothing is written or sent", async () => {
        threadFlag.mockResolvedValue(false);
        const tx = makeTx();
        tx.communicationProvider.findUnique.mockResolvedValue(null);
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
        expect(out).toMatchObject({ threadMessageId: null, messageId: null });
    });

    it("the account area off: the thread stays dark whatever the flag says", async () => {
        areaOn.mockReturnValue(false);
        const tx = makeTx();
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
        expect(threadFlag).not.toHaveBeenCalled();
    });

    it("a customer without an account but with an email (a desk, phone or guest booking): emailed to the contact, D1", async () => {
        account.live = false;
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out).toMatchObject({
            threadMessageId: "ctm_1",
            messageId: "msg_1",
        });
        expect(queueTransactional).toHaveBeenCalledWith(
            tx,
            ORG,
            expect.objectContaining({
                provider: "RESEND",
                recipient: { kind: "CONTACT", contactId: "ct_1" },
            }),
        );
    });

    it("a customer with no account and no email of their own: waiting in the thread for their first sign-in, and no email", async () => {
        account.live = false;
        account.contactEmail = "";
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out).toMatchObject({
            threadMessageId: "ctm_1",
            messageId: null,
        });
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("a contact whose only email is a reserved placeholder is not emailed", async () => {
        account.live = false;
        account.contactEmail = "phone+1@phone.invalid";
        const tx = makeTx();
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("nothing reaches anyone: the event is still claimed, so a rerun stays quiet", async () => {
        threadFlag.mockResolvedValue(false);
        account.live = false;
        account.contactEmail = "";
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out).toEqual({
            duplicate: false,
            threadMessageId: null,
            messageId: null,
        });
        expect(tx.customerNotice.createMany).toHaveBeenCalled();
    });

    it("an order a site account didn't place is told to the contact its store customer is linked to", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            customerAccountId: null,
        });
        tx.customerIdentityLink.findFirst.mockResolvedValue({
            contactId: "ct_linked",
        });
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append.mock.calls[0][1]).toMatchObject({
            contactId: "ct_linked",
        });
    });

    it("a handover names the courier and its number", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            fulfilment: "SHIPPING",
            courierName: "Delhivery",
            trackingNumber: "AWB4411",
        });
        tx.orderEvent.findFirst.mockResolvedValue({
            toStage: "HANDED_TO_COURIER",
            undoneAt: null,
        });
        await service.notify(
            asTx(tx),
            ORG,
            { ...READY, kind: "ORDER_HANDED_OVER" },
            NOW,
        );
        expect(append.mock.calls[0][1].body).toBe(
            "Your order ORD-1019 is on its way with Delhivery. Tracking number: AWB4411.",
        );
    });
});

describe("customer.notify — no provider, no email (DEC-086 removed)", () => {
    const MOVED: CustomerNotifyPayload = {
        kind: "BOOKING_MOVED",
        eventKey: "booking:ev_2",
        bookingId: "bk_1",
        bookingEventId: "ev_2",
    };

    it("a booking notice at a business with no provider goes to the thread alone: no email, no lock", async () => {
        const tx = makeTx();
        tx.communicationProvider.findUnique.mockResolvedValue(null);
        tx.booking.findFirst.mockResolvedValue({
            id: "bk_1",
            status: "CONFIRMED",
            startAt: NOW,
            timezone: "Asia/Kolkata",
            contactId: "ct_1",
            bookerName: "Asha Rao",
            courseEnrollmentId: null,
            service: { name: "Check-up" },
            staff: null,
            contact: { firstName: "Asha" },
        });
        tx.bookingEvent.findFirst.mockResolvedValue(null);
        const out = await service.notify(asTx(tx), ORG, MOVED, NOW);
        expect(out.messageId).toBeNull();
        expect(queueTransactional).not.toHaveBeenCalled();
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
});

describe("customer.notify — a kind with a switch (U1)", () => {
    // No kind today has one (A1); the next units' kinds do. Stand one in.
    beforeEach(() => {
        jest.replaceProperty(orderStepNotice, "setting", "ORDER_DELIVERY");
    });
    afterEach(() => jest.restoreAllMocks());

    it("turned off: nobody is told, nothing is claimed, read on the job's transaction", async () => {
        const tx = makeTx();
        tx.customerNoticeSetting.findUnique.mockResolvedValue({
            enabled: false,
        });
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out).toEqual({
            duplicate: false,
            threadMessageId: null,
            messageId: null,
        });
        expect(tx.customerNoticeSetting.findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_kind: {
                    organizationId: ORG,
                    kind: "ORDER_DELIVERY",
                },
            },
            select: { enabled: true },
        });
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("at its default (on): told as any notice", async () => {
        const tx = makeTx();
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out.messageId).toBe("msg_1");
    });
});

describe("customer.notify — once, and only what still stands", () => {
    it("an event already handled writes nothing", async () => {
        const tx = makeTx();
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const out = await service.notify(asTx(tx), ORG, READY, NOW);
        expect(out.duplicate).toBe(true);
        expect(tx.order.findFirst).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("a step undone before it ran isn't announced", async () => {
        const tx = makeTx();
        tx.orderEvent.findFirst.mockResolvedValue({
            toStage: "READY",
            undoneAt: NOW,
        });
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("an order cancelled meanwhile isn't announced", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            status: "CANCELLED",
        });
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
    });

    it("a merged-away contact is told as its survivor", async () => {
        resolve.mockResolvedValue({
            id: "ct_survivor",
            organizationId: ORG,
            mergedFrom: "ct_1",
            removed: false,
        });
        const tx = makeTx();
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append.mock.calls[0][1].contactId).toBe("ct_survivor");
        expect(queueTransactional.mock.calls[0][2].recipient).toEqual({
            kind: "CONTACT",
            contactId: "ct_survivor",
        });
    });

    it("a contact removed for privacy hears nothing", async () => {
        resolve.mockResolvedValue({
            id: "ct_1",
            organizationId: ORG,
            mergedFrom: null,
            removed: true,
        });
        const tx = makeTx();
        await service.notify(asTx(tx), ORG, READY, NOW);
        expect(append).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("a booking cancelled since isn't confirmed", async () => {
        const tx = makeTx();
        tx.booking.findFirst.mockResolvedValue({
            id: "bk_1",
            status: "CANCELLED",
            startAt: NOW,
            timezone: "Asia/Kolkata",
            contactId: "ct_1",
            bookerName: "Asha Rao",
            courseEnrollmentId: null,
            service: { name: "Check-up" },
            staff: null,
            contact: { firstName: "Asha" },
        });
        await service.notify(
            asTx(tx),
            ORG,
            {
                kind: "BOOKING_CONFIRMED",
                eventKey: "booking:ev_1",
                bookingId: "bk_1",
                bookingEventId: "ev_1",
            },
            NOW,
        );
        expect(append).not.toHaveBeenCalled();
    });

    it("a customer's own move is worded as theirs", async () => {
        const tx = makeTx();
        tx.booking.findFirst.mockResolvedValue({
            id: "bk_1",
            status: "CONFIRMED",
            startAt: NOW,
            timezone: "Asia/Kolkata",
            contactId: "ct_1",
            bookerName: "Asha Rao",
            courseEnrollmentId: null,
            service: { name: "Check-up" },
            staff: { name: "Dr Kavi" },
            contact: { firstName: "Asha" },
        });
        tx.bookingEvent.findFirst.mockResolvedValue({
            actorUserId: null,
            fromStartAt: new Date("2026-10-05T04:30:00.000Z"),
            toStartAt: NOW,
        });
        await service.notify(
            asTx(tx),
            ORG,
            {
                kind: "BOOKING_MOVED",
                eventKey: "booking:ev_2",
                bookingId: "bk_1",
                bookingEventId: "ev_2",
            },
            NOW,
        );
        expect(append.mock.calls[0][1].body).toBe(
            "You moved your Check-up to Tue 6 Oct at 11:00 am.",
        );
        expect(tx.customerNotice.update.mock.calls[0][0].data).toMatchObject({
            bookingId: "bk_1",
        });
    });

    it("a course's session isn't told on its own", async () => {
        const tx = makeTx();
        tx.booking.findFirst.mockResolvedValue({
            id: "bk_1",
            status: "CONFIRMED",
            startAt: NOW,
            timezone: "Asia/Kolkata",
            contactId: "ct_1",
            bookerName: null,
            courseEnrollmentId: "enr_1",
            service: { name: "Pottery" },
            staff: null,
            contact: null,
        });
        await service.notify(
            asTx(tx),
            ORG,
            {
                kind: "BOOKING_CONFIRMED",
                eventKey: "booking:ev_3",
                bookingId: "bk_1",
            },
            NOW,
        );
        expect(append).not.toHaveBeenCalled();
    });
});

describe("the customer.notify job", () => {
    function job(payload: unknown, organizationId: string | null = ORG): Job {
        return {
            id: "job_1",
            organizationId,
            type: "customer.notify",
            payload,
        } as unknown as Job;
    }

    it("runs one transaction in the business's RLS context", async () => {
        const tx = makeTx();
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        await new CustomerNotifyHandler(service).handle(job(READY));
        expect(runInOrgContext).toHaveBeenCalledWith(ORG, expect.any(Function));
        expect(append).toHaveBeenCalledTimes(1);
    });

    it("a job naming no event, or no business, does nothing", async () => {
        const handler = new CustomerNotifyHandler(service);
        await handler.handle(job({ kind: "NOT_A_KIND", eventKey: "x" }));
        await handler.handle(job({ ...READY, eventKey: "" }));
        await handler.handle(job(READY, null));
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("customer.notify — a website order placed (UX-042)", () => {
    const PLACED: CustomerNotifyPayload = {
        kind: "ORDER_PLACED",
        eventKey: "order-placed:order_1",
        orderId: "order_1",
    };
    function placed(tx: FakeTx, over: Record<string, unknown> = {}) {
        tx.order.findFirst.mockResolvedValue({
            id: "order_1",
            orderId: "ORD-1019",
            status: "PENDING",
            paymentStatus: "UNPAID",
            placedOnline: true,
            payOnHandover: true,
            fulfilment: "PICKUP",
            customerId: "cus_1",
            customerAccountId: "acc_1",
            customer: { firstName: "Asha" },
            ...over,
        });
    }

    it("to pay on collection: the thread says it's in and how it's paid, and the provider emails it", async () => {
        const tx = makeTx();
        placed(tx);
        const out = await service.notify(asTx(tx), ORG, PLACED, NOW);
        expect(out).toEqual({
            duplicate: false,
            threadMessageId: "ctm_1",
            messageId: "msg_1",
        });
        expect(append.mock.calls[0][1]).toMatchObject({
            contactId: "ct_1",
            author: "SYSTEM",
            body: "We have your order ORD-1019. You pay at pick-up. We'll tell you when it's ready for pick-up.",
            event: "ORDER_PLACED",
        });
        expect(queueTransactional.mock.calls[0][2]).toMatchObject({
            template: "ORDER_PLACED",
            provider: "RESEND",
            recipient: { kind: "CONTACT", contactId: "ct_1" },
        });
        expect(tx.customerNotice.createMany.mock.calls[0][0].data[0]).toEqual({
            organizationId: ORG,
            eventKey: "order-placed:order_1",
            kind: "ORDER_PLACED",
            bookingId: null,
            orderId: "order_1",
        });
    });

    it("paid online and delivered: says it's paid and what comes next", async () => {
        const tx = makeTx();
        placed(tx, {
            payOnHandover: false,
            paymentStatus: "PAID",
            fulfilment: "SHIPPING",
        });
        await service.notify(asTx(tx), ORG, PLACED, NOW);
        expect(append.mock.calls[0][1].body).toBe(
            "We have your order ORD-1019, and it's paid. We'll tell you when it's on its way.",
        );
    });

    it("no provider: the thread only, never emailed", async () => {
        const tx = makeTx();
        placed(tx);
        tx.communicationProvider.findUnique.mockResolvedValue(null);
        const out = await service.notify(asTx(tx), ORG, PLACED, NOW);
        expect(out.threadMessageId).toBe("ctm_1");
        expect(out.messageId).toBeNull();
        expect(queueTransactional).not.toHaveBeenCalled();
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it("an online checkout not paid, or an order cancelled since, says nothing", async () => {
        for (const over of [
            { payOnHandover: false, paymentStatus: "UNPAID" },
            { status: "CANCELLED" },
        ]) {
            const tx = makeTx();
            placed(tx, over);
            const out = await service.notify(asTx(tx), ORG, PLACED, NOW);
            expect(out).toEqual({
                duplicate: false,
                threadMessageId: null,
                messageId: null,
            });
        }
        expect(append).not.toHaveBeenCalled();
    });

    it("run twice, the customer hears once", async () => {
        const tx = makeTx();
        placed(tx);
        await service.notify(asTx(tx), ORG, PLACED, NOW);
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const again = await service.notify(asTx(tx), ORG, PLACED, NOW);
        expect(again.duplicate).toBe(true);
        expect(append).toHaveBeenCalledTimes(1);
        expect(queueTransactional).toHaveBeenCalledTimes(1);
    });
});
