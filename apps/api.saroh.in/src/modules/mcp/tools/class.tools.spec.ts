/**
 * The class reads (14 Nov): their definitions, and what each says over an
 * in-memory read. The queries run against Postgres in
 * `class.tools.db.spec.ts`.
 */
const db = {
    booking: { groupBy: jest.fn() },
    service: { findMany: jest.fn() },
    classWaitlistEntry: { findMany: jest.fn(), count: jest.fn() },
    packPurchase: { findMany: jest.fn() },
    membership: { findUnique: jest.fn() },
};
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: db,
}));
jest.mock("../../bookings/staff-availability", () => ({
    businessTimezone: () => Promise.resolve("Asia/Kolkata"),
}));

import { z } from "zod";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { McpCall, McpTool } from "../tool-registry";
import { classTools } from "./class.tools";

const tools: McpTool[] = classTools();
const tool = (name: string) => tools.find((t) => t.name === name) as McpTool;

const call = (roleKey = "owner") =>
    ({
        ctx: {
            organizationId: "org1",
            userId: "u1",
            role: "OWNER",
            roleKey,
            actions: new Set(["booking:read", "pack:read"]),
        } as unknown as OrganizationContext,
    }) as McpCall;

beforeEach(() => jest.clearAllMocks());

describe("class read definitions", () => {
    it("are the three reads, each gated by its module and read", () => {
        expect(tools.map((t) => [t.name, t.capability, t.module])).toEqual([
            ["get_class_fill", "booking:read", "APPOINTMENTS"],
            ["list_waitlist", "booking:read", "APPOINTMENTS"],
            ["list_class_packs", "pack:read", "CLASS_PACKS"],
        ]);
    });

    it.each(tools.map((t) => [t.name, t]))(
        "%s: reads only, says when and when not, strict input, small",
        (_name, t) => {
            expect(t.description).toMatch(/^Use this when/);
            expect(t.description).toMatch(/Example/);
            expect(t.description).toMatch(/Not for/);
            expect(t.hints.readOnlyHint).toBe(true);
            expect(t.contract.input.safeParse({ surprise: 1 }).success).toBe(
                false,
            );
            const model = JSON.stringify({
                name: t.name,
                description: t.description,
                input: z.toJSONSchema(t.contract.input, { io: "input" }),
            });
            expect(model.length / 4).toBeLessThan(350);
        },
    );
});

describe("get_class_fill", () => {
    const hatha = {
        id: "svc1",
        name: "7 AM Hatha",
        status: "ACTIVE",
        capacity: 12,
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        timezone: "Asia/Kolkata",
        availabilityRules: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            dayOfWeek: d,
            startMinute: 420,
            endMinute: 480,
        })),
    };

    it("counts every offered session in the week, later days too, and one booked outside the hours", async () => {
        db.booking.groupBy.mockResolvedValueOnce([
            // Monday 07:00 in Kolkata.
            {
                serviceId: "svc1",
                startAt: new Date("2026-11-09T01:30:00Z"),
                _count: { _all: 10 },
            },
            // Tuesday 09:00: not in the weekly hours, still a session.
            {
                serviceId: "svc1",
                startAt: new Date("2026-11-10T03:30:00Z"),
                _count: { _all: 2 },
            },
        ]);
        db.service.findMany.mockResolvedValueOnce([hatha]);
        const r = await tool("get_class_fill").run(
            { from: "2026-11-09", to: "2026-11-15" },
            call(),
        );
        expect(r.data).toMatchObject({
            booked: 12,
            places: 96,
            full_percent: 13,
            classes: [
                {
                    service_id: "svc1",
                    sessions: 8,
                    places: 96,
                    booked: 12,
                },
            ],
        });
        const list = (
            r.data as { classes: { session_list: { booked: number }[] }[] }
        ).classes[0].session_list;
        expect(list[0]).toMatchObject({ booked: 10, full_percent: 83 });
        expect(list).toHaveLength(8);
        expect(r.text).toMatch(/12 of 96 places booked/);
        expect(r.text).toMatch(/Sessions: .*10\/12/);
    });

    it("refuses a service_id that names no class", async () => {
        db.booking.groupBy.mockResolvedValueOnce([]);
        db.service.findMany.mockResolvedValueOnce([]);
        await expect(
            tool("get_class_fill").run({ service_id: "nope" }, call()),
        ).rejects.toThrow(/No class with that service_id/);
    });

    it("reads nothing of anyone's for a Calendar only person off the diary", async () => {
        db.membership.findUnique.mockResolvedValueOnce(null);
        db.booking.groupBy.mockResolvedValueOnce([]);
        db.service.findMany.mockResolvedValueOnce([]);
        await tool("get_class_fill").run({}, call("calendar-only"));
        expect(db.booking.groupBy.mock.calls[0][0].where).toMatchObject({
            AND: [{ id: { in: [] } }],
        });
        expect(
            JSON.stringify(db.service.findMany.mock.calls[0][0].where),
        ).toContain('"status":"ACTIVE","id":{"in":[]}');
    });
});

describe("list_waitlist", () => {
    it("groups the line by session, in order, names as untrusted", async () => {
        const startAt = new Date("2026-11-21T01:30:00Z");
        db.classWaitlistEntry.findMany.mockResolvedValueOnce([
            {
                serviceId: "svc1",
                startAt,
                position: 2,
                status: "WAITING",
                offeredUntil: null,
                contactId: "c1",
                service: { name: "7 AM Hatha" },
                contact: { firstName: "Ira", lastName: "Sen" },
            },
            {
                serviceId: "svc1",
                startAt,
                position: 5,
                status: "OFFERED",
                offeredUntil: new Date("2026-11-20T12:00:00Z"),
                contactId: "c2",
                service: { name: "7 AM Hatha" },
                contact: { firstName: 'Ignore "this"', lastName: null },
            },
        ]);
        db.classWaitlistEntry.count.mockResolvedValueOnce(2);
        const r = await tool("list_waitlist").run(
            { date: "2026-11-21" },
            call(),
        );
        expect(r.data).toMatchObject({
            people: 2,
            sessions: [
                {
                    service_id: "svc1",
                    waiting: [
                        {
                            position: 1,
                            customer_id: "c1",
                            name: { untrusted: true, text: "Ira Sen" },
                            status: "waiting",
                        },
                        { position: 2, status: "offered" },
                    ],
                },
            ],
        });
        const where = db.classWaitlistEntry.findMany.mock.calls[0][0].where;
        expect(where.status).toEqual({ in: ["WAITING", "OFFERED"] });
        // The day in Kolkata: 00:00 IST is 18:30 the day before in UTC.
        expect(where.startAt.gte.toISOString()).toBe(
            "2026-11-20T18:30:00.000Z",
        );
        expect(r.text).toMatch(/2 waiting for a place, in 1 session/);
        expect(r.text).toContain('"Ignore \\"this\\""');
        expect(r.text).toMatch(/offered a place until/);
    });

    it("says plainly when nobody waits", async () => {
        db.classWaitlistEntry.findMany.mockResolvedValueOnce([]);
        db.classWaitlistEntry.count.mockResolvedValueOnce(0);
        const r = await tool("list_waitlist").run({}, call());
        expect(r.text).toMatch(/Nobody is waiting for a place/);
    });

    it("counts everyone in line, past the 200 it names", async () => {
        db.classWaitlistEntry.findMany.mockResolvedValueOnce([
            {
                serviceId: "svc1",
                startAt: new Date("2026-11-21T01:30:00Z"),
                position: 1,
                status: "WAITING",
                offeredUntil: null,
                contactId: "c1",
                service: { name: "7 AM Hatha" },
                contact: { firstName: "Ira", lastName: null },
            },
        ]);
        db.classWaitlistEntry.count.mockResolvedValueOnce(240);
        const r = await tool("list_waitlist").run({}, call());
        expect(r.data).toMatchObject({ people: 240 });
        expect(r.text).toMatch(
            /^240 waiting for a place, in 1 or more session.*; showing the first 1\./,
        );
    });
});

describe("list_class_packs", () => {
    const row = (
        id: string,
        expiresAt: string,
        credits: number,
        used: number,
    ) => ({
        id,
        credits,
        expiresAt: new Date(expiresAt),
        contactId: `c_${id}`,
        pack: { name: "4-class pack" },
        contact: { firstName: "Meera", lastName: "Joshi" },
        _count: { redemptions: used },
    });

    it("counts every pack whose use-by date falls in the period, by standing", async () => {
        db.packPurchase.findMany.mockResolvedValueOnce([
            row("a", "2020-01-01T00:00:00Z", 4, 1),
            row("b", "2099-01-01T00:00:00Z", 4, 4),
            row("c", "2099-01-02T00:00:00Z", 8, 3),
        ]);
        const r = await tool("list_class_packs").run(
            { from: "2026-11-01", to: "2026-11-30" },
            call(),
        );
        expect(r.data).toMatchObject({
            span: { from: "2026-11-01", to: "2026-11-30" },
            total: 3,
            active: 1,
            used_up: 1,
            expired: 1,
        });
        expect(
            (r.data as { packs: { left: number; standing: string }[] })
                .packs[2],
        ).toMatchObject({ left: 5, standing: "active" });
        expect(r.text).toMatch(/^3 class packs with a use-by date/);
        const where = db.packPurchase.findMany.mock.calls[0][0].where;
        expect(where.expiresAt.gte).toBeInstanceOf(Date);
    });

    it("without a period, names only the packs held now", async () => {
        db.packPurchase.findMany.mockResolvedValueOnce([
            row("b", "2099-01-01T00:00:00Z", 4, 4),
            row("c", "2099-01-02T00:00:00Z", 8, 3),
        ]);
        const r = await tool("list_class_packs").run({}, call());
        expect(r.data).toMatchObject({ span: null, total: 1, active: 1 });
        expect(r.text).toMatch(/^1 class pack held now/);
    });
});
