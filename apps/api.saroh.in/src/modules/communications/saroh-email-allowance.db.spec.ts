/**
 * The monthly allowance for emails Saroh sends for a business (DEC-086,
 * U3) against a real Postgres: a business walked past its allowance, what
 * counts (and what doesn't), the month turning in the business's zone,
 * every way the plan can give Saroh nothing to send against (fail closed),
 * the last email raced for, and the notices that lead with "Connect your
 * email".
 *
 * Every number is made up (`fakeSarohEmailsCatalog`: 3 a month on Plan A,
 * 1 on Plan B, no number on Plan C). The switches are on per business,
 * never for everyone. Saroh's sender is a stand-in (no SES). Runs in the
 * integration project.
 */
const mockEnv: Record<string, string | undefined> = {
    PAYMENTS_ENC_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
    SITE_ACCOUNT_AREA: "on",
};
jest.mock("../../env", () => ({ env: mockEnv }));

jest.mock("./providers/saroh-email.sender", () => ({
    ...jest.requireActual<object>("./providers/saroh-email.sender"),
    sendSarohBusinessEmail: jest.fn(),
}));

import { Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    fakeSarohEmailsCatalog,
    installCatalogue,
    sarohEmailVersion,
    subscribe,
} from "../../../test/fixtures/saroh-email";
import {
    backendPid,
    gate,
    waitUntilAdvisoryBlockedBy,
} from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { countUsage, monthWindow } from "../billing/metering";
import { PLAN_LIMIT_NOTICE_TYPE, planMeter } from "../billing/metering.service";
import {
    PLAN_LIMIT_NOTIFICATION_TYPE,
    PlanLimitNoticeHandler,
} from "../billing/plan-limit-notice.handler";
import { BookingNotifyHandler } from "../bookings/booking-notify.handler";
import { FlagKey } from "../feature-flags/flags";
import { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import { CommunicationsService } from "./communications.service";
import { MessageSendHandler } from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";
import { sendSarohBusinessEmail } from "./providers/saroh-email.sender";
import { queueSarohInTx } from "./saroh-queue";

const send = sendSarohBusinessEmail as jest.Mock;

const comms = new CommunicationsService();
const notices = new CustomerNotifyService(comms);
const bookingNotify = new BookingNotifyHandler(notices);
const limitNotices = new PlanLimitNoticeHandler(
    new CatalogueAccessService(),
    planMeter,
);

const V = sarohEmailVersion();
const V_WITHOUT_ROW = V + 1;
const ZONE = "Asia/Kolkata";
const KEY = "sarohEmailsPerMonth" as const;

// A real team member: the booking's event names who made it.
let staffId: string;

beforeAll(async () => {
    staffId = (
        await prisma.user.create({
            data: {
                email: `saroh-mail-staff-${process.pid}-${Date.now()}@example.com`,
            },
        })
    ).id;
});

let seq = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

beforeAll(async () => {
    await installCatalogue(V, fakeSarohEmailsCatalog());
    await installCatalogue(V_WITHOUT_ROW, fakeSarohEmailsCatalog(false));
});

afterAll(async () => {
    await prisma.$disconnect();
});

beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue("sent");
});

async function setFlag(key: string, organizationId: string): Promise<void> {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

interface Business {
    owner: OrganizationContext;
    orgId: string;
    contactId: string;
    accountId: string;
}

/**
 * A business with no email provider in India, on `planId` (null: no plan,
 * so off the catalogue), whose customer Asha has a site account.
 */
async function business(
    planId: string | null = "free",
    version = V,
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("allowance") },
    });
    if (planId) await subscribe(org.id, planId, version);
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
        },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: org.id,
            contactId: contact.id,
            email: "asha@example.com",
            emailVerifiedAt: new Date(),
        },
    });
    await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, org.id);
    await setFlag(FlagKey.PLAN_ENFORCEMENT, org.id);
    return {
        owner: { organizationId: org.id, userId: staffId, role: "OWNER" },
        orgId: org.id,
        contactId: contact.id,
        accountId: account.id,
    };
}

/** A confirmed booking Asha made, and its BookingEvent. */
async function booking(b: Business) {
    const service = await prisma.service.create({
        data: {
            organizationId: b.orgId,
            name: "Check-up",
            durationMinutes: 30,
            capacity: 1,
            currency: "INR",
            timezone: ZONE,
        },
    });
    const startAt = new Date(Date.now() + 3 * 24 * 3600_000);
    const row = await prisma.booking.create({
        data: {
            organizationId: b.orgId,
            serviceId: service.id,
            contactId: b.contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
            timezone: ZONE,
            status: "CONFIRMED",
            snapshot: {},
            bookerName: "Asha Rao",
            customerAccountId: b.accountId,
        },
    });
    const event = await prisma.bookingEvent.create({
        data: {
            bookingId: row.id,
            organizationId: b.orgId,
            type: "BOOKED",
            toStartAt: startAt,
            actorUserId: staffId,
        },
    });
    return { row, event, service };
}

/** Book and tell, as `booking.notify` does. */
async function bookAndTell(b: Business): Promise<void> {
    const { row, event, service } = await booking(b);
    const job = await prisma.job.create({
        data: {
            organizationId: b.orgId,
            type: "booking.notify",
            payload: {
                bookingId: row.id,
                serviceId: service.id,
                contactId: b.contactId,
                reason: "booked",
                eventId: event.id,
            },
        },
    });
    await bookingNotify.handle(job);
}

async function jobsOf(organizationId: string, type: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });
}

async function sendAll(organizationId: string): Promise<void> {
    const handler = new MessageSendHandler(
        new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
    );
    for (const job of await jobsOf(organizationId, "message.send")) {
        await handler.handle(job).catch(() => undefined);
    }
}

async function statuses(organizationId: string): Promise<string[]> {
    const rows = await prisma.message.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: { status: true },
    });
    return rows.map((r) => r.status);
}

/** A Saroh delivery as it stands, for what the count reads. */
async function sarohDelivery(
    organizationId: string,
    over: { status?: string; attempts?: number; createdAt?: Date } = {},
    provider = "SAROH",
) {
    const message = await prisma.message.create({
        data: {
            organizationId,
            channel: "EMAIL",
            toAddress: "asha@example.com",
            body: "x",
        },
    });
    return prisma.delivery.create({
        data: {
            organizationId,
            messageId: message.id,
            provider,
            status: over.status ?? "SENT",
            attempts: over.attempts ?? 1,
            ...(over.createdAt ? { createdAt: over.createdAt } : {}),
        },
    });
}

describe("the allowance for emails Saroh sends (DEC-086, U3, real database)", () => {
    it("allowance 3: the third sends, the fourth is not emailed, its thread message stands and the reason is recorded", async () => {
        await prisma.featureFlag.upsert({
            where: { key: FlagKey.ACCOUNT_THREAD },
            create: { key: FlagKey.ACCOUNT_THREAD, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
        const b = await business();
        for (let i = 0; i < 4; i++) await bookAndTell(b);
        await sendAll(b.orgId);

        expect(await statuses(b.orgId)).toEqual([
            "SENT",
            "SENT",
            "SENT",
            "ALLOWANCE_USED",
        ]);
        expect(send).toHaveBeenCalledTimes(3);
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(3);
        // Every booking still told the customer in their account.
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: b.orgId },
            }),
        ).toBe(4);
        const notice = await prisma.customerNotice.findMany({
            where: { organizationId: b.orgId, kind: "BOOKING_CONFIRMED" },
            select: { messageId: true },
        });
        expect(notice.every((n) => n.messageId !== null)).toBe(true);
        // And the quick look no longer says they're emailed.
        expect(await comms.noticeReach(b.owner, b.contactId)).toMatchObject({
            email: false,
            reach: "ACCOUNT",
        });
        await prisma.featureFlag.update({
            where: { key: FlagKey.ACCOUNT_THREAD },
            data: { enabledByDefault: false },
        });
    });

    it("never counts sends through the business's own provider", async () => {
        const b = await business();
        await comms.connectProvider(b.owner, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
        // Past Saroh's 3: the business's own email has no such limit.
        for (let i = 0; i < 4; i++) await bookAndTell(b);
        const deliveries = await prisma.delivery.findMany({
            where: { organizationId: b.orgId },
            select: { provider: true },
        });
        expect(deliveries.map((d) => d.provider)).toEqual([
            "RESEND",
            "RESEND",
            "RESEND",
            "RESEND",
        ]);
        expect(await statuses(b.orgId)).toEqual([
            "QUEUED",
            "QUEUED",
            "QUEUED",
            "QUEUED",
        ]);
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(0);
    });

    it("counts a failed send still due a retry, not one out of tries or stopped; a retried success once", async () => {
        const b = await business();
        await sarohDelivery(b.orgId, { status: "FAILED", attempts: 2 });
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(1);
        await sarohDelivery(b.orgId, { status: "FAILED", attempts: 5 });
        await sarohDelivery(b.orgId, { status: "STOPPED", attempts: 1 });
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(1);
        // Unknown may have gone: it counts.
        await sarohDelivery(b.orgId, { status: "UNKNOWN", attempts: 1 });
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(2);

        const c = await business();
        await bookAndTell(c);
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        const [job] = await jobsOf(c.orgId, "message.send");
        send.mockResolvedValueOnce("failed");
        await expect(handler.handle(job)).rejects.toThrow();
        expect(await countUsage(prisma, c.orgId, KEY)).toBe(1);
        await handler.handle(job);
        expect(await countUsage(prisma, c.orgId, KEY)).toBe(1);
    });

    it("starts again when the month turns in the business's zone, not UTC's", async () => {
        const b = await business();
        const { start } = monthWindow(new Date(), ZONE);
        // Just before midnight on the 1st in India: last month's.
        await sarohDelivery(b.orgId, {
            createdAt: new Date(start.getTime() - 60_000),
        });
        await sarohDelivery(b.orgId, {
            createdAt: new Date(start.getTime() + 60_000),
        });
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(1);
        // Last month's three don't fill this month's three.
        for (let i = 0; i < 3; i++) {
            await sarohDelivery(b.orgId, {
                createdAt: new Date(start.getTime() - 2 * 60_000),
            });
        }
        await bookAndTell(b);
        const told = await prisma.message.findFirstOrThrow({
            where: { organizationId: b.orgId, template: "BOOKING_CONFIRMED" },
        });
        expect(told.status).toBe("QUEUED");
        expect(
            DateTime.fromJSDate(start, { zone: ZONE }).toFormat("d HH:mm"),
        ).toBe("1 00:00");
    });

    it.each([
        ["off the catalogue (a legacy business)", null, V],
        ["on a version without the row", "free", V_WITHOUT_ROW],
        ["on a plan whose allowance has no number", "pro", V],
    ] as const)(
        "%s: not sent, and nothing recorded as sent",
        async (_name, planId, version) => {
            const b = await business(planId, version);
            await bookAndTell(b);
            expect(await statuses(b.orgId)).toEqual([]);
            expect(send).not.toHaveBeenCalled();
            expect(await comms.noticeReach(b.owner, b.contactId)).toMatchObject(
                { email: false },
            );
        },
    );

    it("a soft allowance cell (never refused) is no allowance: not sent, OFF on the screen, NO_ALLOWANCE at the queue", async () => {
        const b = await business("soft");
        await bookAndTell(b);
        expect(await statuses(b.orgId)).toEqual([]);
        expect(send).not.toHaveBeenCalled();
        expect(await comms.noticeReach(b.owner, b.contactId)).toMatchObject({
            email: false,
        });
        expect(await comms.sarohEmail(b.owner)).toEqual({
            state: "OFF",
            takesOver: false,
        });
        // Even asked past the rule (it read the plan before the cell turned
        // soft), the queue records it not emailed rather than unmetered.
        const queued = await prisma.$transaction((tx) =>
            queueSarohInTx(tx, b.orgId, {
                organizationId: b.orgId,
                channel: "EMAIL",
                contactId: b.contactId,
                toAddress: "asha@example.com",
                subject: "Your booking",
                body: "<p>Hi</p>",
                createdByUserId: null,
                invoiceId: null,
                template: "BOOKING_CONFIRMED",
            }),
        );
        expect(queued.status).toBe("NO_ALLOWANCE");
        expect(await statuses(b.orgId)).toEqual(["NO_ALLOWANCE"]);
        expect(
            await prisma.delivery.count({ where: { organizationId: b.orgId } }),
        ).toBe(0);
        expect(await jobsOf(b.orgId, "message.send")).toHaveLength(0);
    });

    it("the plan can't be read: not sent, the failed lookup logged", async () => {
        const b = await business();
        const warn = jest.spyOn(Logger.prototype, "warn");
        const resolve = jest
            .spyOn(CatalogueAccessService.prototype, "resolve")
            .mockRejectedValue(new Error("down"));
        try {
            await bookAndTell(b);
        } finally {
            resolve.mockRestore();
        }
        expect(await statuses(b.orgId)).toEqual([]);
        expect(
            warn.mock.calls.some((c) =>
                String(c[0]).includes(
                    `saroh_email_lookup_failed org=${b.orgId}`,
                ),
            ),
        ).toBe(true);
        warn.mockRestore();
    });

    it("two bookings at the last email: one sends, the other is recorded not emailed", async () => {
        // Plan B: one a month.
        const b = await business("grow");
        const one = await booking(b);
        const two = await booking(b);
        const tell = (
            tx: Parameters<CustomerNotifyService["notify"]>[0],
            x: Awaited<ReturnType<typeof booking>>,
        ) =>
            notices.notify(
                tx,
                b.orgId,
                {
                    kind: "BOOKING_CONFIRMED",
                    eventKey: `booking:${x.event.id}`,
                    bookingId: x.row.id,
                    bookingEventId: x.event.id,
                },
                new Date(),
            );
        const held = gate();
        const pid = gate<number>();
        const first = prisma.$transaction(async (tx) => {
            await tell(tx, one);
            pid.release(await backendPid(tx));
            await held.wait;
        });
        const holder = await pid.wait;
        const second = prisma.$transaction((tx) => tell(tx, two));
        await waitUntilAdvisoryBlockedBy(holder);
        held.release();
        await Promise.all([first, second]);
        expect((await statuses(b.orgId)).sort()).toEqual([
            "ALLOWANCE_USED",
            "QUEUED",
        ]);
        expect(await countUsage(prisma, b.orgId, KEY)).toBe(1);
    });

    it("the warn level and the cap each tell the owners once a month, leading with Connect your email and offering no add-on", async () => {
        const b = await business();
        const runNotices = async () => {
            for (const job of await jobsOf(b.orgId, PLAN_LIMIT_NOTICE_TYPE)) {
                await limitNotices.handle(job);
            }
        };
        // 3 a month: the 3rd email is both 80% (ceil 2.4 = 3) and the cap.
        for (let i = 0; i < 2; i++) await bookAndTell(b);
        await runNotices();
        await bookAndTell(b);
        await runNotices();
        // Past the cap, more bookings queue no second notice.
        await bookAndTell(b);
        await bookAndTell(b);
        await runNotices();
        const told = await prisma.notification.findMany({
            where: {
                organizationId: b.orgId,
                type: PLAN_LIMIT_NOTIFICATION_TYPE,
            },
            select: { title: true, body: true },
        });
        expect(told).toHaveLength(1);
        const [notice] = told;
        expect(notice.title).toBe(
            "You've reached your 3 emails Saroh sends for you a month on Plan A",
        );
        const restart = DateTime.now()
            .setZone(ZONE)
            .startOf("month")
            .plus({ months: 1 })
            .toFormat("d LLL");
        expect(notice.body).toBe(
            `Saroh has stopped sending your booking emails for this month. It starts again on ${restart}. Connect your own email and your booking emails go through it, with no monthly limit. Or Plan B raises the limit.`,
        );
        expect(notice.body).not.toMatch(/add-on/);
        // One claim for the month's cap; the refused bookings queued nothing more.
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: b.orgId, kind: "PLAN_LIMIT" },
            }),
        ).toBe(1);
        expect(await jobsOf(b.orgId, PLAN_LIMIT_NOTICE_TYPE)).toHaveLength(1);
    });

    it("allowance 10: the 80% notice at 8 and the cap's at 10 are two, each told once", async () => {
        const b = await business("ten");
        const runNotices = async () => {
            for (const job of await jobsOf(b.orgId, PLAN_LIMIT_NOTICE_TYPE)) {
                await limitNotices.handle(job);
            }
        };
        const told = () =>
            prisma.notification.findMany({
                where: {
                    organizationId: b.orgId,
                    type: PLAN_LIMIT_NOTIFICATION_TYPE,
                },
                orderBy: { createdAt: "asc" },
                select: { title: true },
            });
        for (let i = 0; i < 8; i++) await bookAndTell(b);
        await runNotices();
        const warn = await told();
        expect(warn).toHaveLength(1);
        expect(warn[0].title).not.toMatch(/reached/);

        // To the cap, then past it.
        for (let i = 0; i < 3; i++) await bookAndTell(b);
        await runNotices();
        const both = await told();
        expect(both).toHaveLength(2);
        expect(both[1].title).toBe(
            "You've reached your 10 emails Saroh sends for you a month on Plan F",
        );

        // More bookings, more runs: no repeat of either.
        await bookAndTell(b);
        await runNotices();
        await runNotices();
        expect(await told()).toHaveLength(2);
        expect(await statuses(b.orgId)).toEqual([
            ...Array<string>(10).fill("QUEUED"),
            "ALLOWANCE_USED",
            "ALLOWANCE_USED",
        ]);
    });
});
