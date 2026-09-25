// Sell → Storefronts: who may read, change and close a storefront, and the
// rules a storefront's own settings keep.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("@saroh/database", () => {
    const tx = {
        store: { update: jest.fn() },
        storeSettings: { upsert: jest.fn() },
    };
    return {
        prisma: {
            store: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            storeSettings: { findUnique: jest.fn() },
            order: { count: jest.fn(), findFirst: jest.fn() },
            merchantPaymentProvider: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
            },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
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
import { resolveCapabilities } from "../organizations/organization-policy";
import { openingHoursText } from "./opening-hours-text";
import { StorefrontsController } from "./storefronts.controller";
import { StorefrontsService } from "./storefronts.service";

const db = prisma as unknown as {
    store: Record<string, jest.Mock>;
    storeSettings: Record<string, jest.Mock>;
    order: Record<string, jest.Mock>;
    merchantPaymentProvider: Record<string, jest.Mock>;
    $transaction: jest.Mock;
    __tx: {
        store: Record<string, jest.Mock>;
        storeSettings: Record<string, jest.Mock>;
    };
};

const STORE = { id: "st_1", name: "High Street", _count: { orders: 0 } };

const as = (
    role: OrganizationContext["role"],
    over: Partial<OrganizationContext> = {},
): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    db.store.findFirst!.mockResolvedValue(STORE);
    db.store.findMany!.mockResolvedValue([STORE]);
    db.storeSettings.findUnique!.mockResolvedValue(null);
    db.order.count!.mockResolvedValue(0);
    db.order.findFirst!.mockResolvedValue(null);
    db.merchantPaymentProvider.findMany!.mockResolvedValue([]);
    db.merchantPaymentProvider.findUnique!.mockResolvedValue(null);
});

describe("StorefrontsController authorization", () => {
    const service = {
        list: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new StorefrontsController(
        service as unknown as StorefrontsService,
    );

    beforeEach(() => Object.values(service).forEach((m) => m.mockClear()));

    it("refuses a Reviewer even the list", () => {
        expect(() => controller.list(as("REVIEWER"))).toThrow(
            ForbiddenException,
        );
        expect(() => controller.get(as("REVIEWER"), "st_1")).toThrow(
            ForbiddenException,
        );
        expect(service.list).not.toHaveBeenCalled();
    });

    it("lets a Member look but not change or close", async () => {
        await controller.list(as("MEMBER"));
        expect(service.list).toHaveBeenCalledWith("org_1");
        expect(() =>
            controller.update(as("MEMBER"), "st_1", { name: "x" }),
        ).toThrow(ForbiddenException);
        await expect(controller.close(as("MEMBER"), "st_1")).rejects.toThrow(
            ForbiddenException,
        );
        expect(service.update).not.toHaveBeenCalled();
        expect(service.close).not.toHaveBeenCalled();
    });

    it("lets an Admin change and close", async () => {
        await controller.update(as("ADMIN"), "st_1", { name: "x" });
        await controller.close(as("ADMIN"), "st_1");
        // Who saved, for the audit row a change of hours writes.
        expect(service.update).toHaveBeenCalledWith(
            "org_1",
            "st_1",
            { name: "x" },
            "user_1",
        );
        expect(service.close).toHaveBeenCalledWith("org_1", "st_1");
    });

    it("follows an invented role: changing is not closing", async () => {
        const manager = as("MEMBER", {
            roleKey: "shop-manager",
            actions: resolveCapabilities("shop-manager", [
                "store:read",
                "store:write",
            ]),
        });
        await controller.update(manager, "st_1", { name: "x" });
        expect(service.update).toHaveBeenCalled();
        await expect(controller.close(manager, "st_1")).rejects.toThrow(
            ForbiddenException,
        );
    });
});

describe("StorefrontsService", () => {
    const service = new StorefrontsService();

    it("only ever looks inside the caller's own business", async () => {
        await service.list("org_1");
        expect(db.store.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1", deletedAt: null },
            }),
        );

        db.store.findFirst!.mockResolvedValue(null);
        await expect(service.get("org_1", "st_other")).rejects.toThrow(
            NotFoundException,
        );
        expect(db.store.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "st_other",
                    organizationId: "org_1",
                    deletedAt: null,
                },
            }),
        );
    });

    it("reads money and rates as 2-decimal strings", async () => {
        db.storeSettings.findUnique!.mockResolvedValue({
            currency: "INR",
            taxEnabled: true,
            taxRate: { toString: () => "18" },
            shippingEnabled: true,
            freeShippingThreshold: { toString: () => "999.5" },
        });
        const s = await service.get("org_1", "st_1");
        expect(s).toMatchObject({
            currency: "INR",
            taxRate: "18.00",
            freeShippingThreshold: "999.50",
        });
    });

    it("refuses to change the currency once an order exists", async () => {
        db.store.findFirst!.mockResolvedValue({
            ...STORE,
            _count: { orders: 4 },
        });
        db.order.findFirst!.mockResolvedValue({ currency: "INR" });
        await expect(
            service.update("org_1", "st_1", { currency: "USD" }),
        ).rejects.toThrow(ConflictException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("still saves the rest when the locked currency is resent unchanged", async () => {
        db.store.findFirst!.mockResolvedValue({
            ...STORE,
            _count: { orders: 4 },
        });
        db.order.findFirst!.mockResolvedValue({ currency: "INR" });
        await service.update("org_1", "st_1", {
            currency: "INR",
            taxEnabled: true,
        });
        expect(db.__tx.storeSettings.upsert).toHaveBeenCalled();
    });

    it("keeps the currency orders were taken in on the first save", async () => {
        // No settings row yet, but orders in INR: an unrelated first save
        // must not quietly create the row at the column's USD default.
        db.order.findFirst!.mockResolvedValue({ currency: "INR" });
        await service.update("org_1", "st_1", { shippingEnabled: false });
        expect(db.__tx.storeSettings.upsert).toHaveBeenCalledWith({
            where: { storeId: "st_1" },
            create: {
                storeId: "st_1",
                currency: "INR",
                shippingEnabled: false,
            },
            update: { shippingEnabled: false },
        });
    });

    it("renames without touching settings", async () => {
        await service.update("org_1", "st_1", { name: "Market stall" });
        expect(db.__tx.store.update).toHaveBeenCalledWith({
            where: { id: "st_1" },
            data: { name: "Market stall" },
        });
        expect(db.__tx.storeSettings.upsert).not.toHaveBeenCalled();
    });

    it("will not close while orders are waiting to go out", async () => {
        db.order.count!.mockResolvedValue(2);
        await expect(service.close("org_1", "st_1")).rejects.toThrow(
            BadRequestException,
        );
        await expect(service.close("org_1", "st_1")).rejects.toThrow(
            /2 orders here/,
        );
        expect(db.store.update).not.toHaveBeenCalled();
    });

    it("closes by setting it aside, not by erasing it", async () => {
        await service.close("org_1", "st_1");
        expect(db.store.update).toHaveBeenCalledWith({
            where: { id: "st_1" },
            data: { deletedAt: expect.any(Date) },
        });
    });
});

describe("StorefrontsService — checkout, pause and a shop's week", () => {
    const service = new StorefrontsService();
    const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
        (day) => ({ day, open: "09:00", close: "18:00", closed: false }),
    ) as never;

    it("will not point checkout at a provider the business has not connected", async () => {
        db.merchantPaymentProvider.findUnique!.mockResolvedValue({
            status: "DISABLED",
        });
        await expect(
            service.update("org_1", "st_1", { checkoutProvider: "STRIPE" }),
        ).rejects.toThrow(/Connect that provider/);
        expect(db.merchantPaymentProvider.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId_provider: {
                        organizationId: "org_1",
                        provider: "STRIPE",
                    },
                },
            }),
        );
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("says which provider checkout will really use", async () => {
        db.merchantPaymentProvider.findMany!.mockResolvedValue([
            { provider: "RAZORPAY", status: "CONNECTED" },
            { provider: "STRIPE", status: "CONNECTED" },
        ]);
        // Two connected and none named: checkout cannot choose.
        expect((await service.get("org_1", "st_1")).effectiveProvider).toBe(
            null,
        );
        db.storeSettings.findUnique!.mockResolvedValue({
            checkoutProvider: "STRIPE",
            taxRate: { toString: () => "0" },
        });
        expect((await service.get("org_1", "st_1")).effectiveProvider).toBe(
            "STRIPE",
        );
    });

    it("pauses with a timestamp and resumes by clearing it", async () => {
        await service.update("org_1", "st_1", { paused: true });
        const paused =
            db.__tx.storeSettings.upsert!.mock.calls[0][0].update.pausedAt;
        expect(paused).toBeInstanceOf(Date);

        await service.update("org_1", "st_1", { paused: false });
        expect(
            db.__tx.storeSettings.upsert!.mock.calls[1][0].update.pausedAt,
        ).toBeNull();
    });

    it("refuses a day that closes before it opens", async () => {
        const week = (WEEK as { close: string }[]).map((d, i) =>
            i === 2 ? { ...d, close: "08:00" } : d,
        );
        await expect(
            service.update("org_1", "st_1", { openingHours: week as never }),
        ).rejects.toThrow(/close after it opens/);
    });

    it("lets a closed day have any times", async () => {
        const week = (WEEK as { close: string }[]).map((d, i) =>
            i === 6 ? { ...d, close: "00:00", closed: true } : d,
        );
        await service.update("org_1", "st_1", { openingHours: week as never });
        expect(db.__tx.storeSettings.upsert).toHaveBeenCalled();
    });
});

describe("opening hours in Settings › Activity (#509)", () => {
    const day = (
        d: string,
        open = "09:00",
        close = "18:00",
        closed = false,
    ) => ({
        day: d,
        open,
        close,
        closed,
    });
    const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"].map((d) => day(d));

    it("says a week as a person reads it, neighbouring days once", () => {
        expect(
            openingHoursText([
                ...WEEKDAYS,
                day("SAT", "10:00", "14:00"),
                day("SUN", "00:00", "00:00", true),
            ] as never),
        ).toBe("Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun closed");
        expect(openingHoursText(null)).toBeNull();
    });

    it("records a storefront's week before and after, by who saved it", async () => {
        const record = jest.fn().mockResolvedValue(undefined);
        const service = new StorefrontsService({ record } as never);
        const before = [...WEEKDAYS, day("SAT"), day("SUN")];
        const after = [
            ...WEEKDAYS,
            day("SAT", "10:00", "14:00"),
            day("SUN", "00:00", "00:00", true),
        ];
        db.storeSettings
            .findUnique!.mockResolvedValueOnce({
                taxRate: "0",
                openingHours: before,
            })
            .mockResolvedValue({ taxRate: "0", openingHours: after });

        await service.update(
            "org_1",
            "st_1",
            { openingHours: after as never },
            "user_1",
        );

        expect(record).toHaveBeenCalledWith({
            action: "storefront.hours.update",
            actorUserId: "user_1",
            organizationId: "org_1",
            targetType: "storefront",
            targetId: "st_1",
            outcome: "SUCCESS",
            metadata: {
                fields: ["openingHours"],
                storefront: "High Street",
                changes: [
                    {
                        field: "openingHours",
                        before: "Mon–Sun 09:00–18:00",
                        after: "Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun closed",
                    },
                ],
            },
        });
    });

    it("records nothing when the week is saved as it was, or nobody saved it", async () => {
        const record = jest.fn().mockResolvedValue(undefined);
        const service = new StorefrontsService({ record } as never);
        const week = [...WEEKDAYS, day("SAT"), day("SUN")];
        db.storeSettings.findUnique!.mockResolvedValue({
            taxRate: "0",
            openingHours: week,
        });

        await service.update(
            "org_1",
            "st_1",
            { openingHours: week as never },
            "user_1",
        );
        await service.update("org_1", "st_1", { name: "Shop" });

        expect(record).not.toHaveBeenCalled();
    });
});
