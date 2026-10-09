/**
 * #868 (owner decision 2026-10-08), against a real Postgres: someone taking
 * bookings with no login (DEC-105) is invited from Team, joins as Calendar
 * only by default, is linked to their diary, and then reads and changes
 * their own bookings only, with no money. They are one team seat
 * throughout: before the invite, while it waits, and after they join.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { countUsage } from "../billing/metering";
import { BookingsService } from "../bookings/bookings.service";
import { StaffService } from "../staff/staff.service";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationMembersService } from "./organization-members.service";

const tag = `${process.pid}-${Date.now()}`;
const audit = { record: jest.fn() } as unknown as AuditService;
const members = new OrganizationMembersService(audit);
const contexts = new OrganizationContextService();
const bookings = new BookingsService();
const staff = new StaffService();

let orgId = "";
let owner: OrganizationContext;
let priyaStaffId = "";
let raviStaffId = "";
let serviceId = "";
let priya: OrganizationContext;
const ids: Record<string, string> = {};

const seats = () =>
    countUsage(prisma as never, orgId, "teamMembers", new Date());

async function booking(staffId: string | null, hour: number): Promise<string> {
    const startAt = new Date(Date.UTC(2026, 10, 2, hour));
    return (
        await prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId,
                staffId,
                startAt,
                endAt: new Date(startAt.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: { priceCents: 150000, currency: "INR" },
                bookerEmail: `client-${hour}-${tag}@example.com`,
            },
        })
    ).id;
}

beforeAll(async () => {
    const ownerId = (
        await prisma.user.create({
            data: { email: `co-owner-${tag}@example.com`, name: "Neha" },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Hill Road Salon", slug: `co-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = await contexts.resolve(ownerId, orgId);
    serviceId = (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Haircut",
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
    // Two people on the diary with no login (DEC-105).
    priyaStaffId = (await staff.create(owner, { name: "Priya" })).id;
    raviStaffId = (await staff.create(owner, { name: "Ravi" })).id;
    ids.mine = await booking(priyaStaffId, 9);
    ids.theirs = await booking(raviStaffId, 10);
});

describe("giving a diary person a login (#868)", () => {
    it("the business has Calendar only from its first diary person", async () => {
        const role = await prisma.organizationRole.findUnique({
            where: {
                organizationId_key: {
                    organizationId: orgId,
                    key: "calendar-only",
                },
            },
        });
        expect(role?.actions).toEqual([
            "org:read",
            "module:read",
            "booking:read",
            "booking:write",
            "service:read",
        ]);
    });

    it("joins as Calendar only, linked to their diary, one seat throughout", async () => {
        // The owner and two diary people with no login.
        const before = await seats();
        expect(before).toBe(3);

        const send = sendOrganizationInvitationEmail as jest.Mock;
        send.mockClear();
        const email = `co-priya-${tag}@example.com`;
        await members.invite(owner, { email, staffId: priyaStaffId });
        // The invite is Priya, already counted on the diary.
        expect(await seats()).toBe(before);

        const token = (send.mock.calls[0][1] as string).split("/join/")[1]!;
        const user = await prisma.user.create({ data: { email } });
        const joined = await members.accept({ id: user.id, email }, token);
        expect(joined.roleKey).toBe("calendar-only");

        const linked = await prisma.staffMember.findUniqueOrThrow({
            where: { id: priyaStaffId },
            select: { membership: { select: { userId: true } } },
        });
        expect(linked.membership?.userId).toBe(user.id);
        // Now a team member taking bookings: still one seat.
        expect(await seats()).toBe(before);

        priya = await contexts.resolve(user.id, orgId);
        expect(priya.roleKey).toBe("calendar-only");
    });

    it("reads only their own bookings, without money", async () => {
        const diary = await bookings.calendarBookings(priya, {
            from: "2026-11-01T00:00:00.000Z",
            to: "2026-11-08T00:00:00.000Z",
        });
        expect(diary.money).toBe(false);
        const seen = diary.diaries.flatMap((d) => d.bookings.map((b) => b.id));
        expect(seen).toEqual([ids.mine]);

        const listed = await bookings.listBookings(priya);
        expect(listed.map((b) => b.id)).toEqual([ids.mine]);

        await expect(
            bookings.getBooking(priya, ids.theirs),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            bookings.getBooking(priya, ids.mine),
        ).resolves.toMatchObject({ id: ids.mine });
    });

    it("changes their own bookings and nobody else's", async () => {
        await expect(
            bookings.cancelBooking(priya, ids.theirs),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(bookings.payLink(priya, ids.mine)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            bookings.calendarBookings(priya, {
                from: "2026-11-01T00:00:00.000Z",
                to: "2026-11-08T00:00:00.000Z",
                staffId: raviStaffId,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("sees only themselves on the diary's people", async () => {
        const list = await staff.list(priya);
        expect(list.staff.map((s) => s.id)).toEqual([priyaStaffId]);
    });
});
