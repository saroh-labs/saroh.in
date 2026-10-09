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
        merchantPaymentProvider: { findFirst: jest.fn() },
        communicationProvider: { findFirst: jest.fn() },
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
            title: "New order ORD-012 from Asha Rao",
            body: "₹1,240.00, paid online.",
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
                body: "₹1,240.00, at the counter.",
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
        ).toBe(`team:provider:mpp_1:${SINCE}`);
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
                body: "₹1,240.00, paid online.",
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
