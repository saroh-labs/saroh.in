jest.mock("@saroh/database", () => ({
    prisma: {
        customerSubscription: { count: jest.fn(async () => 0) },
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
        expect(board.checks).toHaveLength(8);
    });
});
