// Price history (owner, 12 Oct 2026) on a service: made, saved, and read.
// One entry on the save's own transaction, with the value before and after
// and who made it; nothing when the cost did not move, and nothing when the
// save is refused or fails. DB-free: Prisma is mocked. What an entry holds
// is `audit/price-history.spec.ts`'s.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        // The lifecycle gate: no row means "not closed".
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        service: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        course: { findFirst: jest.fn().mockResolvedValue(null) },
        store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        organizationModule: { findFirst: jest.fn().mockResolvedValue(null) },
        auditEvent: { create: jest.fn(), findMany: jest.fn() },
        user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((work: (tx: typeof client) => unknown) =>
                work(client),
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
import type { OrgAction } from "../organizations/organization-actions";
import { BookingsService } from "./bookings.service";
import type { UpdateServiceDto } from "./dto";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>> & {
    $transaction: jest.Mock;
};
const entries = () =>
    db.auditEvent!.create!.mock.calls.map(
        (call) => (call[0] as { data: Record<string, unknown> }).data,
    );

const asha: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_asha",
    role: "OWNER",
};
const roleWith = (...actions: OrgAction[]): OrganizationContext => ({
    ...asha,
    role: "MEMBER",
    roleKey: "desk",
    actions: new Set(actions),
});

const SERVICE = {
    id: "svc_1",
    organizationId: "org_1",
    siteId: null,
    name: "Personal Training",
    description: null,
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    priceCents: 150_000,
    currency: "INR",
    gstRate: null,
    sacCode: null,
    gstPriceMode: null,
    timezone: "UTC",
    locationType: "IN_PERSON",
    meetingUrl: null,
    status: "ACTIVE",
    visits: 1,
    depositMode: "NONE",
    showOnBookingPage: true,
    deletedAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};
const decimal = (value: string) => ({ toString: () => value });

const service = new BookingsService();

beforeEach(() => {
    jest.clearAllMocks();
    db.service!.findUnique!.mockResolvedValue(SERVICE);
    db.service!.create!.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...SERVICE, ...data, id: "svc_new" }),
    );
    db.service!.update!.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...SERVICE, ...data }),
    );
});

describe("a new service", () => {
    const create = (over: Record<string, unknown>) =>
        service.createService(asha, {
            name: "Personal Training",
            durationMinutes: 60,
            timezone: "UTC",
            ...over,
        });

    it("starts its history at what it was made at, by who made it", async () => {
        await create({
            priceCents: 150_000,
            currency: "INR",
            gstRate: "18",
            gstPriceMode: "ADDED",
        });
        expect(entries()).toEqual([
            {
                action: "price.set",
                actorUserId: "u_asha",
                organizationId: "org_1",
                targetType: "service",
                targetId: "svc_new",
                outcome: "SUCCESS",
                metadata: {
                    kind: "SERVICE",
                    name: "Personal Training",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: null, after: "1500.00" },
                        { field: "gstRate", before: null, after: "18" },
                        { field: "gstPriceMode", before: null, after: "ADDED" },
                    ],
                },
            },
        ]);
    });

    it("made with no price has no history yet", async () => {
        await create({});
        expect(db.service!.create).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when it is refused", async () => {
        await expect(
            create({ priceCents: 150_000, gstRate: "7" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.service!.create).not.toHaveBeenCalled();
        expect(entries()).toEqual([]);
    });
});

describe("saving a service", () => {
    it("a new price, rate and way of carrying GST are one entry, before and after", async () => {
        db.service!.findUnique!.mockResolvedValue({
            ...SERVICE,
            gstRate: decimal("5.00"),
        });
        await service.updateService(asha, "svc_1", {
            priceCents: 180_000,
            gstRate: "18",
            gstPriceMode: "ADDED",
        });
        expect(entries()).toEqual([
            expect.objectContaining({
                action: "price.changed",
                actorUserId: "u_asha",
                targetType: "service",
                targetId: "svc_1",
                metadata: {
                    kind: "SERVICE",
                    name: "Personal Training",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: "1500.00", after: "1800.00" },
                        { field: "gstRate", before: "5", after: "18" },
                        { field: "gstPriceMode", before: null, after: "ADDED" },
                    ],
                },
            }),
        ]);
    });

    it("a price cleared is a change to nothing", async () => {
        // A null price in the body clears it (the DTO's type says a number).
        await service.updateService(asha, "svc_1", {
            priceCents: null,
        } as unknown as UpdateServiceDto);
        expect(entries()[0]!.metadata).toMatchObject({
            changes: [{ field: "price", before: "1500.00", after: null }],
        });
    });

    it("keeps nothing when the cost did not move", async () => {
        await service.updateService(asha, "svc_1", {
            name: "Personal Training, 1 to 1",
            durationMinutes: 45,
            priceCents: 150_000,
        });
        expect(db.service!.update).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("a Saroh operator's is marked, so it reads as Saroh support", async () => {
        await service.updateService(
            { ...asha, roleKey: "platform-operator" },
            "svc_1",
            { priceCents: 180_000 },
        );
        expect(entries()[0]!.metadata).toMatchObject({ byOperator: true });
    });

    it("keeps nothing when the save is refused", async () => {
        await expect(
            service.updateService(asha, "svc_1", { gstRate: "7" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.updateService(roleWith("service:read"), "svc_1", {
                priceCents: 180_000,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.service!.update).not.toHaveBeenCalled();
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when the save fails", async () => {
        db.service!.update!.mockRejectedValue(new Error("the database went"));
        await expect(
            service.updateService(asha, "svc_1", { priceCents: 180_000 }),
        ).rejects.toThrow("the database went");
        expect(entries()).toEqual([]);
    });
});

describe("reading a service's price history", () => {
    beforeEach(() => {
        db.auditEvent!.findMany!.mockResolvedValue([]);
    });

    it("is the business's own service's, newest first", async () => {
        await expect(
            service.servicePriceHistory(roleWith("service:read"), "svc_1", {
                limit: 5,
            }),
        ).resolves.toEqual({ entries: [], nextCursor: null });
        expect(db.auditEvent!.findMany!.mock.calls[0]![0]).toMatchObject({
            where: {
                organizationId: "org_1",
                targetType: "service",
                targetId: "svc_1",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 6,
        });
    });

    it("needs the permission the service's own read needs", async () => {
        await expect(
            service.servicePriceHistory(roleWith("store:read"), "svc_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.auditEvent!.findMany).not.toHaveBeenCalled();
    });

    it("another business's service is not found, and nothing is read", async () => {
        db.service!.findUnique!.mockResolvedValue({
            ...SERVICE,
            organizationId: "org_theirs",
        });
        await expect(
            service.servicePriceHistory(asha, "svc_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.auditEvent!.findMany).not.toHaveBeenCalled();
    });
});
