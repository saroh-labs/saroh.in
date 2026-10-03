/**
 * Metering and enforcement's rules without a database (plans catalogue
 * U13): the business's month, which writes cross a notice's line, the
 * refusals' shapes, what each count asks the database, and
 * `MeteringService` behind its kill switch. The same rules against a real
 * Postgres: `metering.db.spec.ts` and the services' `plan-limits.db.spec.ts`.
 *
 * Catalogue numbers are made up (`fakeMeteredCatalog`).
 */
const tx = {
    $executeRaw: jest.fn(),
    job: { create: jest.fn() },
    product: { count: jest.fn() },
    order: { count: jest.fn() },
    booking: { count: jest.fn() },
    post: { count: jest.fn() },
    membership: { count: jest.fn() },
    organizationInvitation: { count: jest.fn() },
    merchantPaymentProvider: { count: jest.fn() },
    communicationProvider: { count: jest.fn() },
    businessProfile: { findUnique: jest.fn() },
    service: { findFirst: jest.fn() },
};
const $transaction = jest.fn((fn: (t: typeof tx) => unknown) => fn(tx));

jest.mock("@saroh/database", () => ({
    prisma: { $transaction: (fn: never) => $transaction(fn) },
    liveCatalogueVersion: jest.fn(),
}));

import { ForbiddenException } from "@nestjs/common";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { resolveAllAccess } from "@saroh/pricing-catalog";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { moduleAccessViews } from "./catalogue-access";
import type { CatalogueAccessService } from "./catalogue-access.service";
import {
    countUsage,
    meteredKeyOf,
    meteredModules,
    monthWindow,
    windowKey,
} from "./metering";
import {
    crossesNotice,
    MeteringService,
    PLAN_LIMIT_NOTICE_TYPE,
} from "./metering.service";
import { bookingsPaused, moduleLocked } from "./plan-limit-errors";
import { limitLevel, limitNoticeWords } from "./plan-limit-notice.handler";

const catalog = fakeMeteredCatalog();
const rows = (planId: string): ModuleAccess[] =>
    resolveAllAccess({ catalog, planId, now: new Date() });

function meterFor(
    planId: string | null,
    enforcing = true,
): { meter: MeteringService; resolve: jest.Mock } {
    const resolve = jest.fn(() =>
        Promise.resolve(
            planId
                ? { source: "catalogue", modules: rows(planId) }
                : { source: "legacy", reason: "no-plan" },
        ),
    );
    const flags = {
        isEnabled: () => Promise.resolve(enforcing),
    } as unknown as FeatureFlagService;
    return {
        meter: new MeteringService(
            { resolve } as unknown as CatalogueAccessService,
            flags,
        ),
        resolve,
    };
}

function responseOf(err: unknown) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    tx.businessProfile.findUnique.mockResolvedValue({
        timezone: "Asia/Kolkata",
    });
});

describe("the business's month", () => {
    it("starts at midnight in its zone", () => {
        const now = new Date("2026-10-01T00:10:00+05:30");
        expect(monthWindow(now, "Asia/Kolkata")).toEqual({
            start: new Date("2026-09-30T18:30:00.000Z"),
            key: "2026-10",
        });
        expect(monthWindow(now, "UTC").key).toBe("2026-09");
    });

    it("names the month only for a monthly limit", () => {
        const now = new Date("2026-10-15T00:00:00Z");
        expect(windowKey("month", now, "Asia/Kolkata")).toBe("2026-10");
        expect(windowKey("", now, "Asia/Kolkata")).toBe("all");
    });
});

describe("which rows metering counts", () => {
    it("maps every MODULE_MAP limit key it knows", () => {
        expect(Object.fromEntries(meteredModules())).toEqual({
            blog: "blogPosts",
            products: "products",
            orders: "ordersPerMonth",
            bookings: "bookingsPerMonth",
            members: "teamMembers",
            integrations: "integrations",
        });
        expect(meteredKeyOf("roles")).toBeNull();
    });
});

describe("what each count asks", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    const start = new Date("2026-09-30T18:30:00.000Z");

    it("leaves archived products out", async () => {
        tx.product.count.mockResolvedValue(4);
        expect(await countUsage(tx as never, "org", "products", now)).toBe(4);
        expect(tx.product.count).toHaveBeenCalledWith({
            where: { organizationId: "org", status: { not: "ARCHIVED" } },
        });
    });

    it("counts this month's standing orders, through the storefront", async () => {
        tx.order.count.mockResolvedValue(2);
        await countUsage(tx as never, "org", "ordersPerMonth", now);
        expect(tx.order.count).toHaveBeenCalledWith({
            where: {
                store: { organizationId: "org" },
                createdAt: { gte: start },
                status: { not: "CANCELLED" },
                NOT: { placedOnline: true, paidAt: null },
            },
        });
    });

    it("counts this month's confirmed bookings, a course's left out", async () => {
        tx.booking.count.mockResolvedValue(2);
        await countUsage(tx as never, "org", "bookingsPerMonth", now);
        expect(tx.booking.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                createdAt: { gte: start },
                status: "CONFIRMED",
                courseEnrollmentId: null,
            },
        });
    });

    it("adds open invitations to the people in the business", async () => {
        tx.membership.count.mockResolvedValue(2);
        tx.organizationInvitation.count.mockResolvedValue(1);
        expect(await countUsage(tx as never, "org", "teamMembers", now)).toBe(
            3,
        );
    });

    it("adds connected messaging to connected payment providers", async () => {
        tx.merchantPaymentProvider.count.mockResolvedValue(1);
        tx.communicationProvider.count.mockResolvedValue(1);
        expect(await countUsage(tx as never, "org", "integrations", now)).toBe(
            2,
        );
    });

    it("counts posts live on a site that isn't deleted", async () => {
        tx.post.count.mockResolvedValue(1);
        await countUsage(tx as never, "org", "blogPosts", now);
        expect(tx.post.count).toHaveBeenCalledWith({
            where: {
                currentPublicationId: { not: null },
                site: { organizationId: "org", deletedAt: null },
            },
        });
    });
});

describe("crossing a notice's line", () => {
    it("crosses at 80%, at the cap, and past it once", () => {
        // A cap of 5: 80% is 4.
        expect(crossesNotice({ limit: 5, used: 2, adding: 1 })).toBe(false);
        expect(crossesNotice({ limit: 5, used: 3, adding: 1 })).toBe(true);
        expect(crossesNotice({ limit: 5, used: 4, adding: 1 })).toBe(true);
        expect(crossesNotice({ limit: 5, used: 5, adding: 1 })).toBe(true);
        expect(crossesNotice({ limit: 5, used: 6, adding: 1 })).toBe(false);
        // A batch that jumps the line still crosses it.
        expect(crossesNotice({ limit: 5, used: 1, adding: 3 })).toBe(true);
    });

    it("words each level as the design does", () => {
        const row = { plan: "Plan A", upgradeTo: "Plan B" };
        expect(limitLevel(3, 5)).toBeNull();
        expect(limitLevel(4, 5)).toBe("warn");
        expect(limitLevel(5, 5)).toBe("full");
        expect(limitLevel(6, 5)).toBe("over");
        expect(limitNoticeWords(row, "products", 5, 4, "warn")).toEqual({
            title: "You've used 4 of 5 products on Plan A",
            body: "You'll be stopped at 5. Plan B gives you more.",
        });
        expect(limitNoticeWords(row, "ordersPerMonth", 2, 3, "over")).toEqual({
            title: "You're past your 2 orders a month on Plan A",
            body: "Your site kept taking orders, so no customer was turned away. Plan B raises the limit.",
        });
    });
});

describe("the refusals", () => {
    it("names the locked row and the plan that has it", () => {
        const review = rows("free").find((r) => r.moduleId === "review")!;
        expect(responseOf(moduleLocked(review))).toEqual({
            message:
                "Second look isn't in your Plan A plan. It comes with Plan B.",
            details: {
                code: "MODULE_LOCKED",
                moduleId: "review",
                plan: { id: "free", name: "Plan A" },
                upgradeTo: {
                    planId: "grow",
                    name: "Plan B",
                    pricePaise: 22_200,
                },
            },
        });
    });

    it("tells the booking page nothing about the plan", () => {
        expect(bookingsPaused().getResponse()).toEqual({
            message: "This business isn't taking bookings online right now.",
            details: { code: "BOOKINGS_PAUSED", reason: "bookingsPaused" },
        });
    });
});

describe("MeteringService", () => {
    it("reads nothing and refuses nothing with the switch off", async () => {
        const { meter, resolve } = meterFor("free", false);
        expect(await meter.roomInTx(tx as never, "org", "products")).toBeNull();
        await expect(
            meter.assertIncluded("org", "roles"),
        ).resolves.toBeUndefined();
        expect(resolve).not.toHaveBeenCalled();
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it("never refuses a business off the catalogue", async () => {
        const { meter } = meterFor(null);
        tx.product.count.mockResolvedValue(99);
        expect(await meter.roomInTx(tx as never, "org", "products")).toBeNull();
    });

    it("locks, counts, and refuses at the cap with the notice", async () => {
        const { meter } = meterFor("free");
        tx.product.count.mockResolvedValue(3);
        const err = await meter
            .roomInTx(tx as never, "org", "products")
            .catch((e: unknown) => e);
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(responseOf(err)).toMatchObject({
            message: "You've reached your 3 products on Plan A",
            details: {
                code: "PLAN_LIMIT_REACHED",
                limit: 3,
                used: 3,
                upgradeTo: { planId: "grow" },
            },
        });
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("lets the last one in and queues the notice it earns", async () => {
        const { meter } = meterFor("free");
        tx.product.count.mockResolvedValue(2);
        expect(
            await meter.roomInTx(tx as never, "org", "products"),
        ).toMatchObject({ limit: 3, used: 2, adding: 1 });
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                type: PLAN_LIMIT_NOTICE_TYPE,
                organizationId: "org",
                payload: { organizationId: "org", moduleId: "products" },
            },
        });
    });

    it("throws the caller's refusal instead, when it has one", async () => {
        const { meter } = meterFor("free");
        tx.booking.count.mockResolvedValue(2);
        await expect(
            meter.roomInTx(tx as never, "org", "bookings", {
                refuse: bookingsPaused,
            }),
        ).rejects.toMatchObject({ message: bookingsPaused().message });
    });

    it("never refuses a soft cap", async () => {
        const { meter } = meterFor("free");
        tx.order.count.mockResolvedValue(5);
        expect(
            await meter.roomInTx(tx as never, "org", "orders", { soft: true }),
        ).toMatchObject({ used: 5 });
    });

    it("refuses a write into a row the plan leaves off", async () => {
        const { meter } = meterFor("free");
        await expect(meter.assertIncluded("org", "roles")).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            meterFor("pro").meter.assertIncluded("org", "roles"),
        ).resolves.toBeUndefined();
    });

    it("checks nothing for a row with no cap", async () => {
        const { meter } = meterFor("pro");
        expect(await meter.roomInTx(tx as never, "org", "products")).toBeNull();
        expect(tx.product.count).not.toHaveBeenCalled();
    });

    it("lets the write through when the plan can't be read", async () => {
        const { meter, resolve } = meterFor("free");
        resolve.mockRejectedValueOnce(new Error("down"));
        expect(await meter.roomInTx(tx as never, "org", "products")).toBeNull();
    });

    it("adds no transaction with the switch off", async () => {
        const { meter } = meterFor("free", false);
        const write = jest.fn(() => Promise.resolve("done"));
        expect(await meter.withRoom("org", "members", write)).toBe("done");
        expect($transaction).not.toHaveBeenCalled();
    });

    it("checks on the write's own transaction with it on", async () => {
        const { meter } = meterFor("free");
        tx.membership.count.mockResolvedValue(2);
        tx.organizationInvitation.count.mockResolvedValue(0);
        const write = jest.fn(() => Promise.resolve("done"));
        await expect(meter.withRoom("org", "members", write)).rejects.toThrow(
            ForbiddenException,
        );
        expect(write).not.toHaveBeenCalled();
        // Sending a live invitation again adds nobody.
        expect(
            await meter.withRoom("org", "members", write, {
                addingIn: () => Promise.resolve(0),
            }),
        ).toBe("done");
        expect(write).toHaveBeenCalledWith(tx);
    });
});

describe("usage on the access view", () => {
    it("shows a metered row's count only while it is on", () => {
        const views = moduleAccessViews(catalog, rows("free"), {
            products: 2,
            roles: 7,
        });
        const row = (id: string) => views.find((v) => v.moduleId === id);
        expect(row("products")?.usage).toBe(2);
        expect(row("orders")?.usage).toBeNull();
        expect(row("roles")?.usage).toBeNull();
    });
});
