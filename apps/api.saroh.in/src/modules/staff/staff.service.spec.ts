// Staff with a mocked database: who may, whose ids are trusted, the refusals
// and their fields, and what a save warns about. The bookings themselves run
// against a real Postgres in staff.db.spec.ts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        staffMember: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        staffService: { createMany: jest.fn(), deleteMany: jest.fn() },
        staffHours: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            findMany: jest.fn(),
        },
        staffExtraHours: {
            findMany: jest.fn(),
            create: jest.fn(),
            deleteMany: jest.fn(),
        },
        staffTimeOff: { create: jest.fn(), deleteMany: jest.fn() },
        bookingRules: { findUnique: jest.fn(), upsert: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        service: { findFirst: jest.fn(), count: jest.fn() },
        membership: { findFirst: jest.fn() },
        booking: { findMany: jest.fn() },
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
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { StaffService } from "./staff.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked>;

const service = new StaffService();

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}
const member = ctx({ role: "MEMBER" });

const ROW = {
    id: "staff_1",
    organizationId: "org_1",
    name: "Asha",
    title: "Trainer",
    status: "ACTIVE",
    membershipId: null,
    membership: null,
    services: [{ serviceId: "svc_1" }],
    hours: [{ dayOfWeek: 1, startMinute: 360, endMinute: 720 }],
    extraHours: [],
    timeOff: [],
};

/** The refusal body a BadRequest/Conflict carries. */
async function refusal(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (err) {
        return (err as { getResponse: () => unknown }).getResponse();
    }
    throw new Error("expected a refusal");
}

beforeEach(() => {
    jest.clearAllMocks();
    db.staffMember!.findFirst!.mockResolvedValue(ROW);
    db.staffMember!.findMany!.mockResolvedValue([ROW]);
    db.businessProfile!.findUnique!.mockResolvedValue({ timezone: "UTC" });
    db.booking!.findMany!.mockResolvedValue([]);
    db.staffHours!.findMany!.mockResolvedValue([]);
    db.staffExtraHours!.findMany!.mockResolvedValue([]);
});

describe("StaffService — who may (U3)", () => {
    it("lets a Member read the diary's people", async () => {
        const list = await service.list(member);
        expect(list.timezone).toBe("UTC");
        expect(list.staff[0]).toMatchObject({
            id: "staff_1",
            serviceIds: ["svc_1"],
            weeklyMinutes: 360,
        });
    });

    it.each([
        ["create", () => service.create(member, { name: "Ben" })],
        [
            "hours",
            () =>
                service.replaceHours(member, "staff_1", [
                    { dayOfWeek: 1, startMinute: 360, endMinute: 720 },
                ]),
        ],
        [
            "time off",
            () =>
                service.addTimeOff(member, "staff_1", {
                    fromDate: "2026-10-05",
                }),
        ],
        [
            "extra hours",
            () =>
                service.addExtraHours(member, "staff_1", {
                    date: "2026-10-06",
                    startMinute: 600,
                    endMinute: 720,
                }),
        ],
        [
            "booking rules",
            () => service.updateBookingRules(member, { freeCancelHours: 12 }),
        ],
        ["services", () => service.setServices(member, "staff_1", [])],
    ])("refuses a Member writing %s", async (_, write) => {
        await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.staffMember!.create).not.toHaveBeenCalled();
        expect(db.staffHours!.deleteMany).not.toHaveBeenCalled();
        expect(db.staffTimeOff!.create).not.toHaveBeenCalled();
        expect(db.bookingRules!.upsert).not.toHaveBeenCalled();
    });

    it("404s another business's person", async () => {
        db.staffMember!.findFirst!.mockResolvedValue(null);
        await expect(
            service.replaceHours(ctx(), "staff_other", []),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.staffMember!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "staff_other", organizationId: "org_1" },
            }),
        );
    });
});

describe("StaffService — hours", () => {
    it("refuses overlapping ranges with the field, and saves nothing", async () => {
        const body = await refusal(
            service.replaceHours(ctx(), "staff_1", [
                { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
                { dayOfWeek: 1, startMinute: 660, endMinute: 780 },
            ]),
        );
        expect(body).toEqual({
            message: "Monday's hours overlap: 9:00–12:00 and 11:00–13:00.",
            field: "hours",
        });
        expect(db.staffHours!.deleteMany).not.toHaveBeenCalled();
    });

    it("refuses a range that ends before it starts", async () => {
        await expect(
            service.replaceHours(ctx(), "staff_1", [
                { dayOfWeek: 2, startMinute: 720, endMinute: 600 },
            ]),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("keeps bookings the new hours no longer cover, and lists them", async () => {
        // New hours: Mon 6–12. One booking at Mon 7:00 (inside), one at
        // Mon 13:00 (now outside).
        db.staffHours!.findMany!.mockResolvedValue([
            { dayOfWeek: 1, startMinute: 360, endMinute: 720 },
        ]);
        const brief = (id: string, start: string) => ({
            id,
            startAt: new Date(start),
            endAt: new Date(new Date(start).getTime() + 3_600_000),
            serviceId: "svc_1",
            bookerName: null,
            service: { name: "PT session" },
            contact: { firstName: "Ravi", lastName: null },
        });
        db.booking!.findMany!.mockResolvedValue([
            brief("inside", "2026-07-20T07:00:00Z"),
            brief("outside", "2026-07-20T13:00:00Z"),
        ]);

        const result = await service.replaceHours(
            ctx(),
            "staff_1",
            [{ dayOfWeek: 1, startMinute: 360, endMinute: 720 }],
            new Date("2026-07-19T00:00:00Z"),
        );
        expect(result.outside.map((b) => b.id)).toEqual(["outside"]);
        expect(result.outside[0]).toMatchObject({
            serviceName: "PT session",
            bookerName: "Ravi",
        });
        // Replaced, never cancelled.
        expect(db.staffHours!.deleteMany).toHaveBeenCalledWith({
            where: { staffId: "staff_1" },
        });
    });
});

describe("StaffService — time off and extra hours", () => {
    it("records whole days in the business's zone and lists the bookings it covers", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue({
            timezone: "Asia/Kolkata",
        });
        db.booking!.findMany!.mockResolvedValue([
            {
                id: "b1",
                startAt: new Date("2026-10-05T04:30:00Z"),
                endAt: new Date("2026-10-05T05:30:00Z"),
                serviceId: "svc_1",
                bookerName: "Meera",
                service: { name: "PT session" },
                contact: null,
            },
        ]);
        const result = await service.addTimeOff(
            ctx(),
            "staff_1",
            { fromDate: "2026-10-05", reason: "Wedding" },
            new Date("2026-10-01T00:00:00Z"),
        );
        expect(db.staffTimeOff!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    startAt: new Date("2026-10-04T18:30:00.000Z"),
                    endAt: new Date("2026-10-05T18:30:00.000Z"),
                    allDay: true,
                    reason: "Wedding",
                }),
            }),
        );
        expect(result.affected.map((b) => b.id)).toEqual(["b1"]);
    });

    it("refuses an end before the start", async () => {
        const body = await refusal(
            service.addTimeOff(ctx(), "staff_1", {
                startAt: "2026-10-05T12:00:00Z",
                endAt: "2026-10-05T10:00:00Z",
            }),
        );
        expect(body).toMatchObject({ field: "endAt" });
    });

    it("refuses extra hours that overlap others on the same date", async () => {
        db.staffExtraHours!.findMany!.mockResolvedValue([
            { startMinute: 600, endMinute: 720 },
        ]);
        const body = await refusal(
            service.addExtraHours(ctx(), "staff_1", {
                date: "2026-10-06",
                startMinute: 660,
                endMinute: 780,
            }),
        );
        expect(body).toMatchObject({ field: "startMinute" });
        expect(db.staffExtraHours!.create).not.toHaveBeenCalled();
    });
});

describe("StaffService — who a person is", () => {
    it("refuses linking a team member who is already on the diary as someone else", async () => {
        db.membership!.findFirst!.mockResolvedValue({
            id: "m_1",
            staffMember: { id: "staff_2", name: "Ben" },
        });
        const body = await refusal(
            service.create(ctx(), { name: "Asha", membershipId: "m_1" }),
        );
        expect(body).toEqual({
            message: "That team member is already on the diary as Ben.",
            field: "membershipId",
        });
    });

    it("404s a service that is not the business's", async () => {
        db.service!.count!.mockResolvedValue(0);
        await expect(
            service.create(ctx(), { name: "Asha", serviceIds: ["svc_x"] }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("maps a racing second link to a 409 on the field", async () => {
        db.membership!.findFirst!.mockResolvedValue({
            id: "m_1",
            staffMember: null,
        });
        db.staffMember!.create!.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(
            service.create(ctx(), { name: "Asha", membershipId: "m_1" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("StaffService — booking rules", () => {
    it("reads no rules as nulls", async () => {
        db.bookingRules!.findUnique!.mockResolvedValue(null);
        await expect(service.getBookingRules(member)).resolves.toEqual({
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: null,
        });
    });

    it("writes only what was sent, and null clears", async () => {
        db.bookingRules!.upsert!.mockResolvedValue({
            bookAheadDays: 30,
            latestBookingMinutes: null,
            freeCancelHours: 12,
        });
        await service.updateBookingRules(ctx(), {
            freeCancelHours: 12,
            latestBookingMinutes: null,
        });
        expect(db.bookingRules!.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1" },
                update: { freeCancelHours: 12, latestBookingMinutes: null },
            }),
        );
    });
});
