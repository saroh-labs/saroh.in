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
            findMany: jest
                .fn()
                .mockResolvedValue([
                    member("u_owner", "OWNER"),
                    member("u_admin", "ADMIN"),
                    member("u_kitchen", "MEMBER"),
                    member("u_clerk", "stock-clerk"),
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

const recipients = (out: { emails: AlertEmail[] }) =>
    out.emails.map((e) => e.userId);

beforeEach(() => {
    jest.clearAllMocks();
});

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
            title: "New order ORD-012 from Asha Rao",
            body: "₹1,240.00, paid online.",
        });
        expect(tx.customerNotice.update.mock.calls[0][0].data).toEqual({
            notificationId: "ntf_1",
        });
    });

    it("emails nobody by default: email is on only for a failed payment", async () => {
        const tx = makeTx();
        const out = await tellTeam(asTx(tx), ORG, {
            event: "order",
            orderId: "ord_1",
        });
        expect(out.emails).toEqual([]);
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
                body: "₹1,240.00, paid online.",
                url: "https://app.saroh.localhost/commerce/orders/ord_1",
                footer: "You get this because email is on for “New order” in your alerts at Rye & Co. You can change it in Saroh, in Settings under Your profile.",
            },
        });
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
            body: "₹1,240.00, at the counter.",
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
            title: "Payment failed on invoice INV-0042",
            body: "Meera Iyer's payment of ₹2,400.00 didn't go through. They can try again from the same link.",
        });
        expect(recipients(out)).toEqual(["u_owner", "u_admin"]);
        // The bell names the customer; Saroh's email doesn't.
        expect(out.emails[0].mail).toMatchObject({
            heading: "Payment failed on invoice INV-0042",
            body: "A payment of ₹2,400.00 didn't go through. The customer can try again from the same link.",
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

describe("the email", () => {
    it("carries fixed words and the business's name, cleaned, links into the workspace and says why they got it", () => {
        const mail = renderAlertEmail(
            {
                event: "order",
                mail: {
                    heading: "New order ORD-1",
                    body: "₹10.00, paid online.",
                },
                path: "/commerce/orders/ord_1",
            },
            "Rye & Co",
        );
        expect(mail).toEqual({
            subject: "Rye & Co: New order ORD-1",
            heading: "New order ORD-1",
            body: "₹10.00, paid online.",
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
