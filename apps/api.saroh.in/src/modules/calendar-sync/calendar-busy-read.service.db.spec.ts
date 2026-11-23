/**
 * The Bookings calendar's read of Google busy times (BKVGoogle) against a
 * real Postgres: only this business's, only start and end (never a title or
 * an address), everyone's for a Member, nothing for a role that can't read
 * bookings, and nothing while Google Calendar is off. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { CalendarBusyReadService } from "./calendar-busy-read.service";
import { SCOPES } from "./google/google-calendar.port";
import { sealToken, tokenColumns } from "./sealing";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const service = new CalendarBusyReadService();

beforeAll(async () => {
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
    await prisma.featureFlag.upsert({
        where: { key: "GOOGLE_CALENDAR" },
        create: { key: "GOOGLE_CALENDAR", enabledByDefault: false },
        update: {},
    });
});
afterAll(async () => {
    mutableEnv.CALENDAR_ENC_KEY = before;
    await prisma.$disconnect();
});

const day = (n: number, hour = 0) =>
    new Date(Date.UTC(2030, 0, 1 + n, hour, 0, 0));

/** A business with Kabir connected and busy 10 to 11 on day 1. */
async function business(
    opts: { on?: boolean; status?: "CONNECTED" | "LAPSED" } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: uniq("gcal-busyread") },
    });
    const organizationId = org.id;
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "GOOGLE_CALENDAR",
            organizationId,
            enabled: opts.on ?? true,
        },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("k")}@example.com`, name: "Kabir" },
    });
    const membership = await prisma.membership.create({
        data: { organizationId, userId: user.id, role: "MEMBER" },
    });
    const staff = await prisma.staffMember.create({
        data: { organizationId, membershipId: membership.id, name: "Kabir" },
    });
    const connection = await prisma.googleCalendarConnection.create({
        data: {
            organizationId,
            membershipId: membership.id,
            googleEmail: "kabir@example.com",
            scopes: Object.values(SCOPES),
            status: opts.status ?? "CONNECTED",
        },
    });
    await prisma.googleCalendarConnection.update({
        where: { id: connection.id },
        data: tokenColumns(
            sealToken("refresh-token", {
                organizationId,
                connectionId: connection.id,
            }),
        ),
    });
    await prisma.googleCalendarBusy.create({
        data: {
            organizationId,
            connectionId: connection.id,
            staffId: staff.id,
            startAt: day(1, 10),
            endAt: day(1, 11),
        },
    });
    const ctx = (
        role: "OWNER" | "MEMBER" | "REVIEWER",
    ): OrganizationContext => ({
        organizationId,
        userId: user.id,
        role,
        edition: "INDIA",
    });
    return { organizationId, staffId: staff.id, ctx };
}

const week = [day(0).toISOString(), day(7).toISOString()] as const;

describe("GET calendar/google/busy", () => {
    it("returns each person's busy times as start and end, and nothing else", async () => {
        const { ctx, staffId } = await business();
        const read = await service.busy(ctx("MEMBER"), ...week);
        expect(read.busy).toEqual([
            {
                staffId,
                startAt: day(1, 10).toISOString(),
                endAt: day(1, 11).toISOString(),
            },
        ]);
        // No title, address or calendar ever rides along.
        expect(Object.keys(read.busy[0] ?? {}).sort()).toEqual([
            "endAt",
            "staffId",
            "startAt",
        ]);
        expect(JSON.stringify(read)).not.toContain("kabir@example.com");
        expect(read.on).toBe(true);
        expect(read.people).toEqual([{ staffId, state: "CONNECTED" }]);
    });

    it("never reads another business's busy times", async () => {
        const mine = await business();
        const theirs = await business();
        const read = await service.busy(mine.ctx("OWNER"), ...week);
        expect(read.busy.map((b) => b.staffId)).toEqual([mine.staffId]);
        expect(read.busy.map((b) => b.staffId)).not.toContain(theirs.staffId);
        expect(read.people.map((p) => p.staffId)).toEqual([mine.staffId]);
    });

    it("keeps to the days asked for", async () => {
        const { ctx } = await business();
        const later = await service.busy(
            ctx("OWNER"),
            day(2).toISOString(),
            day(3).toISOString(),
        );
        expect(later.busy).toEqual([]);
    });

    it("refuses a role that can't read bookings", async () => {
        const { ctx } = await business();
        await expect(
            service.busy(ctx("REVIEWER"), ...week),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("returns nothing while Google Calendar is off for the business", async () => {
        const { ctx } = await business({ on: false });
        await expect(service.busy(ctx("OWNER"), ...week)).resolves.toEqual({
            on: false,
            busy: [],
            people: [],
        });
    });

    it("says a lapsed account needs a look, and draws none of its times", async () => {
        const { ctx, staffId } = await business({ status: "LAPSED" });
        const read = await service.busy(ctx("OWNER"), ...week);
        expect(read.busy).toEqual([]);
        expect(read.people).toEqual([{ staffId, state: "LAPSED" }]);
    });
});
