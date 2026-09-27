// Business closures with a mocked database (E3): who may, the rows a range
// becomes, the bookings it names (kept, never cancelled), and stale ids.
// Against a real Postgres in closures.db.spec.ts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        businessClosure: {
            findMany: jest.fn(),
            createMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        businessProfile: { findUnique: jest.fn() },
        service: { findFirst: jest.fn() },
        staffMember: { findFirst: jest.fn() },
        booking: { findMany: jest.fn(), update: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ClosuresService } from "./closures.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked>;

const closures = new ClosuresService();
const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };
const NOW = new Date("2026-10-01T00:00:00Z");

function booking(id: string, start: string, hours = 1) {
    const startAt = new Date(start);
    return {
        id,
        startAt,
        endAt: new Date(startAt.getTime() + hours * 3_600_000),
        serviceId: "svc_1",
        bookerName: null,
        service: { name: "Cleaning" },
        contact: { firstName: "Meera", lastName: "Shah" },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    db.businessProfile!.findUnique!.mockResolvedValue({
        timezone: "Asia/Kolkata",
    });
    db.businessClosure!.findMany!.mockResolvedValue([]);
    db.booking!.findMany!.mockResolvedValue([]);
    db.staffMember!.findFirst!.mockResolvedValue({ id: "staff_1" });
});

describe("ClosuresService — who may", () => {
    it("lets a Member read closures", async () => {
        await expect(closures.list(member, NOW)).resolves.toEqual([]);
    });

    it.each([
        ["add", () => closures.add(member, { fromDate: "2026-11-02" }, NOW)],
        ["remove", () => closures.remove(member, ["c1"], NOW)],
        [
            "preview",
            () => closures.preview(member, { fromDate: "2026-11-02" }, NOW),
        ],
    ])("refuses a Member's %s", async (_, call) => {
        await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.businessClosure!.createMany).not.toHaveBeenCalled();
        expect(db.businessClosure!.deleteMany).not.toHaveBeenCalled();
    });
});

describe("ClosuresService — closing", () => {
    it("writes 2–6 Nov as one all-day row in the business's zone, for the business", async () => {
        await closures.add(
            owner,
            { fromDate: "2026-11-02", toDate: "2026-11-06", reason: "Diwali" },
            NOW,
        );
        expect(db.businessClosure!.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: "org_1",
                    startAt: new Date("2026-11-01T18:30:00.000Z"),
                    endAt: new Date("2026-11-06T18:30:00.000Z"),
                    allDay: true,
                    reason: "Diwali",
                    createdByUserId: "user_1",
                },
            ],
        });
    });

    it("writes a part-day range as one row per day, with no reason as null", async () => {
        await closures.add(
            owner,
            {
                fromDate: "2026-11-02",
                toDate: "2026-11-04",
                startMinute: 14 * 60,
                endMinute: 18 * 60,
                reason: "  ",
            },
            NOW,
        );
        const rows = (
            db.businessClosure!.createMany!.mock.calls[0]![0] as {
                data: { allDay: boolean; reason: string | null }[];
            }
        ).data;
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => !r.allDay && r.reason === null)).toBe(true);
    });

    it("names the business's bookings in the closure, and cancels none", async () => {
        db.booking!.findMany!.mockResolvedValue([
            booking("in", "2026-11-03T05:00:00Z"),
            booking("after", "2026-11-07T05:00:00Z"),
        ]);
        const result = await closures.add(
            owner,
            { fromDate: "2026-11-02", toDate: "2026-11-06" },
            NOW,
        );
        expect(result.affected.map((b) => b.id)).toEqual(["in"]);
        expect(result.affected[0]!.bookerName).toBe("Meera Shah");
        expect(db.booking!.update).not.toHaveBeenCalled();
        // Everyone's bookings, not one person's.
        const where = (
            db.booking!.findMany!.mock.calls[0]![0] as {
                where: Record<string, unknown>;
            }
        ).where;
        expect(where).toMatchObject({
            organizationId: "org_1",
            status: "CONFIRMED",
        });
        expect(where).not.toHaveProperty("staffId");
        // The closure's time is in the query, not filtered after (K-4).
        expect(where.OR).toEqual([
            {
                startAt: { lt: expect.any(Date) },
                endAt: { gt: expect.any(Date) },
            },
        ]);
    });

    it("refuses To before From on the field, writing nothing", async () => {
        const err = await closures
            .add(owner, { fromDate: "2026-11-06", toDate: "2026-11-02" }, NOW)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            field: "toDate",
        });
        expect(db.businessClosure!.createMany).not.toHaveBeenCalled();
    });
});

describe("ClosuresService — opening again", () => {
    it("removes every row of a line, only the business's own", async () => {
        db.businessClosure!.deleteMany!.mockResolvedValue({ count: 2 });
        await closures.remove(owner, ["c1", "c2", "c1"], NOW);
        expect(db.businessClosure!.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ["c1", "c2"] }, organizationId: "org_1" },
        });
    });

    it("404s when any row is gone or another business's", async () => {
        db.businessClosure!.deleteMany!.mockResolvedValue({ count: 1 });
        await expect(
            closures.remove(owner, ["c1", "other"], NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("ClosuresService — preview", () => {
    it("names one person's bookings in their part-day time off", async () => {
        db.booking!.findMany!.mockResolvedValue([
            booking("afternoon", "2026-11-02T09:00:00Z"),
            booking("morning", "2026-11-02T04:00:00Z"),
        ]);
        const { affected } = await closures.preview(
            owner,
            {
                fromDate: "2026-11-02",
                startMinute: 14 * 60,
                endMinute: 18 * 60,
                staffId: "staff_1",
            },
            NOW,
        );
        expect(affected.map((b) => b.id)).toEqual(["afternoon"]);
        expect(db.booking!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ staffId: "staff_1" }),
            }),
        );
    });

    it("404s another business's person", async () => {
        db.staffMember!.findFirst!.mockResolvedValue(null);
        await expect(
            closures.preview(
                owner,
                { fromDate: "2026-11-02", staffId: "staff_other" },
                NOW,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.staffMember!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "staff_other", organizationId: "org_1" },
            }),
        );
    });
});
