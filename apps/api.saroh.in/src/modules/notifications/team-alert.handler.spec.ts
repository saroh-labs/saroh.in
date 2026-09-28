// `team.alert` (F14) against a stand-in transaction: what is worded, what
// is never announced, the bell's one notice, and who is emailed.
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));
jest.mock("../../env", () => ({
    env: { APP_URL: "https://app.saroh.localhost" },
}));

import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { CommunicationsService } from "../communications/communications.service";
import {
    renderAlertEmail,
    TEAM_ALERT_TYPE,
    TeamAlertHandler,
    tellTeam,
} from "./team-alert.handler";
import { enqueueTeamAlert } from "./team-alerts";

const ORG = "org_1";

function makeTx() {
    return {
        order: {
            findFirst: jest.fn().mockResolvedValue({
                id: "ord_1",
                orderId: "ORD-012",
                total: "1240.00",
                currency: "INR",
                status: "PENDING",
                paymentStatus: "PAID",
                placedOnline: true,
                customerId: "cus_1",
                walkInName: null,
                customer: {
                    firstName: "Asha",
                    lastName: "Rao",
                    email: "asha@example.com",
                },
            }),
        },
        paymentIntent: { findFirst: jest.fn() },
        invoice: { findFirst: jest.fn() },
        membership: {
            findUnique: jest.fn(),
            findMany: jest.fn().mockResolvedValue([
                { userId: "u_owner", role: "OWNER" },
                { userId: "u_admin", role: "ADMIN" },
                { userId: "u_kitchen", role: "MEMBER" },
                { userId: "u_clerk", role: "stock-clerk" },
            ]),
        },
        organizationRole: {
            findFirst: jest.fn(),
            // An invented role with the stock, and nothing about money.
            findMany: jest
                .fn()
                .mockResolvedValue([
                    { key: "stock-clerk", actions: ["inventory:write"] },
                ]),
        },
        notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co" }),
        },
        customerNotice: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn(),
        },
        notification: {
            create: jest.fn().mockResolvedValue({ id: "ntf_1" }),
            findFirst: jest.fn(),
        },
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

const emailConnected = jest.fn().mockResolvedValue(true);
const queueTransactional = jest.fn().mockResolvedValue({ id: "msg_1" });
const comms = {
    emailConnected,
    queueTransactional,
} as unknown as CommunicationsService;

const recipients = () =>
    queueTransactional.mock.calls.map(
        (c) => (c[2] as { recipient: { userId: string } }).recipient.userId,
    );

beforeEach(() => {
    jest.clearAllMocks();
    emailConnected.mockResolvedValue(true);
});

describe("a new order", () => {
    it("puts one notice in the inbox, claimed once, in words", async () => {
        const tx = makeTx();
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.told).toBe(true);
        expect(tx.customerNotice.createMany.mock.calls[0][0]).toEqual({
            data: [
                {
                    organizationId: ORG,
                    eventKey: "team:order:ord_1",
                    kind: "TEAM_TOLD",
                    orderId: "ord_1",
                },
            ],
            skipDuplicates: true,
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "order.new",
            title: "New order ORD-012 from Asha Rao",
            body: "₹1,240.00, paid online.",
        });
        expect(tx.customerNotice.update.mock.calls[0][0].data).toEqual({
            notificationId: "ntf_1",
        });
    });

    it("emails nobody by default: email is on only for a failed payment", async () => {
        const tx = makeTx();
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.emailed).toBe(0);
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("emails whoever turned email on and can read orders, but not the one who took it", async () => {
        const tx = makeTx();
        tx.notificationPreference.findMany.mockResolvedValue([
            // The owner took this order at the counter.
            {
                userId: "u_owner",
                event: "order",
                channel: "email",
                enabled: true,
            },
            {
                userId: "u_kitchen",
                event: "order",
                channel: "email",
                enabled: true,
            },
            // Can't read orders: never emailed, whatever they chose.
            {
                userId: "u_clerk",
                event: "order",
                channel: "email",
                enabled: true,
            },
        ]);
        await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
            actorUserId: "u_owner",
        });
        expect(recipients()).toEqual(["u_kitchen"]);
        expect(queueTransactional.mock.calls[0][2]).toMatchObject({
            template: "TEAM_ALERT",
            recipient: { kind: "TEAM_MEMBER", userId: "u_kitchen" },
            createdByUserId: null,
            rendered: { subject: "Rye & Co: New order ORD-012 from Asha Rao" },
        });
    });

    it("an online checkout never paid is not an order: nothing is said", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            paymentStatus: "UNPAID",
        });
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.told).toBe(false);
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it("a counter order for a walk-in says so", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            placedOnline: false,
            paymentStatus: "UNPAID",
            customerId: null,
            customer: null,
            walkInName: "Ravi",
        });
        await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            title: "New order ORD-012 from Ravi",
            body: "₹1,240.00, at the counter.",
        });
    });

    it("the same alert twice tells the team once", async () => {
        const tx = makeTx();
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out).toEqual({ told: false, emailed: 0 });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });
});

describe("a failed payment", () => {
    function failing(tx: FakeTx) {
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "FAILED",
            amountCents: 240000,
            currency: "INR",
        });
        tx.invoice.findFirst.mockResolvedValue({
            id: "inv_1",
            number: "INV-0042",
            status: "ISSUED",
            billToName: "Meera Iyer",
            contact: null,
        });
    }

    it("emails the owner and admin by default, and never a role without the money", async () => {
        const tx = makeTx();
        failing(tx);
        await tellTeam(asTx(tx), comms, ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "payment.failed",
            title: "Payment failed on invoice INV-0042",
            body: "Meera Iyer's payment of ₹2,400.00 didn't go through. They can try again from the same link.",
        });
        expect(recipients()).toEqual(["u_owner", "u_admin"]);
    });

    it("someone who turned its email off isn't emailed", async () => {
        const tx = makeTx();
        failing(tx);
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_admin",
                event: "failed",
                channel: "email",
                enabled: false,
            },
        ]);
        await tellTeam(asTx(tx), comms, ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(recipients()).toEqual(["u_owner"]);
    });

    it("with no email provider connected, the bell still has it and nobody is emailed", async () => {
        const tx = makeTx();
        failing(tx);
        emailConnected.mockResolvedValue(false);
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(out).toEqual({ told: true, emailed: 0 });
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it("a payment that went through after all is not announced", async () => {
        const tx = makeTx();
        failing(tx);
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "SUCCEEDED",
            amountCents: 240000,
            currency: "INR",
        });
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(out.told).toBe(false);
    });
});

describe("someone joins the team", () => {
    it("names them and their role, and doesn't email them about themselves", async () => {
        const tx = makeTx();
        tx.membership.findUnique.mockResolvedValue({
            role: "MEMBER",
            user: { name: "Meera", email: "meera@example.com" },
        });
        tx.organizationRole.findFirst.mockResolvedValue(null);
        tx.notificationPreference.findMany.mockResolvedValue(
            ["u_owner", "u_kitchen"].map((userId) => ({
                userId,
                event: "team",
                channel: "email",
                enabled: true,
            })),
        );
        await tellTeam(asTx(tx), comms, ORG, {
            event: "team",
            userId: "u_kitchen",
            invitationId: "inv_9",
        });
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe("team:joined:inv_9");
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "team.joined",
            title: "Meera joined the team",
            body: "They accepted your invitation, as Member.",
        });
        expect(recipients()).toEqual(["u_owner"]);
    });

    it("someone who left again before it ran is not announced", async () => {
        const tx = makeTx();
        tx.membership.findUnique.mockResolvedValue(null);
        const out = await tellTeam(asTx(tx), comms, ORG, {
            event: "team",
            userId: "u_gone",
            invitationId: "inv_9",
        });
        expect(out.told).toBe(false);
    });
});

describe("a booking the customer made", () => {
    it("is already in the inbox: only the email is left, claimed on its own", async () => {
        const tx = makeTx();
        tx.notification.findFirst.mockResolvedValue({
            id: "ntf_b",
            type: "booking.new",
            title: "Asha Rao booked Check-up",
            body: "Tue 6 Oct at 11:00.",
        });
        tx.customerNotice.findFirst.mockResolvedValue({ bookingId: "bk_1" });
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_kitchen",
                event: "booking",
                channel: "email",
                enabled: true,
            },
        ]);
        await tellTeam(asTx(tx), comms, ORG, {
            event: "booking",
            notificationId: "ntf_b",
        });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe("team:email:ntf_b");
        expect(recipients()).toEqual(["u_kitchen"]);
        expect(
            (
                queueTransactional.mock.calls[0][2] as {
                    rendered: { body: string };
                }
            ).rendered.body,
        ).toContain("https://app.saroh.localhost/bookings/bk_1");
    });
});

describe("the email", () => {
    it("escapes what people typed, links into the workspace and says why they got it", () => {
        const mail = renderAlertEmail(
            {
                event: "order",
                title: "New order ORD-1 from <b>Asha</b>",
                body: "₹10.00, paid online.",
                path: "/commerce/orders/ord_1",
            },
            "Rye & Co",
        );
        expect(mail.subject).toBe("Rye & Co: New order ORD-1 from <b>Asha</b>");
        expect(mail.body).toContain("&lt;b&gt;Asha&lt;/b&gt;");
        expect(mail.body).toContain(
            'href="https://app.saroh.localhost/commerce/orders/ord_1"',
        );
        expect(mail.body).toContain("&ldquo;New order&rdquo;");
        expect(mail.body).toContain("Rye &amp; Co");
    });
});

describe("the job", () => {
    it("runs in the business's RLS context, on one transaction", async () => {
        const tx = makeTx();
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        await new TeamAlertHandler(comms).handle({
            id: "job_1",
            type: TEAM_ALERT_TYPE,
            organizationId: ORG,
            payload: { event: "order", orderId: "ord_1" },
        } as unknown as Job);
        expect(runInOrgContext).toHaveBeenCalledWith(ORG, expect.any(Function));
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });

    it("skips a payload that names nothing", async () => {
        await new TeamAlertHandler(comms).handle({
            id: "job_2",
            type: TEAM_ALERT_TYPE,
            organizationId: ORG,
            payload: { event: "order" },
        } as unknown as Job);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("is queued on the producer's own transaction", async () => {
        const create = jest.fn();
        await enqueueTeamAlert({ job: { create } } as never, ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(create).toHaveBeenCalledWith({
            data: {
                organizationId: ORG,
                type: "team.alert",
                payload: {
                    event: "failed",
                    invoiceId: "inv_1",
                    paymentIntentId: "pi_1",
                },
            },
        });
    });
});
