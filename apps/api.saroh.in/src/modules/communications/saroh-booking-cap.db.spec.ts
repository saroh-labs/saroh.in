/**
 * Saroh's cap on emails about one booking (DEC-086, after the code review),
 * against a real Postgres: a customer moving one booking four times in a
 * day gets three emails from Saroh; the fourth is recorded BOOKING_LIMIT,
 * not counted against the allowance, and its account message still
 * stands. Another booking at the same business is untouched, and a
 * business's own provider has no such cap.
 *
 * Every number is made up (`fakeSarohEmailsCatalog`: Plan E's 20 a month,
 * so the allowance never gets in the way). The switches are on per
 * business, never for everyone. Saroh's sender is a stand-in (no SES).
 * Runs in the integration project.
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

import { prisma } from "@saroh/database";

import {
    fakeSarohEmailsCatalog,
    installCatalogue,
    sarohEmailVersion,
    subscribe,
} from "../../../test/fixtures/saroh-email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { countUsage } from "../billing/metering";
import { FlagKey } from "../feature-flags/flags";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { CommunicationsService } from "./communications.service";
import { sendSarohBusinessEmail } from "./providers/saroh-email.sender";
import { SAROH_EMAILS_PER_BOOKING_PER_DAY } from "./saroh-delivery";

const send = sendSarohBusinessEmail as jest.Mock;

const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);

const V = sarohEmailVersion();
const ZONE = "Asia/Kolkata";
const HOUR = 3600_000;

let staffId: string;
let seq = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

beforeAll(async () => {
    await installCatalogue(V, fakeSarohEmailsCatalog());
    staffId = (
        await prisma.user.create({
            data: { email: `${uniq("saroh-cap-staff")}@example.com` },
        })
    ).id;
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
    serviceId: string;
}

/** A business with no email provider on Plan E; Asha has a site account. */
async function business(): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("saroh-cap") },
    });
    await subscribe(org.id, "max", V);
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
    const service = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Check-up",
            durationMinutes: 30,
            capacity: 1,
            currency: "INR",
            timezone: ZONE,
        },
    });
    await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, org.id);
    await setFlag(FlagKey.PLAN_ENFORCEMENT, org.id);
    await setFlag(FlagKey.ACCOUNT_THREAD, org.id);
    return {
        owner: { organizationId: org.id, userId: staffId, role: "OWNER" },
        orgId: org.id,
        contactId: contact.id,
        accountId: account.id,
        serviceId: service.id,
    };
}

/** A confirmed booking Asha made, three days out. */
async function booking(b: Business): Promise<string> {
    const startAt = new Date(Date.now() + 72 * HOUR);
    const row = await prisma.booking.create({
        data: {
            organizationId: b.orgId,
            serviceId: b.serviceId,
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
    return row.id;
}

/** Asha moves the booking an hour later, and `customer.notify` tells her. */
async function moveAndTell(b: Business, bookingId: string): Promise<void> {
    const current = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { startAt: true },
    });
    const to = new Date(current.startAt.getTime() + HOUR);
    await prisma.booking.update({
        where: { id: bookingId },
        data: { startAt: to, endAt: new Date(to.getTime() + 30 * 60_000) },
    });
    const event = await prisma.bookingEvent.create({
        data: {
            bookingId,
            organizationId: b.orgId,
            type: "RESCHEDULED",
            fromStartAt: current.startAt,
            toStartAt: to,
            actorUserId: null,
        },
    });
    const job = await prisma.job.create({
        data: {
            organizationId: b.orgId,
            type: CUSTOMER_NOTIFY_TYPE,
            payload: {
                kind: "BOOKING_MOVED",
                eventKey: `booking:${event.id}`,
                bookingId,
                bookingEventId: event.id,
            },
        },
    });
    await customerNotify.handle(job);
}

/** The statuses of the messages told about one booking, oldest first. */
async function toldAbout(orgId: string, bookingId: string) {
    const notices = await prisma.customerNotice.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { createdAt: "asc" },
        select: { messageId: true, threadMessageId: true },
    });
    const messages = await prisma.message.findMany({
        where: {
            id: { in: notices.flatMap((n) => n.messageId ?? []) },
        },
        orderBy: { createdAt: "asc" },
        select: { status: true },
    });
    return {
        statuses: messages.map((m) => m.status),
        threadMessages: notices.filter((n) => n.threadMessageId !== null)
            .length,
    };
}

describe("Saroh's cap on emails about one booking (DEC-086, real database)", () => {
    it("four moves in a day: three emails, the fourth BOOKING_LIMIT and not counted; every account message stands; another booking untouched", async () => {
        expect(SAROH_EMAILS_PER_BOOKING_PER_DAY).toBe(3);
        const b = await business();
        const moved = await booking(b);
        for (let i = 0; i < 4; i++) await moveAndTell(b, moved);

        const one = await toldAbout(b.orgId, moved);
        expect(one.statuses).toEqual([
            "QUEUED",
            "QUEUED",
            "QUEUED",
            "BOOKING_LIMIT",
        ]);
        expect(one.threadMessages).toBe(4);
        expect(
            await prisma.delivery.count({
                where: { organizationId: b.orgId, provider: "SAROH" },
            }),
        ).toBe(3);
        expect(await countUsage(prisma, b.orgId, "sarohEmailsPerMonth")).toBe(
            3,
        );

        // Another booking of hers is told as ever.
        const other = await booking(b);
        await moveAndTell(b, other);
        expect((await toldAbout(b.orgId, other)).statuses).toEqual(["QUEUED"]);
        expect(await countUsage(prisma, b.orgId, "sarohEmailsPerMonth")).toBe(
            4,
        );
    });

    it("emails more than a day old don't count towards the cap", async () => {
        const b = await business();
        const moved = await booking(b);
        for (let i = 0; i < 3; i++) await moveAndTell(b, moved);
        // Yesterday's three, as far as the cap is concerned.
        const dayAgo = new Date(Date.now() - 25 * HOUR);
        await prisma.delivery.updateMany({
            where: { organizationId: b.orgId },
            data: { createdAt: dayAgo },
        });
        await prisma.customerNotice.updateMany({
            where: { organizationId: b.orgId },
            data: { createdAt: dayAgo },
        });
        await moveAndTell(b, moved);
        expect((await toldAbout(b.orgId, moved)).statuses.at(-1)).toBe(
            "QUEUED",
        );
    });

    it("a business's own provider has no cap per booking", async () => {
        const b = await business();
        await comms.connectProvider(b.owner, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
        const moved = await booking(b);
        for (let i = 0; i < 4; i++) await moveAndTell(b, moved);
        expect((await toldAbout(b.orgId, moved)).statuses).toEqual([
            "QUEUED",
            "QUEUED",
            "QUEUED",
            "QUEUED",
        ]);
        const deliveries = await prisma.delivery.findMany({
            where: { organizationId: b.orgId },
            select: { provider: true },
        });
        expect(deliveries.every((d) => d.provider === "RESEND")).toBe(true);
    });
});
