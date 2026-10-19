/**
 * Each person's own booking rules and the business's approval switch
 * (DEC-170, #1038) against a real Postgres:
 *
 * - a Member's own rule with approval off applies at once, and the booking
 *   page's free times follow it;
 * - with approval on it waits — the free times don't change — until an
 *   owner or admin approves it; turned down (with a reason) or withdrawn,
 *   nothing changes; a new ask replaces the one waiting;
 * - a Member can't change someone else's or the business's rules, and a
 *   Reviewer and Calendar only change nobody's;
 * - the business's gap between bookings, and a person's own, keep the time
 *   either side of a booking clear, by hand and on the booking page;
 * - a person's own cancelling rule fixes a booking's free-cancel deadline;
 * - the switch is on for a business with no rules row, and the column's
 *   default puts it on for every existing row;
 * - owners and admins are told of a request, and every change and move is
 *   in the business's history.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import {
    CALENDAR_ONLY_ACTIONS,
    CALENDAR_ONLY_ROLE_KEY,
} from "../organizations/calendar-only-role";
import { resolveCapabilities } from "../organizations/organization-policy";
import { StaffRulesService } from "./staff-rules.service";
import { StaffService } from "./staff.service";

const tag = `${process.pid}-${Date.now()}`;
const staff = new StaffService();
const rules = new StaffRulesService();
const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

const DAY = 86_400_000;
const HOUR = 3_600_000;

let orgId = "";
let owner: OrganizationContext;
let admin: OrganizationContext;
let arjunCtx: OrganizationContext;
let meeraCtx: OrganizationContext;
let reviewer: OrganizationContext;
let calendarOnly: OrganizationContext;
let ptId = "";
let arjun = "";
let meera = "";
let kiran = "";
let contactId = "";

/** Midnight UTC, `days` from today: the day the free times are read for. */
const DAY0 = (() => {
    const d = new Date(Date.now() + 3 * DAY);
    d.setUTCHours(0, 0, 0, 0);
    return d;
})();

function at(hour: number, minute = 0): Date {
    return new Date(DAY0.getTime() + hour * HOUR + minute * 60_000);
}

async function user(name: string) {
    return prisma.user.create({
        data: { email: `rules-${name}-${tag}@example.com`, name },
    });
}

/** Someone on the diary, with a login in `role`, working 06:00–18:00. */
async function onDiary(
    name: string,
    role: string,
): Promise<{ staffId: string; userId: string }> {
    const u = await user(name);
    const membership = await prisma.membership.create({
        data: { organizationId: orgId, userId: u.id, role },
    });
    const person = await prisma.staffMember.create({
        data: {
            organizationId: orgId,
            name,
            membershipId: membership.id,
            services: { create: { organizationId: orgId, serviceId: ptId } },
            hours: {
                create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                    organizationId: orgId,
                    dayOfWeek,
                    startMinute: 6 * 60,
                    endMinute: 18 * 60,
                })),
            },
        },
    });
    return { staffId: person.id, userId: u.id };
}

/** The booking page's free starts on DAY0, read at its midnight: who, at what time. */
async function pageStarts(): Promise<Record<string, string[]>> {
    const slots = await publicBookings.publicAvailability(
        ptId,
        DAY0.toISOString(),
        new Date(DAY0.getTime() + DAY).toISOString(),
        undefined,
        DAY0,
    );
    const out: Record<string, string[]> = { arjun: [], meera: [] };
    for (const slot of slots) {
        const time = slot.startAt.toISOString().slice(11, 16);
        if (slot.staffIds?.includes(arjun)) out.arjun!.push(time);
        if (slot.staffIds?.includes(meera)) out.meera!.push(time);
    }
    return out;
}

/** Every half hour from `from` to `to`, inclusive, as "HH:MM". */
function halfHours(from: number, to: number): string[] {
    const out: string[] = [];
    for (let m = from * 60; m <= to * 60; m += 30) {
        out.push(
            `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
        );
    }
    return out;
}

async function setSwitch(on: boolean) {
    await staff.updateBookingRules(owner, {
        memberRuleChangesNeedApproval: on,
    });
}

async function history(action: string) {
    return prisma.auditEvent.findMany({
        where: { organizationId: orgId, action },
        orderBy: { createdAt: "asc" },
    });
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kaya Physio", slug: `kaya-rules-${tag}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "UTC" },
    });
    await giveBusinessDetails(orgId);
    // The booking page is the business's live site.
    const site = await prisma.site.create({
        data: { organizationId: orgId, name: "Kaya", slug: `kaya-${tag}` },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: orgId,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    ptId = (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                siteId: site.id,
                name: "Physio session",
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;

    const ownerUser = await user("Owner");
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerUser.id, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerUser.id, role: "OWNER" };
    const adminUser = await user("Admin");
    await prisma.membership.create({
        data: { organizationId: orgId, userId: adminUser.id, role: "ADMIN" },
    });
    admin = { organizationId: orgId, userId: adminUser.id, role: "ADMIN" };

    const a = await onDiary("Arjun", "MEMBER");
    arjun = a.staffId;
    arjunCtx = { organizationId: orgId, userId: a.userId, role: "MEMBER" };
    const m = await onDiary("Meera", "MEMBER");
    meera = m.staffId;
    meeraCtx = { organizationId: orgId, userId: m.userId, role: "MEMBER" };
    const k = await onDiary("Kiran", CALENDAR_ONLY_ROLE_KEY);
    kiran = k.staffId;
    calendarOnly = {
        organizationId: orgId,
        userId: k.userId,
        role: "MEMBER",
        roleKey: CALENDAR_ONLY_ROLE_KEY,
        actions: resolveCapabilities(
            CALENDAR_ONLY_ROLE_KEY,
            CALENDAR_ONLY_ACTIONS,
        ),
    };
    const reviewerUser = await user("Reviewer");
    await prisma.membership.create({
        data: {
            organizationId: orgId,
            userId: reviewerUser.id,
            role: "REVIEWER",
        },
    });
    reviewer = {
        organizationId: orgId,
        userId: reviewerUser.id,
        role: "REVIEWER",
    };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `rules-asha-${tag}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
});

afterEach(async () => {
    await prisma.booking.deleteMany({ where: { organizationId: orgId } });
    await prisma.staffRuleRequest.deleteMany({
        where: { organizationId: orgId },
    });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.bookingRules.deleteMany({ where: { organizationId: orgId } });
    await prisma.staffMember.updateMany({
        where: { organizationId: orgId },
        data: {
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: null,
            gapMinutes: null,
        },
    });
});

describe("the approval switch", () => {
    it("is on, with no gap, for a business that never set its rules", async () => {
        await expect(staff.getBookingRules(owner)).resolves.toMatchObject({
            memberRuleChangesNeedApproval: true,
            gapMinutes: 0,
        });
    });

    it("is on for a rules row saved before it existed (the column's default)", async () => {
        // A row as an existing business has it: written without the switch.
        await prisma.$executeRaw`INSERT INTO "BookingRules" ("id", "organizationId", "bookAheadDays", "updatedAt") VALUES (${`br-${tag}`}, ${orgId}, 14, NOW())`;
        await expect(staff.getBookingRules(owner)).resolves.toMatchObject({
            bookAheadDays: 14,
            memberRuleChangesNeedApproval: true,
            gapMinutes: 0,
        });
        const [column] = await prisma.$queryRaw<
            { column_default: string | null }[]
        >`SELECT column_default FROM information_schema.columns WHERE table_name = 'BookingRules' AND column_name = 'memberRuleChangesNeedApproval'`;
        expect(column?.column_default).toBe("true");
    });

    it("is the owner's or an admin's to turn off, and lands in the history", async () => {
        await expect(
            staff.updateBookingRules(arjunCtx, {
                memberRuleChangesNeedApproval: false,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            staff.updateBookingRules(admin, {
                memberRuleChangesNeedApproval: false,
                gapMinutes: 15,
            }),
        ).resolves.toMatchObject({
            memberRuleChangesNeedApproval: false,
            gapMinutes: 15,
        });
        const [row] = await history("booking-rules.update");
        expect(row?.metadata).toMatchObject({
            changes: [
                { field: "gapMinutes", before: 0, after: 15 },
                {
                    field: "memberRuleChangesNeedApproval",
                    before: true,
                    after: false,
                },
            ],
        });
    });
});

describe("a Member's own rules", () => {
    it("with approval off apply at once, and the booking page follows", async () => {
        await setSwitch(false);
        const before = await pageStarts();
        expect(before.arjun).toEqual(halfHours(6, 17));

        const saved = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 12 * 60,
        });
        expect(saved.applied).toBe(true);
        expect(saved.previous.latestBookingMinutes).toBeNull();
        expect(saved.rules.own.latestBookingMinutes).toBe(720);
        expect(saved.rules.effective.latestBookingMinutes).toBe(720);
        expect(saved.rules.request).toBeNull();

        // Twelve hours' notice from midnight: Arjun from noon, Meera as before.
        const after = await pageStarts();
        expect(after.arjun).toEqual(halfHours(12, 17));
        expect(after.meera).toEqual(halfHours(6, 17));

        // Undo: the same save with what was there before.
        await rules.update(arjunCtx, arjun, saved.previous);
        expect((await pageStarts()).arjun).toEqual(halfHours(6, 17));

        const changes = await history("staff.booking-rules.update");
        expect(changes.map((r) => r.metadata)).toEqual([
            expect.objectContaining({
                staff: "Arjun",
                via: "direct",
                fields: ["latestBookingMinutes"],
            }),
            expect.objectContaining({ staff: "Arjun", via: "direct" }),
        ]);
        expect(
            await prisma.staffRuleRequest.count({ where: { staffId: arjun } }),
        ).toBe(0);
    });

    it("with approval on wait, change nothing, and tell owners and admins", async () => {
        const saved = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 12 * 60,
            gapMinutes: 15,
        });
        expect(saved.applied).toBe(false);
        expect(saved.rules.own).toMatchObject({
            latestBookingMinutes: null,
            gapMinutes: null,
        });
        expect(saved.rules.needsApproval).toBe(true);
        expect(saved.rules.request).toMatchObject({
            status: "WAITING",
            staffName: "Arjun",
            changes: { latestBookingMinutes: 720, gapMinutes: 15 },
            words: [
                "Booking late: up to 12 hours before the start",
                "15 min between bookings",
            ],
            requestedBy: { userId: arjunCtx.userId, name: "Arjun" },
        });
        // The booking page is as it was.
        expect((await pageStarts()).arjun).toEqual(halfHours(6, 17));

        const [notice] = await prisma.notification.findMany({
            where: { organizationId: orgId },
        });
        expect(notice).toMatchObject({
            type: "hours.rule-request",
            userId: null,
            title: "Arjun asked to change their booking rules",
        });
        expect(
            (await history("staff.booking-rules.requested"))[0]?.metadata,
        ).toMatchObject({
            staff: "Arjun",
            asked: { latestBookingMinutes: 720 },
        });

        // Owners and admins see it waiting; Meera sees none of hers.
        await expect(rules.waiting(admin)).resolves.toHaveLength(1);
        await expect(rules.waiting(meeraCtx)).resolves.toEqual([]);
        await expect(rules.waiting(arjunCtx)).resolves.toHaveLength(1);
    });

    it("applies once an admin approves, and the booking page follows", async () => {
        const saved = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 12 * 60,
        });
        const id = saved.rules.request!.id;
        // A Member can't approve, not even their own.
        await expect(rules.approve(arjunCtx, id)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        const approved = await rules.approve(admin, id);
        expect(approved).toMatchObject({
            status: "APPROVED",
            decidedBy: { userId: admin.userId, name: "Admin" },
        });
        expect((await pageStarts()).arjun).toEqual(halfHours(12, 17));

        // Arjun sees the outcome until he says OK.
        const seen = await rules.read(arjunCtx, arjun);
        expect(seen.own.latestBookingMinutes).toBe(720);
        expect(seen.request?.status).toBe("APPROVED");
        await rules.dismiss(arjunCtx, id);
        expect((await rules.read(arjunCtx, arjun)).request).toBeNull();

        // Decided once.
        await expect(rules.turnDown(owner, id)).rejects.toMatchObject({
            response: expect.objectContaining({
                message: "This request was already approved.",
            }),
        });
        expect(
            (await history("staff.booking-rules.update"))[0]?.metadata,
        ).toMatchObject({ via: "approved", requestId: id });
        await expect(
            history("staff.booking-rules.approved"),
        ).resolves.toHaveLength(1);
    });

    it("is turned down with a reason, and nothing changes", async () => {
        const saved = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 12 * 60,
        });
        const id = saved.rules.request!.id;
        const down = await rules.turnDown(
            owner,
            id,
            "  We need same-day bookings in the Diwali weeks.  ",
        );
        expect(down).toMatchObject({
            status: "TURNED_DOWN",
            reason: "We need same-day bookings in the Diwali weeks.",
        });
        const seen = await rules.read(arjunCtx, arjun);
        expect(seen.own.latestBookingMinutes).toBeNull();
        expect(seen.request).toMatchObject({
            status: "TURNED_DOWN",
            reason: "We need same-day bookings in the Diwali weeks.",
        });
        expect((await pageStarts()).arjun).toEqual(halfHours(6, 17));
        expect(
            (await history("staff.booking-rules.turned-down"))[0]?.metadata,
        ).toMatchObject({
            reason: "We need same-day bookings in the Diwali weeks.",
        });

        // Turned down with no words: none stored.
        const again = await rules.update(arjunCtx, arjun, {
            gapMinutes: 10,
        });
        await expect(
            rules.turnDown(admin, again.rules.request!.id, "   "),
        ).resolves.toMatchObject({ reason: null });
    });

    it("can be withdrawn by the person who asked, and nobody else", async () => {
        const saved = await rules.update(arjunCtx, arjun, {
            bookAheadDays: 7,
        });
        const id = saved.rules.request!.id;
        await expect(rules.withdraw(meeraCtx, id)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(rules.withdraw(owner, id)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(rules.withdraw(arjunCtx, id)).resolves.toMatchObject({
            status: "WITHDRAWN",
        });
        expect((await rules.read(arjunCtx, arjun)).request).toBeNull();
        await expect(rules.approve(owner, id)).rejects.toMatchObject({
            response: expect.objectContaining({
                message: "This request was already withdrawn.",
            }),
        });
        await expect(
            history("staff.booking-rules.withdrawn"),
        ).resolves.toHaveLength(1);
    });

    it("asked again replaces the request waiting", async () => {
        const first = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 12 * 60,
        });
        const second = await rules.update(arjunCtx, arjun, {
            latestBookingMinutes: 24 * 60,
        });
        expect(second.rules.request?.id).not.toBe(first.rules.request!.id);
        const rows = await prisma.staffRuleRequest.findMany({
            where: { staffId: arjun },
            orderBy: { createdAt: "asc" },
        });
        expect(rows.map((r) => r.status)).toEqual(["WITHDRAWN", "WAITING"]);
        expect(
            (await history("staff.booking-rules.withdrawn"))[0]?.metadata,
        ).toMatchObject({ replaced: true });
    });
});

describe("whose rules who changes", () => {
    it("refuses a Member someone else's rules, with the switch on or off", async () => {
        for (const on of [true, false]) {
            await setSwitch(on);
            await expect(
                rules.update(arjunCtx, meera, { latestBookingMinutes: 60 }),
            ).rejects.toThrow(/only your own booking rules/);
        }
        expect((await rules.read(arjunCtx, meera)).canChange).toBe(false);
    });

    it("refuses a Member the business-wide rules", async () => {
        await expect(
            staff.updateBookingRules(arjunCtx, { gapMinutes: 30 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets owners and admins change anyone's at once, switch or not", async () => {
        const saved = await rules.update(admin, meera, {
            bookAheadDays: 7,
            freeCancelHours: 0,
        });
        expect(saved.applied).toBe(true);
        expect(saved.rules.needsApproval).toBe(false);
        expect(saved.rules.own).toMatchObject({
            bookAheadDays: 7,
            freeCancelHours: 0,
        });
        await expect(
            rules.update(owner, meera, { bookAheadDays: null }),
        ).resolves.toMatchObject({ applied: true });
    });

    it("refuses a Reviewer and Calendar only", async () => {
        for (const who of [reviewer, calendarOnly]) {
            await expect(
                rules.update(who, kiran, { gapMinutes: 10 }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                staff.updateBookingRules(who, { gapMinutes: 10 }),
            ).rejects.toBeInstanceOf(ForbiddenException);
        }
        // A Reviewer reads none; Calendar only reads its own, nobody else's.
        await expect(rules.read(reviewer, arjun)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(rules.read(calendarOnly, kiran)).resolves.toMatchObject({
            canChange: false,
        });
        await expect(rules.read(calendarOnly, arjun)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("keeps one business's people and requests from another", async () => {
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `elsewhere-rules-${tag}` },
        });
        const outsider: OrganizationContext = {
            organizationId: other.id,
            userId: owner.userId,
            role: "OWNER",
        };
        await expect(rules.read(outsider, arjun)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const saved = await rules.update(arjunCtx, arjun, { gapMinutes: 10 });
        await expect(
            rules.approve(outsider, saved.rules.request!.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("the gap between bookings", () => {
    it("keeps the business's gap clear either side of a booking, by hand and on the page", async () => {
        await staff.updateBookingRules(owner, { gapMinutes: 30 });
        await bookings.bookByHand(owner, ptId, {
            startAt: at(10).toISOString(),
            contactId,
            staffId: arjun,
        });
        // 09:00 would end as 10:00 starts; 11:00 would start as it ends.
        const page = await pageStarts();
        expect(page.arjun).toEqual([
            ...halfHours(6, 8.5),
            ...halfHours(11.5, 17),
        ]);
        expect(page.meera).toEqual(halfHours(6, 17));
        await expect(
            bookings.bookByHand(owner, ptId, {
                startAt: at(11).toISOString(),
                contactId,
                staffId: arjun,
            }),
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                message:
                    "Arjun needs 30 min between bookings. Pick another time.",
            }),
        });
        // Half an hour clear is enough.
        await expect(
            bookings.bookByHand(owner, ptId, {
                startAt: at(11, 30).toISOString(),
                contactId,
                staffId: arjun,
            }),
        ).resolves.toMatchObject({ staffId: arjun });
    });

    it("lets a person keep their own gap, over the business's none", async () => {
        await rules.update(owner, arjun, { gapMinutes: 60 });
        await bookings.bookByHand(owner, ptId, {
            startAt: at(10).toISOString(),
            contactId,
            staffId: arjun,
        });
        const page = await pageStarts();
        expect(page.arjun).toEqual([...halfHours(6, 8), ...halfHours(12, 17)]);
        // Meera keeps back-to-back bookings.
        await bookings.bookByHand(owner, ptId, {
            startAt: at(10).toISOString(),
            contactId,
            staffId: meera,
        });
        await expect(
            bookings.bookByHand(owner, ptId, {
                startAt: at(11).toISOString(),
                contactId,
                staffId: meera,
            }),
        ).resolves.toMatchObject({ staffId: meera });
    });
});

describe("a person's own cancelling rule", () => {
    it("fixes a booking's free-cancel deadline from theirs, else the business's", async () => {
        await staff.updateBookingRules(owner, { freeCancelHours: 24 });
        await rules.update(owner, arjun, { freeCancelHours: 2 });
        const withArjun = await bookings.bookByHand(owner, ptId, {
            startAt: at(10).toISOString(),
            contactId,
            staffId: arjun,
        });
        const withMeera = await bookings.bookByHand(owner, ptId, {
            startAt: at(10).toISOString(),
            contactId,
            staffId: meera,
        });
        const [a, m] = await Promise.all([
            prisma.booking.findUniqueOrThrow({ where: { id: withArjun.id } }),
            prisma.booking.findUniqueOrThrow({ where: { id: withMeera.id } }),
        ]);
        expect(a.freeCancelUntil?.toISOString()).toBe(at(8).toISOString());
        expect(m.freeCancelUntil?.toISOString()).toBe(
            new Date(at(10).getTime() - 24 * HOUR).toISOString(),
        );
    });
});

describe("the people list", () => {
    it("carries each person's own rules", async () => {
        await rules.update(owner, arjun, { gapMinutes: 15 });
        const list = await staff.list(owner);
        expect(list.staff.find((p) => p.id === arjun)?.rules).toEqual({
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: null,
            gapMinutes: 15,
        });
    });
});
