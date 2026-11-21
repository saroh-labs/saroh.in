const allowed = jest.fn<Promise<Set<string> | null>, [string]>();
jest.mock("../bookings/google-busy-gate", () => ({
    googleBusyCounted: (organizationId: string) => allowed(organizationId),
}));

import type { Prisma } from "@saroh/database";

import { staffSlots } from "../bookings/availability";
import {
    GOOGLE_BUSY_FRESH_MS,
    loadPeople,
} from "../bookings/staff-availability";

/**
 * Busy times read from Google block slots (#1047, U6): `loadPeople`, which
 * every slot reader goes through, adds the fresh ones to the person's time
 * off, so the slot goes and the person's gap isn't kept around it.
 */

const iso = (s: string) => new Date(s);
// 2026-07-20 is a Monday.
const from = iso("2026-07-20T00:00:00Z");
const to = iso("2026-07-21T00:00:00Z");
const service = {
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    timezone: "UTC",
};

interface Block {
    staffId: string;
    startAt: Date;
    endAt: Date;
    /** Which connection read it; Asha's unless said. */
    connectionId?: string;
}

function db(google: Block[]) {
    const empty = () => jest.fn().mockResolvedValue([]);
    const googleBusy = jest.fn().mockResolvedValue(
        google.map(({ connectionId, ...b }) => ({
            ...b,
            connectionId: connectionId ?? "gc_asha",
        })),
    );
    return {
        client: {
            staffHours: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        staffId: "asha",
                        dayOfWeek: 1,
                        startMinute: 6 * 60,
                        endMinute: 12 * 60,
                    },
                ]),
            },
            staffExtraHours: { findMany: empty() },
            staffTimeOff: { findMany: empty() },
            booking: { findMany: empty() },
            businessClosure: { findMany: empty() },
            bookingRules: {
                findUnique: jest.fn().mockResolvedValue({ gapMinutes: 30 }),
            },
            staffMember: { findMany: empty() },
            googleCalendarBusy: { findMany: googleBusy },
        } as unknown as Parameters<typeof loadPeople>[0] &
            Prisma.TransactionClient,
        googleBusy,
    };
}

beforeEach(() => {
    allowed.mockReset();
    allowed.mockResolvedValue(new Set(["gc_asha"]));
});

describe("Google busy times in slots", () => {
    it("takes the overlapping slot away, without the gap around it", async () => {
        const { client } = db([
            {
                staffId: "asha",
                startAt: iso("2026-07-20T08:00:00Z"),
                endAt: iso("2026-07-20T09:00:00Z"),
            },
        ]);
        const people = await loadPeople(client, "org_a", ["asha"], from, to);
        const starts = staffSlots(service, [], people, "UTC", from, to).map(
            (s) => s.startAt.toISOString(),
        );
        expect(starts).not.toContain("2026-07-20T08:00:00.000Z");
        expect(starts).not.toContain("2026-07-20T07:30:00.000Z");
        // Edge to edge with the block: the 30-minute gap is a booking's rule.
        expect(starts).toContain("2026-07-20T07:00:00.000Z");
        expect(starts).toContain("2026-07-20T09:00:00.000Z");
    });

    it("reads only fresh times, from a connection that still works", async () => {
        const { client, googleBusy } = db([]);
        const before = Date.now();
        await loadPeople(client, "org_a", ["asha"], from, to);
        const where = (
            googleBusy.mock.calls[0][0] as {
                where: {
                    organizationId: string;
                    connection: {
                        status: string;
                        busyRefreshedAt: { gte: Date };
                    };
                };
            }
        ).where;
        expect(where.organizationId).toBe("org_a");
        expect(where.connection.status).toBe("CONNECTED");
        const since = where.connection.busyRefreshedAt.gte.getTime();
        expect(since).toBeGreaterThanOrEqual(before - GOOGLE_BUSY_FRESH_MS);
        expect(since).toBeLessThanOrEqual(Date.now() - GOOGLE_BUSY_FRESH_MS);
    });

    const block = (connectionId?: string): Block => ({
        staffId: "asha",
        startAt: iso("2026-07-20T08:00:00Z"),
        endAt: iso("2026-07-20T09:00:00Z"),
        ...(connectionId ? { connectionId } : {}),
    });

    it("ignores them once the flag or the plan is off (GC-02)", async () => {
        allowed.mockResolvedValue(null);
        const { client } = db([block()]);
        const people = await loadPeople(client, "org_a", ["asha"], from, to);
        expect(people[0].timeOff).toHaveLength(0);
    });

    it("ignores them from someone who no longer holds the permission (GC-03)", async () => {
        allowed.mockResolvedValue(new Set(["gc_someone_else"]));
        const { client } = db([block()]);
        const people = await loadPeople(client, "org_a", ["asha"], from, to);
        expect(people[0].timeOff).toHaveLength(0);
    });

    it("ignores an account the plan's allowance leaves out (P4)", async () => {
        const { client } = db([block("gc_extra")]);
        const people = await loadPeople(client, "org_a", ["asha"], from, to);
        expect(people[0].timeOff).toHaveLength(0);
    });

    it("asks nothing more of a business with no busy times", async () => {
        const { client } = db([]);
        await loadPeople(client, "org_a", ["asha"], from, to);
        expect(allowed).not.toHaveBeenCalled();
    });
});
