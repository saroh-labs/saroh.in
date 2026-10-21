// `team.alert` (F14) against a stand-in transaction: what is worded, what
// is never announced, the bell's one notice, and who is emailed.
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));
jest.mock("../../env", () => ({
    env: { APP_URL: "https://app.saroh.localhost" },
}));
jest.mock("../../common/email", () => ({
    sendTeamAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { sendTeamAlertEmail } from "../../common/email";
import type { AlertEmail } from "./team-alert.handler";
import {
    renderAlertEmail,
    TEAM_ALERT_TYPE,
    TeamAlertHandler,
    tellTeam,
} from "./team-alert.handler";
import { enqueueTeamAlert } from "./team-alerts";

const ORG = "org_1";

const member = (userId: string, role: string) => ({
    userId,
    role,
    user: { email: `${userId}@example.com` },
});

/** The team, with their sign-in emails; a reviewer reads nothing else. */
const MEMBERS = [
    member("u_owner", "OWNER"),
    member("u_admin", "ADMIN"),
    member("u_kitchen", "MEMBER"),
    member("u_clerk", "stock-clerk"),
    member("u_rina", "REVIEWER"),
];

/** `membership.findMany`, honouring the filter the reviewers' read uses. */
function membersWhere(args: { where?: { userId?: { in: string[] } } }) {
    const w = args.where ?? {};
    return Promise.resolve(
        MEMBERS.filter((m) => !w.userId || w.userId.in.includes(m.userId)),
    );
}

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
        // A capture recorded at the wrong amount (PAY-06): none by default.
        paymentAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
        paymentRefund: { findMany: jest.fn().mockResolvedValue([]) },
        membership: {
            findUnique: jest.fn(),
            // The reviewer reads no orders, money or team: never emailed on
            // a row's choices, whatever the row.
            findMany: jest.fn(membersWhere),
        },
        siteReviewer: { findMany: jest.fn().mockResolvedValue([]) },
        siteApproval: { findFirst: jest.fn() },
        siteComment: { findFirst: jest.fn(), count: jest.fn() },
        user: { findUnique: jest.fn() },
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
        customerDataRequest: { findFirst: jest.fn() },
        booking: { findFirst: jest.fn() },
        bookingEvent: { findFirst: jest.fn() },
        staffMember: { findFirst: jest.fn() },
        merchantPaymentProvider: { findFirst: jest.fn() },
        communicationProvider: { findFirst: jest.fn() },
        $executeRaw: jest.fn().mockResolvedValue(0),
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

const recipients = (out: { emails: AlertEmail[] }) =>
    out.emails.map((e) => e.userId);

beforeEach(() => {
    jest.clearAllMocks();
});

/** A counter order, paid there: the provider path, as F14 built it. */
function counterOrder(tx: FakeTx) {
    tx.order.findFirst.mockResolvedValue({
        id: "ord_1",
        orderId: "ORD-012",
        total: "1240.00",
        currency: "INR",
        status: "PENDING",
        paymentStatus: "PAID",
        placedOnline: false,
        customerId: "cus_1",
        walkInName: null,
        customer: { firstName: "Asha", lastName: "Rao", email: null },
    });
}

describe("a new order", () => {
    it("puts one notice in the inbox, claimed once, in words", async () => {
        const tx = makeTx();
        const out = await tellTeam(asTx(tx), ORG, {
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
            // The row opens the order.
            orderId: "ord_1",
            title: "New order ORD-012 from Asha Rao",
            body: "₹1,240, paid online.",
        });
        expect(tx.customerNotice.update.mock.calls[0][0].data).toEqual({
            notificationId: "ntf_1",
        });
    });

    it("a counter order emails nobody by default: email is on only for a failed payment", async () => {
        const tx = makeTx();
        counterOrder(tx);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.emails).toEqual([]);
    });

    it("emails whoever turned email on and can read orders, but not the one who took it", async () => {
        const tx = makeTx();
        counterOrder(tx);
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
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
            actorUserId: "u_owner",
        });
        expect(recipients(out)).toEqual(["u_kitchen"]);
        // From Saroh, to their sign-in email, naming no customer.
        expect(out.emails[0]).toEqual({
            userId: "u_kitchen",
            to: "u_kitchen@example.com",
            mail: {
                subject: "Rye & Co: New order ORD-012",
                heading: "New order ORD-012",
                body: "₹1,240, at the counter.",
                url: "https://app.saroh.localhost/commerce/orders/ord_1",
                footer: "You get this because email is on for “New order” in your alerts at Rye & Co. You can change it in Saroh, in Settings under Your profile.",
            },
        });
    });

    it("an order the team took rings no bell, for the one who took it or anyone (#874)", async () => {
        const tx = makeTx();
        counterOrder(tx);
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_kitchen",
                event: "order",
                channel: "email",
                enabled: true,
            },
        ]);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
            actorUserId: "u_owner",
        });
        expect(out.told).toBe(true);
        expect(tx.notification.create).not.toHaveBeenCalled();
        // Claimed once all the same, and emailed as chosen.
        expect(tx.customerNotice.createMany).toHaveBeenCalled();
        expect(recipients(out)).toEqual(["u_kitchen"]);
    });

    it("a website order still rings the bell", async () => {
        const tx = makeTx();
        await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
            actorUserId: null,
        });
        expect(tx.notification.create).toHaveBeenCalled();
    });

    it("an online checkout never paid is not an order: nothing is said", async () => {
        const tx = makeTx();
        tx.order.findFirst.mockResolvedValue({
            ...(await tx.order.findFirst()),
            paymentStatus: "UNPAID",
        });
        const out = await tellTeam(asTx(tx), ORG, {
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
        await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            title: "New order ORD-012 from Ravi",
            body: "₹1,240, at the counter.",
        });
    });

    it("the same alert twice tells the team once", async () => {
        const tx = makeTx();
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out).toEqual({ told: false, emails: [] });
        expect(tx.notification.create).not.toHaveBeenCalled();
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
        const out = await tellTeam(asTx(tx), ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "payment.failed",
            // The row opens the invoice.
            invoiceId: "inv_1",
            title: "Payment failed on invoice INV-0042",
            // Every send replaces the link (DEC-110): never "the same link".
            body: "Meera Iyer's payment of ₹2,400 didn't go through. They'll need a new link: open the invoice to share one.",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        // The bell names the customer; Saroh's email doesn't.
        expect(out.emails[0].mail).toMatchObject({
            heading: "Payment failed on invoice INV-0042",
            body: "A payment of ₹2,400 didn't go through. The customer will need a new link: open the invoice to share one.",
        });
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
        const out = await tellTeam(asTx(tx), ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(recipients(out)).toEqual(["u_owner"]);
    });

    it("never asks after the business's email provider: Saroh sends it, provider or not", async () => {
        const tx = Object.assign(makeTx(), {
            communicationProvider: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
        });
        failing(tx);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        expect(tx.communicationProvider.findFirst).not.toHaveBeenCalled();
        expect(tx.communicationProvider.findMany).not.toHaveBeenCalled();
    });

    it("a payment that went through after all is not announced", async () => {
        const tx = makeTx();
        failing(tx);
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "SUCCEEDED",
            amountCents: 240000,
            currency: "INR",
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "failed",
            invoiceId: "inv_1",
            paymentIntentId: "pi_1",
        });
        expect(out.told).toBe(false);
    });
});

describe("a failed invoice payment that no longer stands (#1139)", () => {
    function failing(tx: FakeTx, status: string) {
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "FAILED",
            amountCents: 240000,
            currency: "INR",
            viaMandateId: null,
        });
        tx.invoice.findFirst.mockResolvedValue({
            id: "inv_1",
            number: "INV-0042",
            status,
            billToName: "Meera Iyer",
            contact: null,
        });
    }
    const failed = {
        event: "failed",
        invoiceId: "inv_1",
        paymentIntentId: "pi_1",
    } as const;

    it("paid in cash before the alert ran: nothing is said", async () => {
        const tx = makeTx();
        failing(tx, "PAID");
        expect(await tellTeam(asTx(tx), ORG, failed)).toEqual({
            told: false,
            emails: [],
        });
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    it("credited in full since: nothing is said", async () => {
        const tx = makeTx();
        failing(tx, "CREDITED");
        expect((await tellTeam(asTx(tx), ORG, failed)).told).toBe(false);
    });

    it("taken at the wrong amount: the mismatch alert tells it, not 'didn't go through'", async () => {
        const tx = makeTx();
        failing(tx, "ISSUED");
        tx.paymentAttempt.findFirst.mockResolvedValue({ id: "att_1" });
        expect((await tellTeam(asTx(tx), ORG, failed)).told).toBe(false);
    });
});

describe("an order's payment that didn't go through (#1139)", () => {
    function order(tx: FakeTx, over: Record<string, unknown> = {}) {
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "FAILED",
            amountCents: 120000,
            currency: "INR",
        });
        tx.order.findFirst.mockResolvedValue({
            id: "ord_1",
            orderId: "#1042",
            status: "PENDING",
            paymentStatus: "FAILED",
            placedOnline: false,
            payOnHandover: false,
            customerId: "cus_1",
            walkInName: null,
            customer: { firstName: "Asha", lastName: "Rao", email: null },
            ...over,
        });
    }
    const failedOrder = {
        event: "order-failed",
        orderId: "ord_1",
        paymentIntentId: "pi_1",
    } as const;

    it("rings the bell on the order, and emails whoever has email on for Failed", async () => {
        const tx = makeTx();
        order(tx);
        const out = await tellTeam(asTx(tx), ORG, failedOrder);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({
            eventKey: "team:order-failed:pi_1",
            orderId: "ord_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "order.payment_failed",
            orderId: "ord_1",
            title: "Payment for order #1042 didn't go through",
            body: "Asha Rao's payment of ₹1,200 didn't go through. They'll need a new link: open the order to share one.",
        });
        // Failed's email is on by default: the owner and admin.
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        expect(out.emails[0].mail).toMatchObject({
            heading: "Payment for order #1042 didn't go through",
            body: "A payment of ₹1,200 didn't go through. The customer will need a new link: open the order to share one.",
            url: "https://app.saroh.localhost/commerce/orders/ord_1",
        });
        expect(out.emails[0].mail.body).not.toContain("Asha");
        expect(out.emails[0].mail.footer).toContain("Payment failed");
    });

    it("says nothing once paid, cancelled, gone through after all, or for a site checkout", async () => {
        for (const [over, intent] of [
            [{ paymentStatus: "PAID" }, "FAILED"],
            [{ status: "CANCELLED" }, "FAILED"],
            [{}, "SUCCEEDED"],
            [{ placedOnline: true, paymentStatus: "UNPAID" }, "FAILED"],
        ] as const) {
            const tx = makeTx();
            order(tx, over);
            tx.paymentIntent.findFirst.mockResolvedValue({
                status: intent,
                amountCents: 120000,
                currency: "INR",
            });
            expect((await tellTeam(asTx(tx), ORG, failedOrder)).told).toBe(
                false,
            );
        }
    });

    it("the webhook redelivered: claimed already, so told once", async () => {
        const tx = makeTx();
        order(tx);
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        expect(await tellTeam(asTx(tx), ORG, failedOrder)).toEqual({
            told: false,
            emails: [],
        });
        expect(tx.notification.create).not.toHaveBeenCalled();
    });
});

describe("money that doesn't match (#1139, PAY-06)", () => {
    const mismatch = {
        event: "mismatch",
        paymentIntentId: "pi_1",
        attemptId: "att_1",
    } as const;
    const RAW = {
        invoiceStatus: "AMOUNT_MISMATCH",
        askedAmountCents: 120000,
        askedCurrency: "INR",
        capturedAmountCents: 118000,
        capturedCurrency: "INR",
    };
    function onOrder(tx: FakeTx) {
        tx.paymentAttempt.findFirst.mockResolvedValue({
            rawResponse: RAW,
            paymentIntent: {
                amountCents: 120000,
                currency: "INR",
                invoice: null,
                order: {
                    id: "ord_1",
                    orderId: "#1042",
                    status: "PENDING",
                    paymentStatus: "FAILED",
                    placedOnline: false,
                    payOnHandover: false,
                    customerId: null,
                    walkInName: "Ravi",
                    customer: null,
                },
            },
        });
    }

    it("₹1,180 taken against ₹1,200 due: both figures, on the order", async () => {
        const tx = makeTx();
        onOrder(tx);
        const out = await tellTeam(asTx(tx), ORG, mismatch);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({ eventKey: "team:mismatch:pi_1:att_1" });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "payment.mismatch",
            orderId: "ord_1",
            title: "Payment for order #1042 didn't match",
            body: "Ravi paid, but ₹1,180 was taken against ₹1,200 due. It isn't counted as paid, and it's owed back to the customer: refund it from Home.",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        expect(out.emails[0].mail).toMatchObject({
            heading: "Payment for order #1042 didn't match",
            body: "₹1,180 was taken against ₹1,200 due. It isn't counted as paid, and it's owed back to the customer: refund it from Home.",
        });
    });

    it("on an invoice (a booking paid at booking): opens the invoice", async () => {
        const tx = makeTx();
        tx.paymentAttempt.findFirst.mockResolvedValue({
            rawResponse: RAW,
            paymentIntent: {
                amountCents: 120000,
                currency: "INR",
                order: null,
                invoice: {
                    id: "inv_1",
                    number: "INV-0042",
                    billToName: null,
                    contact: { firstName: "Meera", lastName: "Iyer" },
                },
            },
        });
        await tellTeam(asTx(tx), ORG, mismatch);
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "payment.mismatch.invoice",
            invoiceId: "inv_1",
            title: "Payment on invoice INV-0042 didn't match",
            body: expect.stringContaining(
                "Meera Iyer paid, but ₹1,180 was taken against ₹1,200 due.",
            ),
        });
    });

    it("says nothing once a refund of it is on its way, or for the ₹1 autopay check", async () => {
        const tx = makeTx();
        onOrder(tx);
        tx.paymentRefund.findMany.mockResolvedValue([
            {
                id: "ref_1",
                status: "PENDING",
                idempotencyKey: "amount-mismatch:att_1",
            },
        ]);
        expect((await tellTeam(asTx(tx), ORG, mismatch)).told).toBe(false);

        const check = makeTx();
        check.paymentAttempt.findFirst.mockResolvedValue({
            rawResponse: RAW,
            paymentIntent: {
                amountCents: 100,
                currency: "INR",
                order: null,
                invoice: null,
            },
        });
        expect((await tellTeam(asTx(check), ORG, mismatch)).told).toBe(false);
    });
});

describe("a team order paid by its link (#1139)", () => {
    function paid(tx: FakeTx, over: Record<string, unknown> = {}) {
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "SUCCEEDED",
            amountCents: 124000,
            currency: "INR",
        });
        tx.order.findFirst.mockResolvedValue({
            id: "ord_1",
            orderId: "ORD-012",
            status: "PENDING",
            paymentStatus: "PAID",
            placedOnline: false,
            payOnHandover: false,
            customerId: "cus_1",
            walkInName: null,
            customer: { firstName: "Asha", lastName: "Rao", email: null },
            ...over,
        });
    }
    const byLink = {
        event: "paid-by-link",
        orderId: "ord_1",
        paymentIntentId: "pi_1",
    } as const;

    it("rings the New order row's bell; nobody is emailed by default", async () => {
        const tx = makeTx();
        paid(tx);
        const out = await tellTeam(asTx(tx), ORG, byLink);
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "order.paid_by_link",
            orderId: "ord_1",
            title: "Order ORD-012 was paid online",
            body: "Asha Rao paid ₹1,240 online.",
        });
        expect(out).toMatchObject({ told: true, emails: [] });
    });

    it("says nothing for a site order, or one no longer paid", async () => {
        for (const over of [
            { placedOnline: true },
            { paymentStatus: "REFUNDED" },
            { status: "CANCELLED" },
        ]) {
            const tx = makeTx();
            paid(tx, over);
            expect((await tellTeam(asTx(tx), ORG, byLink)).told).toBe(false);
        }
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
        const out = await tellTeam(asTx(tx), ORG, {
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
        expect(recipients(out)).toEqual(["u_owner"]);
        expect(out.emails[0].mail.heading).toBe("Meera joined the team");
    });

    it("someone who left again before it ran is not announced", async () => {
        const tx = makeTx();
        tx.membership.findUnique.mockResolvedValue(null);
        const out = await tellTeam(asTx(tx), ORG, {
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
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking",
            notificationId: "ntf_b",
        });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe("team:email:ntf_b");
        expect(recipients(out)).toEqual(["u_kitchen"]);
        // Fixed words: the notice's customer name stays in the bell.
        expect(out.emails[0].mail).toMatchObject({
            heading: "New booking",
            body: "A customer booked online. Open it in Saroh to see who and when.",
            url: "https://app.saroh.localhost/bookings/bk_1",
        });
        expect(JSON.stringify(out.emails[0].mail)).not.toContain("Asha");
    });
});

describe("a scheduled go-live (DEC-071, T10)", () => {
    function siteTx(wentLiveAt: Date | null) {
        const tx = makeTx();
        return Object.assign(tx, {
            siteTestRelease: {
                findFirst: jest.fn().mockResolvedValue({
                    siteId: "site_1",
                    name: "Diwali menu",
                    wentLiveAt,
                    site: { name: "Rye & Co" },
                }),
            },
        });
    }
    const AT = "2026-10-03T12:30:00.000Z";

    it("says it is live, and emails who can publish by default", async () => {
        const tx = siteTx(new Date(AT));
        const out = await tellTeam(asTx(tx), ORG, {
            event: "site",
            testReleaseId: "rel_1",
            goLiveAt: AT,
            outcome: "LIVE",
            schedulerUserId: "u_owner",
        });
        expect(out.told).toBe(true);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe(`team:site:rel_1:${AT}`);
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "site.live",
            title: "Diwali menu is live on Rye & Co",
        });
        // Email on by default for a go-live, to who holds site:publish.
        expect(recipients(out).sort()).toEqual(["u_admin", "u_owner"]);
    });

    it("says it didn't go live, with the run's reason, and always emails who scheduled it", async () => {
        const tx = siteTx(null);
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_admin",
                event: "site",
                channel: "email",
                enabled: false,
            },
        ]);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "site",
            testReleaseId: "rel_1",
            goLiveAt: AT,
            outcome: "NOT_LIVE",
            reason: "The site was published at 3:10pm, after this was scheduled. Go live now, or schedule it again.",
            // Lost site:publish since, and still hears how it went.
            schedulerUserId: "u_kitchen",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "site.not_live",
            title: "Diwali menu didn't go live on Rye & Co",
            body: "The site was published at 3:10pm, after this was scheduled. Go live now, or schedule it again.",
        });
        expect(recipients(out).sort()).toEqual(["u_kitchen", "u_owner"]);
        // The email has fixed words, not the run's own sentence.
        expect(out.emails[0].mail).toMatchObject({
            heading: "Diwali menu didn't go live on Rye & Co",
            body: "Open it in Saroh to see why. Go live now, or schedule it again.",
        });
    });

    it("never announces a go-live the release doesn't show", async () => {
        const tx = siteTx(null);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "site",
            testReleaseId: "rel_1",
            goLiveAt: AT,
            outcome: "LIVE",
            schedulerUserId: "u_owner",
        });
        expect(out.told).toBe(false);
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });
});

describe("a provider that refused the business's keys (UX-012)", () => {
    const SINCE = "2026-10-07T09:30:00.000Z";
    const flagged = (provider: string) => ({
        provider,
        status: "CONNECTED",
        attentionAt: new Date(SINCE),
    });

    it("says payments can't be taken, links to Providers, and emails the owner and admin", async () => {
        const tx = makeTx();
        tx.merchantPaymentProvider.findFirst.mockResolvedValue(
            flagged("RAZORPAY"),
        );

        const out = await tellTeam(asTx(tx), ORG, {
            event: "provider",
            channel: "PAYMENTS",
            providerId: "mpp_1",
            since: SINCE,
        });

        expect(out.told).toBe(true);
        expect(
            tx.merchantPaymentProvider.findFirst.mock.calls[0][0].where,
        ).toEqual({ id: "mpp_1", organizationId: ORG });
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe(`team:provider:mpp_1:down:${SINCE}`);
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "provider.attention",
            title: "Razorpay refused your keys",
            body: expect.stringContaining("Customers can't pay online"),
        });
        // On the Payment failed row, whose email is on by default.
        expect(recipients(out).sort()).toEqual(["u_admin", "u_owner"]);
    });

    it("an email provider's is emailed too: Saroh sends it, not the refused key", async () => {
        const tx = makeTx();
        tx.communicationProvider.findFirst.mockResolvedValue(flagged("RESEND"));

        const out = await tellTeam(asTx(tx), ORG, {
            event: "provider",
            channel: "EMAIL",
            providerId: "cp_1",
            since: SINCE,
        });

        expect(out.told).toBe(true);
        expect(tx.notification.create.mock.calls[0][0].data.title).toBe(
            "Resend refused your email keys",
        );
        expect(recipients(out).sort()).toEqual(["u_admin", "u_owner"]);
        expect(out.emails[0].mail).toMatchObject({
            heading: "Resend refused your email keys",
            url: "https://app.saroh.localhost/settings/providers",
        });
    });

    it("says nothing once the keys were entered again or it was disconnected", async () => {
        for (const row of [
            { provider: "RAZORPAY", status: "CONNECTED", attentionAt: null },
            { ...flagged("RAZORPAY"), status: "DISABLED" },
            // Flagged again since: that refusal has its own alert.
            {
                ...flagged("RAZORPAY"),
                attentionAt: new Date("2026-10-08T00:00:00Z"),
            },
            null,
        ]) {
            const tx = makeTx();
            tx.merchantPaymentProvider.findFirst.mockResolvedValue(row);
            const out = await tellTeam(asTx(tx), ORG, {
                event: "provider",
                channel: "PAYMENTS",
                providerId: "mpp_1",
                since: SINCE,
            });
            expect(out.told).toBe(false);
            expect(tx.notification.create).not.toHaveBeenCalled();
        }
    });

    it("tells a refusal once per incident: not again while the last told is still 'stopped' (#555)", async () => {
        const tx = makeTx();
        tx.merchantPaymentProvider.findFirst.mockResolvedValue(
            flagged("RAZORPAY"),
        );
        // Told of an earlier flag, never told it came back.
        tx.customerNotice.findFirst.mockResolvedValue({
            eventKey: "team:provider:mpp_1:down:2026-10-01T00:00:00.000Z",
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "provider",
            change: "down",
            channel: "PAYMENTS",
            providerId: "mpp_1",
            since: SINCE,
        });
        expect(out.told).toBe(false);
        // The connection's alerts are told one at a time.
        expect(tx.$executeRaw).toHaveBeenCalled();
        expect(
            tx.customerNotice.findFirst.mock.calls[0][0].where.eventKey,
        ).toEqual({ startsWith: "team:provider:mpp_1:" });

        // After "working again" was told, a new refusal is a new incident.
        tx.customerNotice.findFirst.mockResolvedValue({
            eventKey: "team:provider:mpp_1:back:2026-10-02T00:00:00.000Z",
        });
        const again = await tellTeam(asTx(tx), ORG, {
            event: "provider",
            change: "down",
            channel: "PAYMENTS",
            providerId: "mpp_1",
            since: SINCE,
        });
        expect(again.told).toBe(true);
        // The email says it will tell them when it works again.
        expect(again.emails[0].mail.body).toContain(
            "We'll tell you when it works again.",
        );
    });

    describe("working again", () => {
        const BACK_AT = "2026-10-08T10:00:00.000Z";
        const working = (provider: string) => ({
            provider,
            status: "CONNECTED",
            attentionAt: null,
        });
        const back = (
            channel: "PAYMENTS" | "EMAIL",
            actorUserId: string | null = null,
        ) => ({
            event: "provider" as const,
            change: "back" as const,
            channel,
            providerId: channel === "PAYMENTS" ? "mpp_1" : "cp_1",
            since: BACK_AT,
            actorUserId,
        });

        it("says payments can be taken again, after a refusal was told, but not to whoever fixed it", async () => {
            const tx = makeTx();
            tx.merchantPaymentProvider.findFirst.mockResolvedValue(
                working("CASHFREE"),
            );
            tx.customerNotice.findFirst.mockResolvedValue({
                eventKey: `team:provider:mpp_1:down:${SINCE}`,
            });

            const out = await tellTeam(
                asTx(tx),
                ORG,
                back("PAYMENTS", "u_admin"),
            );

            expect(out.told).toBe(true);
            expect(
                tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
            ).toBe(`team:provider:mpp_1:back:${BACK_AT}`);
            expect(tx.notification.create.mock.calls[0][0].data).toEqual({
                organizationId: ORG,
                type: "provider.back",
                title: "Cashfree is working again",
                body: "Customers can pay online again through Cashfree.",
            });
            expect(recipients(out)).toEqual(["u_owner"]);
            expect(out.emails[0].mail).toMatchObject({
                subject: "Rye & Co: Cashfree is working again",
                url: "https://app.saroh.localhost/settings/providers",
            });
        });

        it("says emails are going out again", async () => {
            const tx = makeTx();
            tx.communicationProvider.findFirst.mockResolvedValue(
                working("RESEND"),
            );
            // A refusal told before #555 named no change: it was one.
            tx.customerNotice.findFirst.mockResolvedValue({
                eventKey: `team:provider:cp_1:${SINCE}`,
            });

            const out = await tellTeam(asTx(tx), ORG, back("EMAIL"));

            expect(out.told).toBe(true);
            expect(out.emails[0].mail).toMatchObject({
                heading: "Resend is working again",
                body: "Emails to your customers are going out through Resend again.",
            });
        });

        it("says nothing when the stop was never told, was told back already, or it failed again since", async () => {
            const cases: [unknown, { eventKey: string } | null][] = [
                [working("RAZORPAY"), null],
                [
                    working("RAZORPAY"),
                    { eventKey: `team:provider:mpp_1:back:${SINCE}` },
                ],
                [
                    flagged("RAZORPAY"),
                    { eventKey: `team:provider:mpp_1:down:${SINCE}` },
                ],
                [
                    { ...working("RAZORPAY"), status: "DISABLED" },
                    { eventKey: `team:provider:mpp_1:down:${SINCE}` },
                ],
            ];
            for (const [row, last] of cases) {
                const tx = makeTx();
                tx.merchantPaymentProvider.findFirst.mockResolvedValue(row);
                tx.customerNotice.findFirst.mockResolvedValue(last);
                const out = await tellTeam(asTx(tx), ORG, back("PAYMENTS"));
                expect(out.told).toBe(false);
                expect(tx.notification.create).not.toHaveBeenCalled();
            }
        });

        it("skips a job whose change it doesn't know", async () => {
            const handler = new TeamAlertHandler();
            await handler.handle({
                id: "job_x",
                organizationId: ORG,
                type: TEAM_ALERT_TYPE,
                payload: { ...back("PAYMENTS"), change: "sideways" },
            } as unknown as Job);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });
});

describe("the email", () => {
    it("carries fixed words and the business's name, cleaned, links into the workspace and says why they got it", () => {
        const mail = renderAlertEmail(
            {
                event: "order",
                mail: {
                    heading: "New order ORD-1",
                    body: "₹10, paid online.",
                },
                path: "/commerce/orders/ord_1",
            },
            "Rye & Co",
        );
        expect(mail).toEqual({
            subject: "Rye & Co: New order ORD-1",
            heading: "New order ORD-1",
            body: "₹10, paid online.",
            url: "https://app.saroh.localhost/commerce/orders/ord_1",
            footer: "You get this because email is on for “New order” in your alerts at Rye & Co. You can change it in Saroh, in Settings under Your profile.",
        });
    });

    it("a business or person name with a link or an address in it is cleaned before Saroh sends it", async () => {
        const tx = makeTx();
        tx.organization.findUnique.mockResolvedValue({
            name: "Rye <b>Co</b> www.example.com",
        });
        tx.membership.findUnique.mockResolvedValue({
            role: "MEMBER",
            user: {
                name: "Win at https://evil.example/x",
                email: "x@example.com",
            },
        });
        tx.organizationRole.findFirst.mockResolvedValue(null);
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_owner",
                event: "team",
                channel: "email",
                enabled: true,
            },
        ]);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "team",
            userId: "u_kitchen",
            invitationId: "inv_9",
        });
        const { url: _url, ...words } = out.emails[0].mail;
        const text = JSON.stringify(words);
        expect(text).not.toMatch(/example\.com|https?:|<b>/u);
        expect(out.emails[0].mail.subject).toBe(
            "Rye b Co /b: Win at joined the team",
        );
    });
});

describe("the job", () => {
    it("runs in the business's RLS context, on one transaction", async () => {
        const tx = makeTx();
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        await new TeamAlertHandler().handle({
            id: "job_1",
            type: TEAM_ALERT_TYPE,
            organizationId: ORG,
            payload: { event: "order", orderId: "ord_1" },
        } as unknown as Job);
        expect(runInOrgContext).toHaveBeenCalledWith(ORG, expect.any(Function));
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });

    it("hands each email to Saroh's sender once the transaction is done", async () => {
        const tx = makeTx();
        tx.paymentIntent.findFirst.mockResolvedValue({
            status: "FAILED",
            amountCents: 240000,
            currency: "INR",
        });
        tx.invoice.findFirst.mockResolvedValue({
            id: "inv_1",
            number: "INV-0042",
            status: "ISSUED",
            billToName: null,
            contact: null,
        });
        let committed = false;
        (prisma.$transaction as jest.Mock).mockImplementation(
            async (fn: (t: unknown) => unknown) => {
                const r = await fn(tx);
                committed = true;
                return r;
            },
        );
        (sendTeamAlertEmail as jest.Mock).mockImplementation(() => {
            expect(committed).toBe(true);
            return Promise.resolve();
        });
        await new TeamAlertHandler().handle({
            id: "job_3",
            type: TEAM_ALERT_TYPE,
            organizationId: ORG,
            payload: {
                event: "failed",
                invoiceId: "inv_1",
                paymentIntentId: "pi_1",
            },
        } as unknown as Job);
        expect(
            (sendTeamAlertEmail as jest.Mock).mock.calls.map((c) => c[0]),
        ).toEqual(["u_owner@example.com", "u_admin@example.com"]);
    });

    it("skips a payload that names nothing", async () => {
        await new TeamAlertHandler().handle({
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

describe("a new website order (UX-042)", () => {
    it("emails the owners and admins by default, as an enquiry, naming no customer", async () => {
        const tx = makeTx();
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.told).toBe(true);
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        expect(out.emails[0]).toEqual({
            userId: "u_owner",
            to: "u_owner@example.com",
            mail: {
                subject: "Rye & Co: New order ORD-012",
                heading: "New order ORD-012",
                body: "₹1,240, paid online.",
                url: "https://app.saroh.localhost/commerce/orders/ord_1",
                cta: "Open the order",
                footer: "You get this because email is on for “New order” in your alerts at Rye & Co. You can change it in Saroh, in Settings under Your profile.",
            },
        });
        // The bell has it too, once.
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });

    it("leaves out whoever turned the New order email off, and still emails who turned it on", async () => {
        const tx = makeTx();
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_admin",
                event: "order",
                channel: "email",
                enabled: false,
            },
            {
                userId: "u_kitchen",
                event: "order",
                channel: "email",
                enabled: true,
            },
        ]);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_kitchen"]);
    });

    it("the job sends once the claim commits, and a retry sends nothing", async () => {
        const tx = makeTx();
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        const job = {
            id: "job_9",
            type: TEAM_ALERT_TYPE,
            organizationId: ORG,
            payload: { event: "order", orderId: "ord_1" },
        } as unknown as Job;
        await new TeamAlertHandler().handle(job);
        expect(sendTeamAlertEmail).toHaveBeenCalledTimes(2);

        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        await new TeamAlertHandler().handle(job);
        expect(sendTeamAlertEmail).toHaveBeenCalledTimes(2);
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });
});

describe("the website's review (UX-043)", () => {
    const at = new Date("2026-10-07T10:00:00Z");
    function approval(tx: FakeTx, outcome: string, over = {}) {
        tx.siteApproval.findFirst.mockImplementation(
            (args: { where: { id?: string } }) =>
                Promise.resolve(
                    args.where.id
                        ? {
                              id: "apr_1",
                              siteId: "site_1",
                              outcome,
                              byUserId:
                                  outcome === "REQUESTED"
                                      ? "u_owner"
                                      : "u_rina",
                              createdAt: at,
                              testReleaseId: null,
                              by:
                                  outcome === "REQUESTED"
                                      ? { name: "Owner Free", email: "o@x" }
                                      : { name: "Rina Reviewer", email: "r@x" },
                              site: { name: "Rye & Co" },
                              testRelease: null,
                              ...over,
                          }
                        : // The request this verdict answers.
                          { byUserId: "u_owner", id: "apr_0" },
                ),
        );
        tx.siteReviewer.findMany.mockResolvedValue([
            { userId: "u_rina", user: { email: "u_rina@example.com" } },
            // A grant for someone no longer on the team.
            { userId: "u_gone", user: { email: "gone@example.com" } },
        ]);
    }

    it("asking for a review emails the site's reviewers, and puts nothing in the bell", async () => {
        const tx = makeTx();
        approval(tx, "REQUESTED");
        const out = await tellTeam(
            asTx(tx),
            ORG,
            { event: "review", about: "approval", approvalId: "apr_1" },
            at,
        );
        expect(out.told).toBe(true);
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(out.emails).toEqual([
            {
                userId: "u_rina",
                to: "u_rina@example.com",
                mail: {
                    subject:
                        "Rye & Co: Owner Free asked you to review Rye & Co",
                    heading: "Owner Free asked you to review Rye & Co",
                    body: "Open it to leave notes on what you see, then approve it or ask for changes.",
                    url: "https://app.saroh.localhost/sites/site_1/review",
                    cta: "Open the review",
                    footer: "You get this because you review the website of Rye & Co in Saroh.",
                },
            },
        ]);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({ eventKey: "team:review:apr_1", kind: "TEAM_TOLD" });
    });

    it("an approval tells who publishes in the bell, and emails who asked", async () => {
        const tx = makeTx();
        approval(tx, "APPROVED");
        tx.siteComment.count.mockResolvedValue(1);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "review",
            about: "approval",
            approvalId: "apr_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "site.review.approved",
            // The row opens the website.
            siteId: "site_1",
            title: "Rina Reviewer approved Rye & Co",
            body: "With 1 open note to look at before it goes live.",
        });
        // The Website row's email is on by default for who can publish;
        // the reviewer who approved it isn't told of their own verdict.
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
    });

    it("a change request says their notes say what", async () => {
        const tx = makeTx();
        approval(tx, "CHANGES_REQUESTED");
        tx.siteComment.count.mockResolvedValue(2);
        await tellTeam(asTx(tx), ORG, {
            event: "review",
            about: "approval",
            approvalId: "apr_1",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "site.review.changes",
            title: "Rina Reviewer asked for changes to Rye & Co",
            body: "Their 2 open notes say what to change.",
        });
    });

    it("a verdict on a release gone live since says nothing", async () => {
        const tx = makeTx();
        approval(tx, "APPROVED", {
            testReleaseId: "rel_1",
            testRelease: {
                name: "Spring",
                discardedAt: null,
                wentLiveAt: at,
            },
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "review",
            about: "approval",
            approvalId: "apr_1",
        });
        expect(out.told).toBe(false);
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    function note(tx: FakeTx, author: string, role: string) {
        tx.siteComment.findFirst.mockResolvedValue({
            siteId: "site_1",
            body: "The opening   line\nundersells you.",
            pageTitle: "Home",
            authorUserId: author,
            createdAt: at,
            testReleaseId: null,
            author: { name: "Rina Reviewer", email: "r@x" },
            site: { name: "Rye & Co" },
            testRelease: null,
        });
        tx.membership.findUnique.mockResolvedValue({ role });
        tx.siteApproval.findFirst.mockResolvedValue({ id: "apr_0" });
    }

    it("a reviewer's note is told once per round, quoted in the bell only", async () => {
        const tx = makeTx();
        note(tx, "u_rina", "REVIEWER");
        const out = await tellTeam(asTx(tx), ORG, {
            event: "review",
            about: "note",
            commentId: "c_1",
        });
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({
            eventKey: "team:review-note:site_1:draft:u_rina:apr_0",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "site.review.note",
            title: "Rina Reviewer left a note on Rye & Co",
            body: "On Home: “The opening line undersells you.”",
        });
        // The Website row's email: who wrote it, never what they wrote.
        expect(out.emails[0].mail).toMatchObject({
            heading: "Rina Reviewer left a note on Rye & Co",
            body: "Open the review in Saroh to read it.",
        });
        expect(JSON.stringify(out.emails[0].mail)).not.toContain("undersells");
    });

    it("a note by someone who publishes tells nobody", async () => {
        const tx = makeTx();
        note(tx, "u_owner", "OWNER");
        const out = await tellTeam(asTx(tx), ORG, {
            event: "review",
            about: "note",
            commentId: "c_1",
        });
        expect(out.told).toBe(false);
    });

    it("a new test release mails the reviewers its link in the workspace", async () => {
        const tx = makeTx();
        tx.siteTestRelease = {
            findFirst: jest.fn().mockResolvedValue({
                id: "rel_1",
                siteId: "site_1",
                name: "Subheading fix",
                discardedAt: null,
                wentLiveAt: null,
                createdByUserId: "u_owner",
                site: { name: "Rye & Co" },
            }),
        } as never;
        tx.user.findUnique.mockResolvedValue({
            name: "Owner Free",
            email: "o@x",
        });
        tx.siteReviewer.findMany.mockResolvedValue([
            { userId: "u_rina", user: { email: "u_rina@example.com" } },
        ]);
        const out = await tellTeam(
            asTx(tx),
            ORG,
            { event: "review", about: "release", testReleaseId: "rel_1" },
            at,
        );
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(out.emails).toHaveLength(1);
        expect(out.emails[0].to).toBe("u_rina@example.com");
        expect(out.emails[0].mail).toMatchObject({
            heading:
                "Owner Free made a test release of Rye & Co: Subheading fix",
            url: "https://app.saroh.localhost/sites/site_1/releases/rel_1",
            cta: "Open the test release",
        });
    });
});

/**
 * A customer asked to remove their data (DEC-172, #1106): the bell names
 * them, Saroh's email names nobody, and it reaches whoever can run a
 * customer removal, email on by default.
 */
describe("a customer asks to remove their data", () => {
    const openRequest = {
        id: "dr_1",
        status: "OPEN",
        contactId: "con_1",
        requesterName: "Asha R",
        contact: { firstName: "Asha", lastName: "Rao", removedAt: null },
    };

    it("rings the bell on the customer, and emails the owner and admin", async () => {
        const tx = makeTx();
        tx.customerDataRequest.findFirst.mockResolvedValue(openRequest);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "request",
            requestId: "dr_1",
        });
        expect(tx.customerDataRequest.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "dr_1", organizationId: ORG },
            }),
        );
        expect(tx.customerNotice.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    eventKey: "team:request:dr_1",
                    kind: "TEAM_TOLD",
                }),
            ],
            skipDuplicates: true,
        });
        expect(tx.notification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: ORG,
                type: "customer.data-request",
                contactId: "con_1",
                title: "Asha Rao asked to remove their data",
            }),
            select: { id: true },
        });
        // Only the roles that hold customer:remove; email on by default.
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        const mail = out.emails[0].mail;
        expect(mail.subject).toBe(
            "Rye & Co: A customer asked to remove their data",
        );
        expect(mail.body).not.toContain("Asha");
        expect(mail.body).toContain(
            "Receipts and invoices are kept as the law requires.",
        );
        expect(mail.url).toBe("https://app.saroh.localhost/contacts/con_1");
        expect(mail.footer).toContain("“Data removal requests”");
    });

    it("with no customer linked, names them as they asked and opens the requests", async () => {
        const tx = makeTx();
        tx.customerDataRequest.findFirst.mockResolvedValue({
            ...openRequest,
            contactId: null,
            contact: null,
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "request",
            requestId: "dr_1",
        });
        expect(tx.notification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                title: "Asha R asked to remove their data",
            }),
            select: { id: true },
        });
        expect(
            tx.notification.create.mock.calls[0][0].data.contactId,
        ).toBeUndefined();
        expect(out.emails[0].mail.url).toBe(
            "https://app.saroh.localhost/commerce/customers?tab=requests",
        );
    });

    it("is not announced once done or closed", async () => {
        for (const status of ["DONE", "CLOSED_WITHOUT_REMOVAL"]) {
            const tx = makeTx();
            tx.customerDataRequest.findFirst.mockResolvedValue({
                ...openRequest,
                status,
            });
            const out = await tellTeam(asTx(tx), ORG, {
                event: "request",
                requestId: "dr_1",
            });
            expect(out).toEqual({ told: false, emails: [] });
            expect(tx.notification.create).not.toHaveBeenCalled();
        }
    });
});

describe("a booking with you (#1138)", () => {
    const AT = new Date("2026-10-27T05:30:00.000Z");
    const WAS = new Date("2026-10-26T05:30:00.000Z");
    const booking = {
        id: "bk_1",
        status: "CONFIRMED",
        startAt: AT,
        timezone: "Asia/Kolkata",
        staffId: "st_ravi",
        bookerName: "Asha R",
        service: { name: "Physio" },
        contact: { firstName: "Asha", lastName: "Rao" },
    };
    const event = {
        id: "ev_1",
        type: "BOOKED",
        fromStartAt: null,
        toStartAt: AT,
        fromStaffId: null,
        toStaffId: null,
        toStaff: null,
    };

    /** Ravi is u_kitchen, a Member on the diary. */
    function ravi(tx: FakeTx, over: Partial<typeof event> = {}) {
        tx.booking.findFirst.mockResolvedValue(booking);
        tx.bookingEvent.findFirst.mockResolvedValue({ ...event, ...over });
        tx.staffMember.findFirst.mockResolvedValue({
            membership: { userId: "u_kitchen" },
        });
    }

    it("rings Ravi's own bell, and emails Ravi alone, with no customer's name", async () => {
        const tx = makeTx();
        ravi(tx);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "new",
        });
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0].eventKey,
        ).toBe("team:booking-mine:ev_1:u_kitchen");
        expect(tx.notification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: ORG,
                userId: "u_kitchen",
                type: "booking.mine.new",
                bookingId: "bk_1",
                title: "Asha Rao booked Physio with you",
            }),
            select: { id: true },
        });
        // Only Ravi, though the owner and admin read bookings too.
        expect(recipients(out)).toEqual(["u_kitchen"]);
        const mail = out.emails[0].mail;
        expect(mail.heading).toBe("A booking with you: Physio");
        expect(mail.body).toBe(
            "Physio, Tue 27 Oct at 11:00 am. Open it in Saroh to see who.",
        );
        expect(JSON.stringify(mail)).not.toContain("Asha");
        expect(mail.url).toBe("https://app.saroh.localhost/bookings/bk_1");
        expect(mail.footer).toContain("“Bookings with you”");
    });

    it("Ravi turned email off: the bell only", async () => {
        const tx = makeTx();
        ravi(tx);
        tx.notificationPreference.findMany.mockResolvedValue([
            {
                userId: "u_kitchen",
                event: "mine",
                channel: "email",
                enabled: false,
            },
        ]);
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "new",
        });
        expect(out.told).toBe(true);
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
        expect(out.emails).toEqual([]);
    });

    it("moved: says the new time and the old", async () => {
        const tx = makeTx();
        ravi(tx, { type: "RESCHEDULED", fromStartAt: WAS });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "moved",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "booking.mine.moved",
            title: "Asha Rao's Physio with you was moved",
            body: "Now Tue 27 Oct at 11:00 am. It was Mon 26 Oct at 11:00 am.",
        });
        expect(out.emails[0].mail.heading).toBe("A booking with you was moved");
    });

    it("cancelled: told even though the booking is cancelled now", async () => {
        const tx = makeTx();
        ravi(tx, { type: "CANCELLED", fromStartAt: AT, toStartAt: null });
        tx.booking.findFirst.mockResolvedValue({
            ...booking,
            status: "CANCELLED",
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "cancelled",
        });
        expect(tx.notification.create.mock.calls[0][0].data.type).toBe(
            "booking.mine.cancelled",
        );
        expect(out.emails[0].mail.body).toBe(
            "Physio, Tue 27 Oct at 11:00 am. It's off your diary.",
        );
    });

    it("given to Meera: Ravi's is email only, the bell was written with the move (#1157)", async () => {
        const tx = makeTx();
        ravi(tx, {
            type: "REASSIGNED",
            fromStartAt: AT,
            fromStaffId: "st_ravi",
            toStaffId: "st_meera",
            toStaff: { name: "Meera" } as never,
        });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "moved-away",
        });
        expect(tx.staffMember.findFirst.mock.calls[0][0].where.id).toBe(
            "st_ravi",
        );
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(out.emails[0].mail).toMatchObject({
            heading: "A booking was given to someone else",
            body: "Physio, Tue 27 Oct at 11:00 am, is now with Meera. It's off your diary.",
        });
    });

    it("says nothing when it no longer stands", async () => {
        const cases: [string, (tx: FakeTx) => void][] = [
            [
                "someone else has it now",
                (tx) => {
                    tx.staffMember.findFirst.mockResolvedValue({
                        membership: { userId: "u_admin" },
                    });
                },
            ],
            [
                "Ravi left the team",
                (tx) => {
                    tx.staffMember.findFirst.mockResolvedValue({
                        membership: null,
                    });
                },
            ],
            [
                "the new booking was cancelled since",
                (tx) => {
                    tx.booking.findFirst.mockResolvedValue({
                        ...booking,
                        status: "CANCELLED",
                    });
                },
            ],
            [
                "the booking is gone",
                (tx) => {
                    tx.booking.findFirst.mockResolvedValue(null);
                },
            ],
        ];
        for (const [, change] of cases) {
            const tx = makeTx();
            ravi(tx);
            change(tx);
            const out = await tellTeam(asTx(tx), ORG, {
                event: "booking-mine",
                bookingId: "bk_1",
                eventId: "ev_1",
                userId: "u_kitchen",
                change: "new",
            });
            expect(out).toEqual({ told: false, emails: [] });
            expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
        }
    });

    it("a job run twice tells once", async () => {
        const tx = makeTx();
        ravi(tx);
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const out = await tellTeam(asTx(tx), ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_kitchen",
            change: "new",
        });
        expect(out).toEqual({ told: false, emails: [] });
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it("the job skips a payload with no person or an unknown change", async () => {
        const handler = new TeamAlertHandler();
        for (const payload of [
            { event: "booking-mine", bookingId: "bk_1", eventId: "ev_1" },
            {
                event: "booking-mine",
                bookingId: "bk_1",
                eventId: "ev_1",
                userId: "u_kitchen",
                change: "lost",
            },
        ]) {
            await handler.handle({
                id: "job_m",
                organizationId: ORG,
                payload,
            } as unknown as Job);
        }
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("a refund that sent no money back (#1143)", () => {
    const refused = {
        event: "refund",
        refundId: "ref_1",
        change: "refused",
    } as const;
    const failed = { ...refused, change: "failed" } as const;
    const ORDER = {
        id: "ord_1",
        orderId: "#1042",
        paymentStatus: "PAID",
        customerId: "cus_1",
        walkInName: null,
        customer: { firstName: "Asha", lastName: "Rao", email: null },
    };
    function refundTx(
        intent: Partial<{
            order: unknown;
            invoice: unknown;
            purpose: string | null;
            refunds: { amountCents: number }[];
        }>,
        status = "FAILED",
    ) {
        const tx = makeTx();
        const withRefunds = tx as FakeTx & {
            paymentRefund: { findFirst: jest.Mock };
            customerNotice: { findUnique: jest.Mock };
        };
        withRefunds.paymentRefund.findFirst = jest.fn().mockResolvedValue({
            id: "ref_1",
            status,
            amountCents: 50000,
            currency: "INR",
            paymentIntent: {
                amountCents: 120000,
                purpose: null,
                refunds: [],
                order: null,
                invoice: null,
                ...intent,
            },
        });
        withRefunds.customerNotice.findUnique = jest
            .fn()
            .mockResolvedValue(null);
        return withRefunds;
    }

    it("refused on an order: the bell opens the order, keyed to the refund, on the Payment failed row", async () => {
        const tx = refundTx({ order: ORDER });
        const out = await tellTeam(asTx(tx), ORG, refused);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({ eventKey: "team:refund:refused:ref_1" });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: ORG,
            type: "refund.refused",
            orderId: "ord_1",
            title: "Refund on order #1042 was refused",
            body: "Asha Rao's refund of ₹500 was refused by your payment provider. No money went back to the customer. Open the order to refund it again.",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        // Saroh's email names no customer.
        expect(out.emails[0].mail.body).not.toContain("Asha");
        expect(out.emails[0].mail.body).toContain("₹500");
    });

    it("whoever asked for it and saw the refusal isn't emailed; the rest are", async () => {
        const tx = refundTx({ order: ORDER });
        const out = await tellTeam(asTx(tx), ORG, {
            ...refused,
            actorUserId: "u_owner",
        });
        expect(recipients(out)).toEqual(["u_admin"]);
    });

    it("a booking's automatic refund refused: opens the booking", async () => {
        const tx = refundTx({
            invoice: {
                id: "inv_1",
                number: "INV-0042",
                billToName: null,
                contact: null,
                booking: {
                    id: "bk_1",
                    bookerName: "Meera",
                    service: { name: "Haircut" },
                    contact: { firstName: "Meera", lastName: "Iyer" },
                },
            },
        });
        const out = await tellTeam(asTx(tx), ORG, refused);
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "refund.refused.booking",
            bookingId: "bk_1",
            title: "Refund for Meera Iyer's Haircut was refused",
        });
        expect(out.emails[0].mail).toMatchObject({
            heading: "Refund on a booking was refused",
            body: expect.stringContaining(
                "A refund of ₹500 on a Haircut booking was refused",
            ),
        });
        expect(out.emails[0].mail.body).not.toContain("Meera");
    });

    it("failed later on an invoice, after the customer was told: says so", async () => {
        const tx = refundTx({
            invoice: {
                id: "inv_1",
                number: "INV-0042",
                billToName: "Rao Traders",
                contact: null,
                booking: null,
            },
        });
        tx.customerNotice.findUnique.mockResolvedValue({
            threadMessageId: null,
            messageId: "msg_1",
        });
        await tellTeam(asTx(tx), ORG, failed);
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({ eventKey: "team:refund:failed:ref_1" });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "refund.failed.invoice",
            invoiceId: "inv_1",
            title: "Refund on invoice INV-0042 failed",
            body: "Rao Traders's refund of ₹500 failed at your payment provider after it was sent. No money went back, though the customer was told it was on its way.",
        });
    });

    it("says nothing once it went back after all, money was handed back since, or for the autopay check", async () => {
        const settled = refundTx({ order: ORDER }, "SUCCEEDED");
        expect((await tellTeam(asTx(settled), ORG, failed)).told).toBe(false);

        const handedBack = refundTx({
            order: ORDER,
            refunds: [{ amountCents: 120000 }],
        });
        expect((await tellTeam(asTx(handedBack), ORG, refused)).told).toBe(
            false,
        );

        const check = refundTx({ purpose: "AUTHORISATION" });
        expect((await tellTeam(asTx(check), ORG, refused)).told).toBe(false);
        expect(check.notification.create).not.toHaveBeenCalled();
    });

    it("a refund alert job with no refund or an unknown change is dropped", async () => {
        const job = (payload: unknown) =>
            ({
                id: "job_1",
                organizationId: ORG,
                type: TEAM_ALERT_TYPE,
                payload,
            }) as unknown as Job;
        const handler = new TeamAlertHandler();
        await handler.handle(job({ event: "refund", change: "refused" }));
        await handler.handle(
            job({ event: "refund", refundId: "ref_1", change: "maybe" }),
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
