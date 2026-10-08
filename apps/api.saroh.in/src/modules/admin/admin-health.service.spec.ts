const mockPlanRows = {
    live: null as { version: number } | null,
    missing: 0,
    before: 0,
};

jest.mock("@saroh/database", () => ({
    liveCatalogueVersion: jest.fn(async () => mockPlanRows.live),
    catalogueStartedAt: jest.fn(async () => new Date("2026-09-01T00:00:00Z")),
    prisma: {
        customerSubscription: { count: jest.fn(async () => 0) },
        organization: {
            count: jest.fn(async (args: { where: { createdAt?: unknown } }) =>
                args.where.createdAt
                    ? mockPlanRows.before
                    : mockPlanRows.missing,
            ),
        },
        $queryRaw: jest.fn(async () => [
            { migration_name: "20260923120000_admin_console" },
        ]),
    },
}));
jest.mock("../../env", () => ({ env: {} }));

import type { HealthService } from "../health/health.service";
import { AdminHealthService } from "./admin-health.service";
import type { AdminMachineryService } from "./admin-machinery.service";

function build(overrides: { queueThrows?: boolean } = {}) {
    const health = {
        readiness: jest.fn(async () => ({
            status: "ready",
            checks: [{ name: "database", status: "up", durationMs: 3 }],
        })),
    } as unknown as HealthService;
    const queue = jest.fn(async () => {
        if (overrides.queueThrows) throw new Error("queue unreadable");
        return {
            pending: 2,
            processing: 0,
            failed: 0,
            done: 10,
            doneLastDay: 10,
            failedLastDay: 0,
            oldestDueSeconds: 0,
            failedByType: [],
            renewal: null,
        };
    });
    const machinery = {
        queue,
        webhookSummary: jest.fn(async () => ({ total: {}, lastDay: {} })),
        providers: jest.fn(async () => ({
            payments: [],
            messaging: [],
            domains: [],
            waitingDomains: [],
        })),
    } as unknown as AdminMachineryService;
    return new AdminHealthService(health, machinery);
}

describe("AdminHealthService.board", () => {
    it("keeps every check in its fixed place", async () => {
        const board = await build().board();
        expect(board.checks.map((check) => check.key)).toEqual([
            "database",
            "renewals",
            "queue",
            "webhooks",
            "providers",
            "plan-rows",
            "storage",
            "version",
            "signins",
        ]);
    });

    it("says plainly what this instance cannot measure", async () => {
        const board = await build().board();
        const byKey = Object.fromEntries(board.checks.map((c) => [c.key, c]));
        expect(byKey.storage?.state).toBe("unmeasured");
        expect(byKey.signins?.state).toBe("unmeasured");
        expect(byKey.version?.summary).toMatch(/20260923120000_admin_console/);
        // No recurring memberships means no renewal run is expected.
        expect(byKey.renewals?.state).toBe("unmeasured");
    });

    it("does not blank the board when one check fails", async () => {
        const board = await build({ queueThrows: true }).board();
        const byKey = Object.fromEntries(board.checks.map((c) => [c.key, c]));
        expect(byKey.queue).toEqual(
            expect.objectContaining({
                state: "failed",
                summary: expect.stringMatching(/queue unreadable/),
            }),
        );
        expect(byKey.database?.state).toBe("ok");
        expect(board.checks).toHaveLength(9);
    });

    describe("plan rows (#839)", () => {
        afterEach(() => {
            mockPlanRows.live = null;
            mockPlanRows.missing = 0;
            mockPlanRows.before = 0;
        });

        async function planCheck() {
            const board = await build().board();
            return board.checks.find((c) => c.key === "plan-rows");
        }

        it("is not measured before any pricing version is live", async () => {
            await expect(planCheck()).resolves.toMatchObject({
                state: "unmeasured",
            });
        });

        it("is green when every business is on a plan row", async () => {
            mockPlanRows.live = { version: 2 };
            await expect(planCheck()).resolves.toMatchObject({ state: "ok" });
        });

        it("counts the businesses plan rules skip, and who is waiting on what", async () => {
            mockPlanRows.live = { version: 2 };
            mockPlanRows.missing = 3;
            mockPlanRows.before = 2;
            const check = await planCheck();
            expect(check?.state).toBe("warn");
            expect(check?.summary).toMatch(/^3 businesses on no plan row/);
            expect(check?.summary).toMatch(/2 joined before pricing existed/);
            expect(check?.summary).toMatch(/1 joined since/);
            expect(check?.action?.consoleHref).toBe(
                "/operations/jobs?type=billing.free-rows.start",
            );
        });

        it("points nowhere when only older businesses wait on the backfills", async () => {
            mockPlanRows.live = { version: 2 };
            mockPlanRows.missing = 1;
            mockPlanRows.before = 1;
            const check = await planCheck();
            expect(check?.state).toBe("warn");
            expect(check?.action).toBeUndefined();
        });
    });
});
