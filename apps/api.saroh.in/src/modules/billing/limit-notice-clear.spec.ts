// UX-041: a plan limit notice that no longer stands leaves the inbox, with
// its claim, so crossing the line again tells the business again.
const tx = {
    notification: { deleteMany: jest.fn() },
    customerNotice: { deleteMany: jest.fn() },
};
jest.mock("@saroh/database", () => ({
    prisma: {
        customerNotice: { findMany: jest.fn() },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
}));
jest.mock("./metering.service", () => ({ planMeter: {} }));
jest.mock("../bookings/staff-availability", () => ({
    businessTimezone: jest.fn(),
}));

import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { ClearDeps } from "./limit-notice-clear";
import {
    clearStaleLimitNotices,
    limitNoticeCleared,
    parseLimitNoticeKey,
} from "./limit-notice-clear";

const findMany = prisma.customerNotice.findMany as jest.Mock;
const NOW = new Date("2026-10-07T06:00:00Z");

function row(over: Partial<ModuleAccess> = {}): ModuleAccess {
    return {
        moduleId: "team",
        state: "on",
        limit: 2,
        per: null,
        soft: false,
        ...over,
    } as ModuleAccess;
}

function deps(over: Partial<ClearDeps> = {}): ClearDeps {
    return {
        row: jest.fn().mockResolvedValue(row()),
        used: jest.fn().mockResolvedValue(1),
        zone: jest.fn().mockResolvedValue("Asia/Kolkata"),
        ...over,
    };
}

beforeEach(() => jest.clearAllMocks());

describe("reading a told notice's key", () => {
    it("reads the row, level, limit and window", () => {
        expect(parseLimitNoticeKey("plan-limit:team:full:2:all")).toEqual({
            moduleId: "team",
            level: "full",
            limit: 2,
            window: "all",
        });
        expect(parseLimitNoticeKey("plan-limit:team:loud:2:all")).toBeNull();
        expect(parseLimitNoticeKey("team:order:1")).toBeNull();
    });
});

describe("whether a notice still stands", () => {
    const told = parseLimitNoticeKey("plan-limit:team:full:2:all")!;

    it("stands while the count is at the line it was told at", () => {
        expect(
            limitNoticeCleared(told, { limit: 2, used: 2, window: "all" }),
        ).toBe(false);
    });

    it("clears when the team is back under its cap", () => {
        expect(
            limitNoticeCleared(told, { limit: 2, used: 1, window: "all" }),
        ).toBe(true);
    });

    it("clears when the plan's limit changed, or the row is uncapped", () => {
        expect(
            limitNoticeCleared(told, { limit: 5, used: 2, window: "all" }),
        ).toBe(true);
        expect(
            limitNoticeCleared(told, { limit: null, used: 2, window: "all" }),
        ).toBe(true);
    });

    it("clears a monthly notice once its month is over", () => {
        const month = parseLimitNoticeKey(
            "plan-limit:bookings:warn:10:2026-09",
        )!;
        expect(
            limitNoticeCleared(month, {
                limit: 10,
                used: 9,
                window: "2026-10",
            }),
        ).toBe(true);
    });
});

describe("clearing the inbox", () => {
    it("deletes a stale notice and its claim, and keeps one that stands", async () => {
        findMany.mockResolvedValue([
            {
                id: "cn_team",
                eventKey: "plan-limit:team:full:2:all",
                notificationId: "ntf_team",
            },
            {
                id: "cn_products",
                eventKey: "plan-limit:products:full:10:all",
                notificationId: "ntf_products",
            },
        ]);
        const d = deps({
            row: jest.fn((_org: string, moduleId: string) =>
                Promise.resolve(
                    row({ moduleId, limit: moduleId === "team" ? 2 : 10 }),
                ),
            ),
            used: jest.fn((_org: string, moduleId: string) =>
                Promise.resolve(moduleId === "team" ? 1 : 10),
            ),
        });

        await expect(clearStaleLimitNotices("org_1", NOW, d)).resolves.toBe(1);
        expect(tx.notification.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", id: { in: ["ntf_team"] } },
        });
        expect(tx.customerNotice.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", id: { in: ["cn_team"] } },
        });
    });

    it("touches nothing when every notice stands, or there are none", async () => {
        findMany.mockResolvedValue([]);
        await expect(
            clearStaleLimitNotices("org_1", NOW, deps()),
        ).resolves.toBe(0);
        findMany.mockResolvedValue([
            {
                id: "cn_team",
                eventKey: "plan-limit:team:full:2:all",
                notificationId: "ntf_team",
            },
        ]);
        await clearStaleLimitNotices(
            "org_1",
            NOW,
            deps({ used: jest.fn().mockResolvedValue(2) }),
        );
        expect(tx.notification.deleteMany).not.toHaveBeenCalled();
    });

    it("a lookup that fails leaves the inbox as it is, and never throws", async () => {
        findMany.mockResolvedValue([
            {
                id: "cn_team",
                eventKey: "plan-limit:team:full:2:all",
                notificationId: "ntf_team",
            },
        ]);
        await expect(
            clearStaleLimitNotices(
                "org_1",
                NOW,
                deps({ row: jest.fn().mockRejectedValue(new Error("down")) }),
            ),
        ).resolves.toBe(0);
        expect(tx.notification.deleteMany).not.toHaveBeenCalled();
    });
});
