// How a storefront's orders leave and when they count as late (plan B,
// B17): the chips, the three thresholds, their bounds, the audit words and
// the one-time notice on Orders.
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
            store: { findMany: jest.fn(), findFirst: jest.fn() },
            storeSettings: {
                findUnique: jest.fn(),
                upsert: jest.fn(),
                updateMany: jest.fn(),
            },
            stockLevel: { aggregate: jest.fn() },
            order: { count: jest.fn(), findFirst: jest.fn() },
            merchantPaymentProvider: { findMany: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { DEFAULT_LATE_THRESHOLDS } from "../orders/fulfilment";
import {
    fulfilmentChanges,
    fulfilmentPatch,
    lateAfterWords,
    lateRuleNotices,
} from "./storefront-fulfilment";
import { StorefrontsController } from "./storefronts.controller";
import { UpdateStorefrontDto } from "./storefronts.dto";
import { StorefrontsService } from "./storefronts.service";

const db = prisma as unknown as {
    store: Record<string, jest.Mock>;
    storeSettings: Record<string, jest.Mock>;
    stockLevel: Record<string, jest.Mock>;
    order: Record<string, jest.Mock>;
    merchantPaymentProvider: Record<string, jest.Mock>;
    __tx: { storeSettings: Record<string, jest.Mock> };
};

const STORE = { id: "st_1", name: "High Street", _count: { orders: 0 } };
const SETTINGS = {
    fulfilmentTypes: ["PICKUP", "SHIPPING"],
    collectionEnabled: true,
    shippingEnabled: true,
    taxRate: "0",
    pickupLateAfterMinutes: 120,
    localDeliveryLateAfterMinutes: 1440,
    shippingLateAfterMinutes: 2880,
};

beforeEach(() => {
    jest.clearAllMocks();
    db.store.findFirst!.mockResolvedValue(STORE);
    db.storeSettings.findUnique!.mockResolvedValue(SETTINGS);
    db.order.count!.mockResolvedValue(0);
    db.order.findFirst!.mockResolvedValue(null);
    db.stockLevel.aggregate!.mockResolvedValue({ _sum: {} });
    db.merchantPaymentProvider.findMany!.mockResolvedValue([]);
});

const pipe = new ValidationPipe(validationPipeOptions);
const body = (value: unknown) =>
    pipe.transform(value, { type: "body", metatype: UpdateStorefrontDto });

/** The sentence a refused body says, for the screen to show. */
async function refusal(value: unknown): Promise<string> {
    try {
        await body(value);
    } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const res = (e as BadRequestException).getResponse() as {
            message: string[];
        };
        return res.message.join(" ");
    }
    throw new Error("accepted");
}

describe("the late setting at the boundary", () => {
    it("takes whole minutes from 5 to 30 days, per type", async () => {
        await expect(
            body({
                lateAfterMinutes: { PICKUP: 20, SHIPPING: 72 * 60 },
            }),
        ).resolves.toMatchObject({
            lateAfterMinutes: { PICKUP: 20, SHIPPING: 4320 },
        });
        await expect(
            body({ lateAfterMinutes: { LOCAL_DELIVERY: 5 } }),
        ).resolves.toBeDefined();
        await expect(
            body({ lateAfterMinutes: { SHIPPING: 30 * 24 * 60 } }),
        ).resolves.toBeDefined();
    });

    it("refuses 0, 3 minutes, 31 days and a fraction with a sentence", async () => {
        expect(await refusal({ lateAfterMinutes: { PICKUP: 0 } })).toContain(
            "5 minutes at the soonest",
        );
        expect(await refusal({ lateAfterMinutes: { PICKUP: 3 } })).toContain(
            "5 minutes at the soonest",
        );
        expect(
            await refusal({ lateAfterMinutes: { SHIPPING: 31 * 24 * 60 } }),
        ).toContain("30 days at the most");
        expect(await refusal({ lateAfterMinutes: { PICKUP: 20.5 } })).toContain(
            "whole number of minutes",
        );
        expect(await refusal({ lateAfterMinutes: { PICKUP: "20" } })).toContain(
            "whole number of minutes",
        );
    });

    it("refuses Digital, an appointment or a way listed twice", async () => {
        await expect(
            body({ lateAfterMinutes: { DIGITAL: 60 } }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await refusal({ fulfilmentTypes: ["DIGITAL"] })).toContain(
            "Pick-up, Local delivery or Shipping",
        );
        expect(
            await refusal({ fulfilmentTypes: ["PICKUP", "PICKUP"] }),
        ).toContain("listed once");
        await expect(
            body({ fulfilmentTypes: ["SHIPPING", "PICKUP"] }),
        ).resolves.toMatchObject({ fulfilmentTypes: ["SHIPPING", "PICKUP"] });
    });
});

describe("fulfilmentPatch", () => {
    it("saves the chips in table order, with the old toggles in step", () => {
        expect(
            fulfilmentPatch({ fulfilmentTypes: ["SHIPPING", "PICKUP"] }),
        ).toEqual({
            fulfilmentTypes: ["PICKUP", "SHIPPING"],
            collectionEnabled: true,
            shippingEnabled: true,
        });
        // Local delivery alone still delivers: the order form's toggle.
        expect(
            fulfilmentPatch({ fulfilmentTypes: ["LOCAL_DELIVERY"] }),
        ).toEqual({
            fulfilmentTypes: ["LOCAL_DELIVERY"],
            collectionEnabled: false,
            shippingEnabled: true,
        });
        expect(fulfilmentPatch({ fulfilmentTypes: [] })).toEqual({
            fulfilmentTypes: [],
            collectionEnabled: false,
            shippingEnabled: false,
        });
    });

    it("writes only the thresholds sent", () => {
        expect(
            fulfilmentPatch({ lateAfterMinutes: { SHIPPING: 4320 } }),
        ).toEqual({ shippingLateAfterMinutes: 4320 });
        expect(
            fulfilmentPatch({ lateAfterMinutes: { PICKUP: 20, SHIPPING: 60 } }),
        ).toEqual({ pickupLateAfterMinutes: 20, shippingLateAfterMinutes: 60 });
        expect(fulfilmentPatch({ name: "x" })).toEqual({});
    });
});

describe("the words Settings › Activity keeps", () => {
    it("says a threshold as the field shows it", () => {
        expect(lateAfterWords(120)).toBe("2 hours");
        expect(lateAfterWords(60)).toBe("1 hour");
        expect(lateAfterWords(20)).toBe("20 minutes");
        expect(lateAfterWords(90)).toBe("90 minutes");
    });

    it("names only what changed", () => {
        const before = {
            fulfilmentTypes: ["PICKUP" as const],
            lateAfterMinutes: DEFAULT_LATE_THRESHOLDS,
        };
        expect(fulfilmentChanges(before, before)).toEqual([]);
        expect(
            fulfilmentChanges(before, {
                fulfilmentTypes: ["PICKUP", "SHIPPING"],
                lateAfterMinutes: { ...DEFAULT_LATE_THRESHOLDS, PICKUP: 20 },
            }),
        ).toEqual([
            {
                field: "fulfilmentTypes",
                before: "Pick-up",
                after: "Pick-up, Shipping",
            },
            {
                field: "pickupLateAfterMinutes",
                before: "2 hours",
                after: "20 minutes",
            },
        ]);
    });
});

describe("StorefrontsService — the late setting", () => {
    it("reads each type's threshold, and the defaults before any settings", async () => {
        const service = new StorefrontsService();
        expect((await service.get("org_1", "st_1")).lateAfterMinutes).toEqual(
            DEFAULT_LATE_THRESHOLDS,
        );
        db.storeSettings.findUnique!.mockResolvedValue(null);
        expect((await service.get("org_1", "st_1")).lateAfterMinutes).toEqual({
            PICKUP: 120,
            LOCAL_DELIVERY: 1440,
            SHIPPING: 2880,
        });
    });

    it("saves the chips over the toggles an older app might also send", async () => {
        const service = new StorefrontsService();
        await service.update("org_1", "st_1", {
            fulfilmentTypes: ["LOCAL_DELIVERY"],
            shippingEnabled: false,
        });
        expect(db.__tx.storeSettings.upsert!.mock.calls[0][0].update).toEqual({
            shippingEnabled: true,
            fulfilmentTypes: ["LOCAL_DELIVERY"],
            collectionEnabled: false,
        });
    });

    it("keeps a type's value when the storefront doesn't offer it", async () => {
        const service = new StorefrontsService();
        await service.update("org_1", "st_1", {
            lateAfterMinutes: { PICKUP: 20 },
        });
        const { update } = db.__tx.storeSettings.upsert!.mock.calls[0][0];
        expect(update.pickupLateAfterMinutes).toBe(20);
        expect(update).not.toHaveProperty("shippingLateAfterMinutes");
        expect(update).not.toHaveProperty("localDeliveryLateAfterMinutes");
    });

    it("records the change in words, by who saved it", async () => {
        const record = jest.fn().mockResolvedValue(undefined);
        const service = new StorefrontsService({ record } as never);
        db.storeSettings
            .findUnique!.mockResolvedValueOnce(SETTINGS)
            .mockResolvedValue({ ...SETTINGS, pickupLateAfterMinutes: 20 });
        await service.update(
            "org_1",
            "st_1",
            { lateAfterMinutes: { PICKUP: 20 } },
            "user_1",
        );
        expect(record).toHaveBeenCalledWith({
            action: "storefront.fulfilment.update",
            actorUserId: "user_1",
            organizationId: "org_1",
            targetType: "storefront",
            targetId: "st_1",
            outcome: "SUCCESS",
            metadata: {
                fields: ["pickupLateAfterMinutes"],
                storefront: "High Street",
                changes: [
                    {
                        field: "pickupLateAfterMinutes",
                        before: "2 hours",
                        after: "20 minutes",
                    },
                ],
            },
        });
    });

    it("records nothing when the value is saved as it was", async () => {
        const record = jest.fn().mockResolvedValue(undefined);
        const service = new StorefrontsService({ record } as never);
        await service.update(
            "org_1",
            "st_1",
            { lateAfterMinutes: { PICKUP: 120 } },
            "user_1",
        );
        expect(record).not.toHaveBeenCalled();
    });

    it("refuses another business's storefront", async () => {
        db.store.findFirst!.mockResolvedValue(null);
        const service = new StorefrontsService();
        await expect(
            service.update("org_1", "st_other", {
                lateAfterMinutes: { PICKUP: 20 },
            }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            service.dismissLateRuleNotice("org_1", "st_other"),
        ).rejects.toThrow(NotFoundException);
        expect(db.storeSettings.updateMany).not.toHaveBeenCalled();
    });

    it("dismisses for the storefront, keeping the first dismissal", async () => {
        const service = new StorefrontsService();
        await service.dismissLateRuleNotice("org_1", "st_1");
        expect(db.storeSettings.updateMany).toHaveBeenCalledWith({
            where: { storeId: "st_1", lateRuleNoticeDismissedAt: null },
            data: { lateRuleNoticeDismissedAt: expect.any(Date) },
        });
    });
});

describe("lateRuleNotices", () => {
    it("asks for open storefronts with recent pick-ups, on the default, not dismissed", async () => {
        db.store.findMany!.mockResolvedValue([{ id: "st_1", name: "Café" }]);
        const now = new Date("2026-10-10T12:00:00.000Z");
        await expect(
            lateRuleNotices(prisma as never, "org_1", now),
        ).resolves.toEqual([
            { storeId: "st_1", name: "Café", pickupLateAfterMinutes: 120 },
        ]);
        const { where } = db.store.findMany!.mock.calls[0][0];
        expect(where).toEqual({
            organizationId: "org_1",
            deletedAt: null,
            orders: {
                some: {
                    fulfilment: {
                        in: ["PICKUP"],
                    },
                    createdAt: { gte: new Date("2026-09-10T12:00:00.000Z") },
                },
            },
            OR: [
                { settings: null },
                {
                    settings: {
                        pickupLateAfterMinutes: 120,
                        lateRuleNoticeDismissedAt: null,
                    },
                },
            ],
        });
    });
});

describe("StorefrontsController — the notice", () => {
    const service = {
        lateRuleNotices: jest.fn().mockResolvedValue([]),
        dismissLateRuleNotice: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new StorefrontsController(
        service as unknown as StorefrontsService,
    );
    const as = (role: OrganizationContext["role"]): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_1",
        role,
    });

    it("shows anyone who reads Orders, and says whether they may change it", async () => {
        await expect(controller.lateRuleNotices(as("OWNER"))).resolves.toEqual({
            notices: [],
            canChange: true,
        });
        await expect(controller.lateRuleNotices(as("MEMBER"))).resolves.toEqual(
            { notices: [], canChange: false },
        );
        await controller.dismissLateRuleNotice(as("MEMBER"), "st_1");
        expect(service.dismissLateRuleNotice).toHaveBeenCalledWith(
            "org_1",
            "st_1",
        );
    });

    it("refuses someone who can't read Orders", async () => {
        await expect(
            controller.lateRuleNotices(as("REVIEWER")),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            controller.dismissLateRuleNotice(as("REVIEWER"), "st_1"),
        ).rejects.toThrow(ForbiddenException);
    });
});
