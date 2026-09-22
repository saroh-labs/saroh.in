// Class packs with a mocked database: who may, whose ids are trusted, what a
// sale writes, and the plain refusals. The races and balances run against a
// real Postgres in class-packs.db.spec.ts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn(),
        classPack: { create: jest.fn(), updateMany: jest.fn() },
        classPackService: { createMany: jest.fn(), deleteMany: jest.fn() },
        packPurchase: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
        packRedemption: {
            count: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        organizationModule: { findFirst: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            classPack: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                updateMany: jest.fn(),
            },
            packPurchase: { findFirst: jest.fn(), findMany: jest.fn() },
            contact: { findFirst: jest.fn() },
            service: { count: jest.fn() },
            organizationModule: { findFirst: jest.fn() },
            booking: { findFirst: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { InvoicesService } from "../invoices/invoices.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ClassPacksService } from "./class-packs.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked> & {
    __tx: Record<string, Mocked> & { $queryRaw: jest.Mock };
};
const tx = db.__tx;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };

const issueInTx = jest.fn();
const service = new ClassPacksService({
    issueInTx,
} as unknown as InvoicesService);

const decimal = (s: string) => ({ toString: () => s });
const PACK = {
    id: "pack_1",
    organizationId: "org_1",
    name: "10-class pack",
    description: null,
    credits: 10,
    validityDays: 90,
    price: decimal("4500"),
    currency: "INR",
    status: "ACTIVE",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    services: [{ service: { id: "svc_1", name: "Vinyasa" } }],
};
const PURCHASE = {
    id: "pp_1",
    credits: 10,
    price: decimal("4500"),
    currency: "INR",
    expiresAt: new Date("2026-12-20T00:00:00Z"),
    createdAt: new Date("2026-09-22T00:00:00Z"),
    pack: { id: "pack_1", name: "10-class pack" },
    contact: {
        id: "c_1",
        firstName: "Asha",
        lastName: null,
        email: "asha@example.com",
    },
    invoices: [{ id: "inv_1" }],
    _count: { redemptions: 3 },
};

beforeEach(() => {
    jest.clearAllMocks();
    db.classPack!.findFirst!.mockResolvedValue(PACK);
    db.classPack!.findMany!.mockResolvedValue([PACK]);
    db.contact!.findFirst!.mockResolvedValue({ id: "c_1" });
    db.service!.count!.mockResolvedValue(1);
    db.packPurchase!.findFirst!.mockResolvedValue(PURCHASE);
    db.packPurchase!.findMany!.mockResolvedValue([]);
    tx.classPack!.create!.mockResolvedValue({ id: "pack_1" });
    tx.packPurchase!.create!.mockResolvedValue({ id: "pp_1" });
    tx.organizationModule!.findFirst!.mockResolvedValue(null);
    db.organizationModule!.findFirst!.mockResolvedValue(null);
});

describe("selling a pack", () => {
    it("snapshots the pack and invoices it when Payments is on", async () => {
        const view = await service.sell(owner, "pack_1", { contactId: "c_1" });

        const data = tx.packPurchase!.create!.mock.calls[0]![0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            packId: "pack_1",
            contactId: "c_1",
            credits: 10,
            price: "4500.00",
            currency: "INR",
        });
        expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
            89 * 86_400_000,
        );
        expect(issueInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            expect.objectContaining({
                source: "PACK",
                packPurchaseId: "pp_1",
                lines: [
                    {
                        description: "10-class pack · 10 classes",
                        quantity: 1,
                        unitPrice: "4500.00",
                    },
                ],
            }),
        );
        expect(view).toMatchObject({
            left: 7,
            used: 3,
            standing: "ACTIVE",
            invoiceId: "inv_1",
        });
    });

    it("records the sale with no invoice when Payments is off", async () => {
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "mod_1" });
        await service.sell(owner, "pack_1", { contactId: "c_1" });
        expect(tx.packPurchase!.create).toHaveBeenCalled();
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("refuses to sell an archived pack", async () => {
        db.classPack!.findFirst!.mockResolvedValue({
            ...PACK,
            status: "ARCHIVED",
        });
        await expect(
            service.sell(owner, "pack_1", { contactId: "c_1" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.packPurchase!.create).not.toHaveBeenCalled();
    });

    it("answers another business's pack or contact with a 404", async () => {
        db.classPack!.findFirst!.mockResolvedValue(null);
        await expect(
            service.sell(owner, "pack_x", { contactId: "c_1" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.classPack!.findFirst).toHaveBeenCalledWith({
            where: { id: "pack_x", organizationId: "org_1" },
        });
        db.classPack!.findFirst!.mockResolvedValue(PACK);
        db.contact!.findFirst!.mockResolvedValue(null);
        await expect(
            service.sell(owner, "pack_1", { contactId: "c_x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("making a pack", () => {
    const INPUT = {
        name: "10-class pack",
        credits: 10,
        validityDays: 90,
        price: "4500",
        currency: "INR",
        serviceIds: ["svc_1", "svc_1"],
    };

    it("writes the pack and the services it pays for, de-duplicated", async () => {
        await service.createPack(owner, INPUT);
        expect(tx.classPackService!.createMany).toHaveBeenCalledWith({
            data: [
                {
                    packId: "pack_1",
                    serviceId: "svc_1",
                    organizationId: "org_1",
                },
            ],
        });
    });

    it("answers another business's service with a 404 and writes nothing", async () => {
        db.service!.count!.mockResolvedValue(0);
        await expect(
            service.createPack(owner, { ...INPUT, serviceIds: ["svc_other"] }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.service!.count).toHaveBeenCalledWith({
            where: {
                id: { in: ["svc_other"] },
                organizationId: "org_1",
                deletedAt: null,
            },
        });
        expect(tx.classPack!.create).not.toHaveBeenCalled();
    });

    it("needs at least one service", async () => {
        await expect(
            service.createPack(owner, { ...INPUT, serviceIds: [] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("who sees the invoice", () => {
    it("gives the invoice id only to a role that may read invoices", async () => {
        expect((await service.getPurchase(owner, "pp_1")).invoiceId).toBe(
            "inv_1",
        );
        const desk: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["pack:read"]),
        };
        expect((await service.getPurchase(desk, "pp_1")).invoiceId).toBeNull();
    });
});

describe("the packs list", () => {
    it("counts every sale, and the ones still live", async () => {
        const future = new Date(Date.now() + 30 * 86_400_000);
        db.packPurchase!.findMany!.mockResolvedValue([
            // Live: time and classes left.
            {
                packId: "pack_1",
                credits: 10,
                expiresAt: future,
                _count: { redemptions: 3 },
            },
            // Used up.
            {
                packId: "pack_1",
                credits: 10,
                expiresAt: future,
                _count: { redemptions: 10 },
            },
            // Expired.
            {
                packId: "pack_1",
                credits: 10,
                expiresAt: new Date("2026-01-01T00:00:00Z"),
                _count: { redemptions: 0 },
            },
        ]);
        const [view] = await service.listPacks(owner, {});
        expect(view).toMatchObject({ sold: 3, activeHolders: 1 });
        expect(db.packPurchase!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1", packId: { in: ["pack_1"] } },
            }),
        );
    });

    it("says none sold for a pack nobody has bought", async () => {
        const [view] = await service.listPacks(owner, {});
        expect(view).toMatchObject({ sold: 0, activeHolders: 0 });
    });
});

describe("the purchases list", () => {
    it("keeps to this business, and to packs covering a service when asked", async () => {
        await service.listPurchases(owner, {
            contactId: "c_1",
            serviceId: "svc_1",
        });
        expect(db.packPurchase!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    contactId: "c_1",
                    pack: { services: { some: { serviceId: "svc_1" } } },
                },
            }),
        );
    });

    it("leaves the service out of the query when none is asked for", async () => {
        await service.listPurchases(owner, { contactId: "c_1" });
        expect(db.packPurchase!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1", contactId: "c_1" },
            }),
        );
    });
});

describe("what selling does", () => {
    it("invoices a sale while Payments is on", async () => {
        expect(await service.sellingTerms(owner)).toEqual({
            invoicesOnSale: true,
        });
        expect(db.organizationModule!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: "org_1" }),
            }),
        );
    });

    it("does not while Payments is off", async () => {
        db.organizationModule!.findFirst!.mockResolvedValue({ id: "mod_1" });
        expect(await service.sellingTerms(owner)).toEqual({
            invoicesOnSale: false,
        });
    });

    it("is refused to a role that may not see packs", async () => {
        await expect(service.sellingTerms(member)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});

describe("the balance", () => {
    it.each([
        ["active", { _count: { redemptions: 3 } }, "ACTIVE", 7],
        ["used up", { _count: { redemptions: 10 } }, "USED_UP", 0],
        [
            "expired",
            { expiresAt: new Date("2026-01-01T00:00:00Z") },
            "EXPIRED",
            7,
        ],
    ])("reads a %s purchase", async (_label, over, standing, left) => {
        db.packPurchase!.findFirst!.mockResolvedValue({ ...PURCHASE, ...over });
        const view = await service.getPurchase(owner, "pp_1");
        expect(view.standing).toBe(standing);
        expect(view.left).toBe(left);
    });
});

describe("using a pack on a booking already made", () => {
    const BOOKING = {
        id: "bk_1",
        status: "CONFIRMED",
        contactId: "c_1",
        serviceId: "svc_1",
        startAt: new Date("2026-10-01T09:00:00Z"),
    };

    beforeEach(() => {
        db.booking!.findFirst!.mockResolvedValue(BOOKING);
        tx.packPurchase!.findMany!.mockResolvedValue([
            { id: "pp_1", credits: 10, pack: { name: "10-class pack" } },
        ]);
        tx.packRedemption!.count!.mockResolvedValue(3);
        tx.packRedemption!.findUnique!.mockResolvedValue(null);
        // The booking lock, then each pack lock.
        tx.$queryRaw.mockResolvedValue([{ status: "CONFIRMED" }]);
    });

    it("spends in a serializable transaction, under a lock on the booking", async () => {
        await service.useOnBooking(owner, "bk_1", {});
        expect(db.$transaction.mock.calls[0]![1]).toMatchObject({
            isolationLevel: "Serializable",
        });
        expect(String(tx.$queryRaw.mock.calls[0]![0])).toContain(
            'FROM "Booking"',
        );
    });

    it("refuses a booking cancelled while it was being paid", async () => {
        tx.$queryRaw.mockResolvedValueOnce([{ status: "CANCELLED" }]);
        await expect(service.useOnBooking(owner, "bk_1", {})).rejects.toThrow(
            "Only a confirmed booking can be paid with a class pack.",
        );
        expect(tx.packRedemption!.create).not.toHaveBeenCalled();
    });

    it("tries a lost race once more, so the answer is what is true now", async () => {
        db.$transaction!.mockRejectedValueOnce(
            Object.assign(new Error("race"), { code: "P2034" }),
        );
        await expect(
            service.useOnBooking(owner, "bk_1", {}),
        ).resolves.toBeDefined();
        expect(db.$transaction).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["lost the race twice", ["P2034", "P2034"]],
        ["another pack went on at once", ["P2002"]],
    ])("answers %s with a 409, not a 500", async (_label, codes) => {
        for (const code of codes) {
            db.$transaction!.mockRejectedValueOnce(
                Object.assign(new Error("race"), { code }),
            );
        }
        await expect(
            service.useOnBooking(owner, "bk_1", {}),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("spends a class of the booker's own pack for that service and date", async () => {
        await service.useOnBooking(owner, "bk_1", {});
        expect(tx.packPurchase!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    contactId: "c_1",
                    expiresAt: { gt: BOOKING.startAt },
                    pack: { services: { some: { serviceId: "svc_1" } } },
                },
                orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
            }),
        );
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.packRedemption!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                purchaseId: "pp_1",
                bookingId: "bk_1",
            },
        });
    });

    it("says plainly when no pack has a class left", async () => {
        tx.packRedemption!.count!.mockResolvedValue(10);
        await expect(service.useOnBooking(owner, "bk_1", {})).rejects.toThrow(
            "They have no class pack with classes left for this service on that date.",
        );
        expect(tx.packRedemption!.create).not.toHaveBeenCalled();
    });

    it("refuses someone else's pack", async () => {
        tx.packPurchase!.findFirst!.mockResolvedValue({
            id: "pp_2",
            contactId: "c_2",
            credits: 10,
            expiresAt: new Date("2026-12-20T00:00:00Z"),
            pack: { name: "10-class pack", services: [{ serviceId: "svc_1" }] },
        });
        await expect(
            service.useOnBooking(owner, "bk_1", { packPurchaseId: "pp_2" }),
        ).rejects.toThrow("That class pack belongs to someone else.");
    });

    it("refuses a pack that runs out before the session, even if bought before it", async () => {
        tx.packPurchase!.findFirst!.mockResolvedValue({
            id: "pp_1",
            contactId: "c_1",
            credits: 10,
            expiresAt: new Date("2026-09-30T00:00:00Z"),
            pack: { name: "10-class pack", services: [{ serviceId: "svc_1" }] },
        });
        await expect(
            service.useOnBooking(owner, "bk_1", { packPurchaseId: "pp_1" }),
        ).rejects.toThrow("That class pack runs out before this session.");
    });

    it("refuses a booking that is already paid with a pack", async () => {
        tx.packRedemption!.findUnique!.mockResolvedValue({
            id: "r_1",
            reversedAt: null,
        });
        await expect(
            service.useOnBooking(owner, "bk_1", {}),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses a cancelled booking", async () => {
        db.booking!.findFirst!.mockResolvedValue({
            ...BOOKING,
            status: "CANCELLED",
        });
        await expect(
            service.useOnBooking(owner, "bk_1", {}),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("taking a pack off a booking", () => {
    beforeEach(() => {
        db.booking!.findFirst!.mockResolvedValue({ id: "bk_1" });
    });

    it("gives the class back, looking the booking up in this business only", async () => {
        tx.packRedemption!.updateMany!.mockResolvedValue({ count: 1 });
        await expect(service.removeFromBooking(owner, "bk_1")).resolves.toEqual(
            { bookingId: "bk_1", returned: true },
        );
        expect(db.booking!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "bk_1", organizationId: "org_1" },
            }),
        );
        expect(tx.packRedemption!.updateMany).toHaveBeenCalledWith({
            where: { bookingId: "bk_1", reversedAt: null },
            data: { reversedAt: expect.any(Date) },
        });
    });

    it("says nothing came back when no pack paid for it", async () => {
        tx.packRedemption!.updateMany!.mockResolvedValue({ count: 0 });
        await expect(service.removeFromBooking(owner, "bk_1")).resolves.toEqual(
            { bookingId: "bk_1", returned: false },
        );
    });

    it("is a 404 for another business's booking", async () => {
        db.booking!.findFirst!.mockResolvedValue(null);
        await expect(
            service.removeFromBooking(owner, "bk_other"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});

describe("who may", () => {
    it("refuses a Member every read and write", async () => {
        await expect(service.listPacks(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(service.listPurchases(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.sell(member, "pack_1", { contactId: "c_1" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.useOnBooking(member, "bk_1", {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.removeFromBooking(member, "bk_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});
