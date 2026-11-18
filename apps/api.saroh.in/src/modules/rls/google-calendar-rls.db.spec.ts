import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on the Google Calendar tables (#1047, migration
 * `20270218120000_google_calendar`), over a NOBYPASSRLS role: one business
 * reads none of another's connections, chosen calendars, events or busy
 * times. And the keys the model leans on: one connection per person per
 * business, one calendar to write to per connection.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies, CHECKs or partial indexes.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithRows(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("gcal-rls") },
    });
    const organizationId = org.id;
    const user = await prisma.user.create({
        data: { email: `${uniq("gcal")}@example.com`, name: "Meera" },
    });
    const membership = await prisma.membership.create({
        data: { organizationId, userId: user.id, role: "MEMBER" },
    });
    const staff = await prisma.staffMember.create({
        data: { organizationId, membershipId: membership.id, name: "Meera" },
    });
    const service = await prisma.service.create({
        data: {
            organizationId,
            name: "Consultation",
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
        },
    });
    const startAt = new Date(Date.now() + 86_400_000);
    const booking = await prisma.booking.create({
        data: {
            organizationId,
            serviceId: service.id,
            staffId: staff.id,
            startAt,
            endAt: new Date(startAt.getTime() + 1_800_000),
            timezone: "Asia/Kolkata",
            snapshot: {},
        },
    });
    const connection = await prisma.googleCalendarConnection.create({
        data: {
            organizationId,
            membershipId: membership.id,
            googleEmail: "meera@example.com",
            scopes: [],
        },
    });
    const link = await prisma.googleCalendarLink.create({
        data: {
            organizationId,
            connectionId: connection.id,
            calendarId: "primary",
            name: "Meera",
            writeTo: true,
            checkBusy: true,
        },
    });
    const event = await prisma.googleCalendarEvent.create({
        data: {
            organizationId,
            bookingId: booking.id,
            connectionId: connection.id,
            calendarId: "primary",
            eventId: uniq("evt"),
        },
    });
    const busy = await prisma.googleCalendarBusy.create({
        data: {
            organizationId,
            connectionId: connection.id,
            staffId: staff.id,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
        },
    });
    return {
        orgId: organizationId,
        userId: user.id,
        membershipId: membership.id,
        connectionId: connection.id,
        linkId: link.id,
        eventId: event.id,
        busyId: busy.id,
    };
}

type Rows = Awaited<ReturnType<typeof businessWithRows>>;

const tables: [string, (r: Rows) => string][] = [
    ["googleCalendarConnection", (r) => r.connectionId],
    ["googleCalendarLink", (r) => r.linkId],
    ["googleCalendarEvent", (r) => r.eventId],
    ["googleCalendarBusy", (r) => r.busyId],
];

type Delegate = {
    findMany: (args: object) => Promise<{ id: string }[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
};
const delegate = (name: string) =>
    (prisma as unknown as Record<string, Delegate>)[name];

describeRls("row-level security on the Google Calendar tables", () => {
    let a: Rows;
    let b: Rows;

    beforeAll(async () => {
        a = await businessWithRows("Rye & Co.");
        b = await businessWithRows("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it.each(tables)(
        "%s: a business reads only its own row, none of another's",
        async (name, id) => {
            const seen = await runInOrgContext(a.orgId, () =>
                delegate(name).findMany({
                    where: { id: { in: [id(a), id(b)] } },
                    select: { id: true },
                }),
            );
            expect(seen).toEqual([{ id: id(a) }]);
            const deleted = await runInOrgContext(a.orgId, () =>
                delegate(name).deleteMany({ where: { id: id(b) } }),
            );
            expect(deleted.count).toBe(0);
        },
    );

    it("can't write a connection into another business", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.googleCalendarLink.create({
                    data: {
                        organizationId: b.orgId,
                        connectionId: b.connectionId,
                        calendarId: "sneaky",
                        name: "Sneaky",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });

    it("refuses a second calendar to write to on one connection", async () => {
        await expect(
            prisma.googleCalendarLink.create({
                data: {
                    organizationId: a.orgId,
                    connectionId: a.connectionId,
                    calendarId: "work",
                    name: "Work",
                    writeTo: true,
                },
            }),
        ).rejects.toThrow(/Unique constraint/);
        // A second calendar only checked for busy times is fine.
        await expect(
            prisma.googleCalendarLink.create({
                data: {
                    organizationId: a.orgId,
                    connectionId: a.connectionId,
                    calendarId: "family",
                    name: "Family",
                    checkBusy: true,
                },
            }),
        ).resolves.toMatchObject({ calendarId: "family" });
    });

    it("refuses a second connection for one person in one business, not in another", async () => {
        await expect(
            prisma.googleCalendarConnection.create({
                data: {
                    organizationId: a.orgId,
                    membershipId: a.membershipId,
                    googleEmail: "again@example.com",
                },
            }),
        ).rejects.toThrow(/Unique constraint/);
        // The same person in Pulse: their own membership there, their own row.
        const there = await prisma.membership.create({
            data: { organizationId: b.orgId, userId: a.userId },
        });
        await expect(
            prisma.googleCalendarConnection.create({
                data: {
                    organizationId: b.orgId,
                    membershipId: there.id,
                    googleEmail: "meera@example.com",
                },
            }),
        ).resolves.toMatchObject({ organizationId: b.orgId });
    });

    it("refuses a status the code never writes", async () => {
        await expect(
            prisma.googleCalendarConnection.update({
                where: { id: a.connectionId },
                data: { status: "BROKEN" },
            }),
        ).rejects.toThrow(/check constraint/);
    });
});
