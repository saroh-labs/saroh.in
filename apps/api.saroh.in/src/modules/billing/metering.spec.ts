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
    membership: { findMany: jest.fn() },
    staffMember: { count: jest.fn() },
    organizationInvitation: { findMany: jest.fn() },
    organizationRole: { findMany: jest.fn() },
    merchantPaymentProvider: { count: jest.fn() },
    communicationProvider: { count: jest.fn() },
    businessProfile: { findUnique: jest.fn() },
    service: { findFirst: jest.fn() },
    store: { count: jest.fn() },
    site: { count: jest.fn() },
    media: { aggregate: jest.fn() },
    analyticsDailyAggregate: { aggregate: jest.fn() },
    delivery: { count: jest.fn() },
};
const $transaction = jest.fn((fn: (t: typeof tx) => unknown) => fn(tx));

jest.mock("@saroh/database", () => ({
    prisma: {
        $transaction: (fn: never) => $transaction(fn),
        // `hasRoom` counts outside a write's transaction.
        get merchantPaymentProvider() {
            return tx.merchantPaymentProvider;
        },
        get communicationProvider() {
            return tx.communicationProvider;
        },
    },
    liveCatalogueVersion: jest.fn(),
}));

import { ForbiddenException } from "@nestjs/common";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { resolveAllAccess } from "@saroh/pricing-catalog";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import {
    entitlementMapFor,
    LEGACY_FLOOR_ENTITLEMENTS,
    moduleAccessViews,
} from "./catalogue-access";
import type { CatalogueAccessService } from "./catalogue-access.service";
import {
    bytesToGb,
    countUsage,
    meteredKeyOf,
    meteredModules,
    monthFirstDay,
    monthWindow,
    quietAtOne,
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
            reviewers: "reviewers",
            bookings: "bookingsPerMonth",
            members: "teamMembers",
            integrations: "integrations",
            locations: "shopLocations",
            sites: "sites",
            storage: "storageGb",
            visits: "visitsPerMonth",
            "saroh-emails": "sarohEmailsPerMonth",
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
                NOT: { placedOnline: true, payOnHandover: false, paidAt: null },
            },
        });
    });

    it("counts this month's confirmed online bookings, a course's and the team's left out", async () => {
        tx.booking.count.mockResolvedValue(2);
        await countUsage(tx as never, "org", "bookingsPerMonth", now);
        expect(tx.booking.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                createdAt: { gte: start },
                status: "CONFIRMED",
                courseEnrollmentId: null,
                bookedOnline: true,
            },
        });
    });

    it("counts this month's emails Saroh queued, not those stopped or out of tries (DEC-086)", async () => {
        tx.delivery.count.mockResolvedValue(3);
        expect(
            await countUsage(tx as never, "org", "sarohEmailsPerMonth", now),
        ).toBe(3);
        expect(tx.delivery.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                provider: "SAROH",
                createdAt: { gte: start },
                NOT: [
                    { status: "STOPPED" },
                    { status: "FAILED", attempts: { gte: 5 } },
                ],
            },
        });
    });

    /** People as `SEAT_MEMBER_SELECT` reads them. */
    const person = (
        role: string,
        extraActions: string[] = [],
        staff = false,
    ) => ({
        role,
        extraActions,
        staffMember: staff ? { status: "ACTIVE" } : null,
    });
    const team = (
        members: ReturnType<typeof person>[],
        invites: string[] = [],
        roles: { key: string; actions: string[] }[] = [],
        loginless = 0,
    ) => {
        tx.membership.findMany.mockResolvedValue(members);
        tx.staffMember.count.mockResolvedValue(loginless);
        tx.organizationInvitation.findMany.mockResolvedValue(
            invites.map((role) => ({ role })),
        );
        tx.organizationRole.findMany.mockResolvedValue(roles);
    };

    it("adds open invitations to the people in the business", async () => {
        team([person("OWNER"), person("MEMBER")], ["ADMIN"]);
        expect(await countUsage(tx as never, "org", "teamMembers", now)).toBe(
            3,
        );
        expect(tx.organizationInvitation.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                status: "PENDING",
                expiresAt: { gt: now },
            },
            // With the diary person an invite names (#868).
            select: {
                role: true,
                staffMember: { select: { status: true, membershipId: true } },
            },
        });
    });

    // DEC-105: classified by permissions, never by the role's name.
    it("counts a seat for anyone who can change something, view-only people apart", async () => {
        const roles = [
            { key: "looker", actions: ["order:read", "contact:read"] },
            { key: "front-desk", actions: ["booking:write"] },
        ];
        team(
            [
                person("OWNER"),
                person("REVIEWER"),
                person("looker"),
                person("front-desk"),
            ],
            ["looker", "REVIEWER", "front-desk"],
            roles,
        );
        // Owner and the booking role (a person and an invite).
        expect(await countUsage(tx as never, "org", "teamMembers", now)).toBe(
            3,
        );
        // Reviewer and the view-only role, people and invites both.
        expect(await countUsage(tx as never, "org", "reviewers", now)).toBe(4);
    });

    it("gives a seat to a view-only person who takes bookings or holds a write extra", async () => {
        const roles = [{ key: "looker", actions: ["booking:read"] }];
        team(
            [
                person("looker", [], true),
                person("looker", ["booking:write"]),
                person("looker"),
            ],
            [],
            roles,
        );
        expect(await countUsage(tx as never, "org", "teamMembers", now)).toBe(
            2,
        );
        expect(await countUsage(tx as never, "org", "reviewers", now)).toBe(1);
    });

    // UX-053: someone on the diary with no login takes bookings, so uses a
    // seat; one who is a team member counts once, through their membership.
    it("gives a seat to each bookable person with no login, and never twice", async () => {
        team([person("OWNER"), person("REVIEWER", [], true)], [], [], 2);
        expect(await countUsage(tx as never, "org", "teamMembers", now)).toBe(
            4,
        );
        expect(tx.staffMember.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                status: "ACTIVE",
                membershipId: null,
            },
        });
        // Never view-only.
        tx.staffMember.count.mockClear();
        expect(await countUsage(tx as never, "org", "reviewers", now)).toBe(0);
        expect(tx.staffMember.count).not.toHaveBeenCalled();
    });

    it("counts only live locations customers visit", async () => {
        tx.store.count.mockResolvedValue(1);
        expect(await countUsage(tx as never, "org", "shopLocations", now)).toBe(
            1,
        );
        expect(tx.store.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                deletedAt: null,
                settings: { kind: "SHOP" },
            },
        });
    });

    it("counts websites that aren't deleted", async () => {
        tx.site.count.mockResolvedValue(2);
        expect(await countUsage(tx as never, "org", "sites", now)).toBe(2);
        expect(tx.site.count).toHaveBeenCalledWith({
            where: { organizationId: "org", deletedAt: null },
        });
    });

    it("sums checked uploads, in GB rounded up to the hundredth", async () => {
        tx.media.aggregate.mockResolvedValue({
            _sum: { sizeBytes: 1_234_567_890 },
        });
        expect(await countUsage(tx as never, "org", "storageGb", now)).toBe(
            1.24,
        );
        expect(tx.media.aggregate).toHaveBeenCalledWith({
            where: { organizationId: "org", status: "READY" },
            _sum: { sizeBytes: true },
        });
        tx.media.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } });
        expect(await countUsage(tx as never, "org", "storageGb", now)).toBe(0);
    });

    it("reads GB as storage is sold, and never shows a little as nothing", () => {
        expect(bytesToGb(1_000_000_000)).toBe(1);
        expect(bytesToGb(1)).toBe(0.01);
        expect(bytesToGb(0)).toBe(0);
        expect(bytesToGb(-5)).toBe(0);
    });

    it("sums this month's site views from the rollup's org-wide total", async () => {
        tx.analyticsDailyAggregate.aggregate.mockResolvedValue({
            _sum: { count: 7 },
        });
        expect(
            await countUsage(tx as never, "org", "visitsPerMonth", now),
        ).toBe(7);
        expect(tx.analyticsDailyAggregate.aggregate).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                siteId: "",
                type: "site.view",
                dimension: "",
                dimensionValue: "",
                date: { gte: new Date("2026-10-01T00:00:00.000Z") },
            },
            _sum: { count: true },
        });
        tx.analyticsDailyAggregate.aggregate.mockResolvedValue({
            _sum: { count: null },
        });
        expect(
            await countUsage(tx as never, "org", "visitsPerMonth", now),
        ).toBe(0);
    });

    it("starts visits on the UTC day dated the 1st of the business's month", () => {
        // 1 Oct 00:10 in India is still 30 Sep in UTC: India's month, and
        // its rollup day, is October's.
        const now = new Date("2026-10-01T00:10:00+05:30");
        expect(monthFirstDay(now, "Asia/Kolkata")).toEqual(
            new Date("2026-10-01T00:00:00.000Z"),
        );
        expect(monthFirstDay(now, "UTC")).toEqual(
            new Date("2026-09-01T00:00:00.000Z"),
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

    it("a total of one, filled by setting the business up, crosses only past it (UX-041)", () => {
        // The business's one website, made at sign-up: no notice, no job.
        expect(
            crossesNotice({ key: "sites", limit: 1, used: 0, adding: 1 }),
        ).toBe(false);
        // Past it (a soft cap) is still told.
        expect(
            crossesNotice({ key: "storageGb", limit: 1, used: 0.5, adding: 1 }),
        ).toBe(true);
        // A monthly one still warns: this month's one booking is news.
        expect(
            crossesNotice({
                key: "bookingsPerMonth",
                limit: 1,
                used: 0,
                adding: 1,
            }),
        ).toBe(true);
        expect(quietAtOne("teamMembers", 1)).toBe(true);
        expect(quietAtOne("teamMembers", 2)).toBe(false);
        expect(quietAtOne("bookingsPerMonth", 1)).toBe(false);
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
        // One is one thing, never "1 websites" (UX-041).
        expect(limitNoticeWords(row, "sites", 1, 2, "over").title).toBe(
            "You're past your 1 website on Plan A",
        );
        expect(limitNoticeWords(row, "teamMembers", 2, 2, "full").title).toBe(
            "You've reached your 2 team members on Plan A",
        );
        expect(limitNoticeWords(row, "ordersPerMonth", 2, 3, "over")).toEqual({
            title: "You're past your 2 orders a month on Plan A",
            body: "Your site kept taking orders, so no customer was turned away. Plan B raises the limit.",
        });
    });

    it("leads Saroh's emails with connecting the business's own, says when the month restarts, and offers no add-on (DEC-086)", () => {
        const row = { plan: "Plan A", upgradeTo: "Plan B" };
        const warn = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            8,
            "warn",
        );
        expect(warn.title).toBe(
            "You've used 8 of 10 emails Saroh sends for you a month on Plan A",
        );
        expect(warn.body).toMatch(
            /^You'll be stopped at 10\. Connect your own email/,
        );
        const full = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            10,
            "full",
            "1 Nov",
        );
        expect(full.body).toBe(
            "Saroh has stopped sending your booking emails for this month. It starts again on 1 Nov. Connect your own email and your booking emails go through it, with no monthly limit. Or Plan B raises the limit.",
        );
        const over = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            12,
            "over",
        );
        expect(over.body).not.toMatch(/add-on/);
        expect(over.body).toMatch(/Connect your own email/);
    });

    it("leads Saroh's emails with a higher plan when the business can't connect its own (DEC-086)", () => {
        const row = { plan: "Plan A", upgradeTo: "Plan B" };
        const higher =
            "A higher plan lets you connect your own email, and then your booking emails go through it with no monthly limit.";
        const warn = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            8,
            "warn",
            undefined,
            false,
        );
        expect(warn.body).toBe(
            `You'll be stopped at 10. Plan B gives you more. ${higher}`,
        );
        const full = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            10,
            "full",
            "1 Nov",
            false,
        );
        expect(full.body).toBe(
            `Saroh has stopped sending your booking emails for this month. It starts again on 1 Nov. Plan B raises the limit. ${higher}`,
        );
        const over = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            12,
            "over",
            undefined,
            false,
        );
        expect(over.body).toBe(
            `Saroh has stopped sending your booking emails for this month. Plan B raises the limit. ${higher}`,
        );
        // Unread: neither connecting nor its plan is claimed.
        const unread = limitNoticeWords(
            row,
            "sarohEmailsPerMonth",
            10,
            10,
            "full",
            "1 Nov",
            null,
        );
        expect(unread.body).toBe(
            "Saroh has stopped sending your booking emails for this month. It starts again on 1 Nov. Plan B raises the limit.",
        );
        for (const b of [warn.body, full.body, over.body, unread.body]) {
            expect(b).not.toMatch(/Connect your own email|add-on/);
        }
    });

    it("never tells a soft cap it will be stopped", () => {
        const row = { plan: "Plan A", upgradeTo: "Plan B", soft: true };
        expect(limitNoticeWords(row, "visitsPerMonth", 11, 9, "warn")).toEqual({
            title: "You've used 9 of 11 site visits a month on Plan A",
            body: "Nothing stops at 11; we'll let you know when you reach it. Plan B gives you more.",
        });
        const over = limitNoticeWords(row, "storageGb", 1, 1.5, "over");
        expect(over.title).toBe(
            "You're past your 1 GB of photos and videos on Plan A",
        );
        expect(over.body).toMatch(
            /^Nothing is blocked: your uploads keep working/,
        );
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

    it("never refuses a row the catalogue marks soft, whatever the caller says", async () => {
        const { meter } = meterFor("free");
        // Plan A's storage is 1 GB, soft: 3 GB in, adding more is counted.
        tx.media.aggregate.mockResolvedValue({
            _sum: { sizeBytes: 3_000_000_000 },
        });
        expect(
            await meter.roomInTx(tx as never, "org", "storage", {
                adding: 0.5,
            }),
        ).toMatchObject({ key: "storageGb", limit: 1, used: 3, adding: 0.5 });
        // Visits: soft and monthly, told once past the cap.
        tx.analyticsDailyAggregate.aggregate.mockResolvedValue({
            _sum: { count: 11 },
        });
        expect(
            await meter.roomInTx(tx as never, "org", "visits", { adding: 2 }),
        ).toMatchObject({ key: "visitsPerMonth", limit: 11, used: 11 });
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                type: PLAN_LIMIT_NOTICE_TYPE,
                organizationId: "org",
                payload: { organizationId: "org", moduleId: "visits" },
            },
        });
    });

    it("refuses a hard row the catalogue doesn't mark soft", async () => {
        const { meter } = meterFor("free");
        tx.site.count.mockResolvedValue(1);
        expect(
            responseOf(
                await meter
                    .roomInTx(tx as never, "org", "sites")
                    .catch((e: unknown) => e),
            ).details,
        ).toMatchObject({ code: "PLAN_LIMIT_REACHED", limitKey: "sites" });
        tx.store.count.mockResolvedValue(1);
        expect(
            responseOf(
                await meter
                    .roomInTx(tx as never, "org", "locations")
                    .catch((e: unknown) => e),
            ).details,
        ).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "shopLocations",
        });
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

    // DEC-103: a setting the plan leaves off stops applying.
    it("says whether a switch row applies, failing safe to included", async () => {
        await expect(
            meterFor("free").meter.isIncluded("org", "roles"),
        ).resolves.toBe(false);
        await expect(
            meterFor("pro").meter.isIncluded("org", "roles"),
        ).resolves.toBe(true);
        // Nothing enforced, or off the catalogue: it applies.
        await expect(
            meterFor("free", false).meter.isIncluded("org", "roles"),
        ).resolves.toBe(true);
        await expect(
            meterFor(null).meter.isIncluded("org", "roles"),
        ).resolves.toBe(true);
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
        tx.membership.findMany.mockResolvedValue([
            { role: "OWNER", extraActions: [], staffMember: null },
            { role: "MEMBER", extraActions: [], staffMember: null },
        ]);
        tx.staffMember.count.mockResolvedValue(0);
        tx.organizationInvitation.findMany.mockResolvedValue([]);
        tx.organizationRole.findMany.mockResolvedValue([]);
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

describe("hasRoom: the connect's check, asked before offering it (DEC-086)", () => {
    // `integrations`: 1 on Plan A, 2 on Plan B, no cap on Plan C.
    function connections(n: number) {
        tx.merchantPaymentProvider.count.mockResolvedValue(n);
        tx.communicationProvider.count.mockResolvedValue(0);
    }

    it("is room when the plan includes it with room for one more", async () => {
        connections(1);
        expect(
            await meterFor("grow").meter.hasRoom("org", "integrations"),
        ).toBe(true);
    });

    it("is no room when the plan leaves it off", async () => {
        const locked = resolveAllAccess({
            catalog: fakeMeteredCatalog((c) => {
                const m = c.modules.find((x) => x.id === "integrations");
                if (m) m.cells.free = { inc: false, off: "locked" };
            }),
            planId: "free",
            now: new Date(),
        });
        const meter = new MeteringService(
            {
                resolve: () =>
                    Promise.resolve({ source: "catalogue", modules: locked }),
            } as unknown as CatalogueAccessService,
            {
                isEnabled: () => Promise.resolve(true),
            } as unknown as FeatureFlagService,
        );
        expect(await meter.hasRoom("org", "integrations")).toBe(false);
        expect(tx.merchantPaymentProvider.count).not.toHaveBeenCalled();
    });

    it("is no room at the cap, as the connect would refuse it", async () => {
        connections(1);
        expect(
            await meterFor("free").meter.hasRoom("org", "integrations"),
        ).toBe(false);
        // Nothing locked, nothing told: it only asks.
        expect(tx.$executeRaw).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("is room with no cap, without counting", async () => {
        expect(await meterFor("pro").meter.hasRoom("org", "integrations")).toBe(
            true,
        );
        expect(tx.merchantPaymentProvider.count).not.toHaveBeenCalled();
    });

    it("is room with enforcement off or off the catalogue: the connect goes ahead", async () => {
        const off = meterFor("free", false);
        expect(await off.meter.hasRoom("org", "integrations")).toBe(true);
        expect(off.resolve).not.toHaveBeenCalled();
        expect(await meterFor(null).meter.hasRoom("org", "integrations")).toBe(
            true,
        );
    });

    it("throws when the plan can't be read, never claiming room", async () => {
        const { meter, resolve } = meterFor("grow");
        resolve.mockRejectedValueOnce(new Error("down"));
        await expect(meter.hasRoom("org", "integrations")).rejects.toThrow(
            "down",
        );
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
        expect(row("products")?.soft).toBe(false);
        expect(row("storage")?.soft).toBe(true);
        expect(row("orders")?.usage).toBeNull();
        expect(row("roles")?.usage).toBeNull();
    });
});

describe("the legacy floor for websites and locations", () => {
    it("stays the floor in the limit map, whatever the catalogue's row says", () => {
        // Plan B sells 2 websites; behind the switch the floor still reads,
        // and metering, not the map, enforces the catalogue's number.
        const map = entitlementMapFor({
            catalog,
            access: rows("grow"),
            planId: "grow",
            legacyRow: null,
        });
        expect(map.sites).toBe(LEGACY_FLOOR_ENTITLEMENTS.sites);
        expect(map.storefronts).toBe(LEGACY_FLOOR_ENTITLEMENTS.storefronts);
        // Other rows still read by id.
        expect(map.locations).toBe(2);
    });
});
