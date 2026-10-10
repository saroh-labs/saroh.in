// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => {
    const table = () => ({ findMany: jest.fn(), deleteMany: jest.fn() });
    return {
        prisma: {
            session: table(),
            customerSession: table(),
            customerSignInCode: table(),
            auditLog: table(),
            secretAccessLog: table(),
            // The audit trails: never pruned.
            auditEvent: table(),
            adminAuditEvent: table(),
            adminAccessSession: table(),
            organization: { findMany: jest.fn() },
            membership: { findMany: jest.fn() },
            job: { create: jest.fn(), count: jest.fn() },
        },
    };
});

import { Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    SECURITY_LOG_BATCH,
    SECURITY_LOG_MAX_BATCHES,
    SECURITY_LOG_RETENTION_BACKLOG_MS,
    SECURITY_LOG_RETENTION_EVERY_MS,
    SECURITY_LOG_RETENTION_TYPE,
    SECURITY_LOG_TABLES,
    SecurityLogRetentionHandler,
} from "./security-log-retention.handler";

/**
 * The daily security log sweep (DEC-119): rows a year past their end go,
 * in batches; the audit trails never do; a business on legal hold keeps
 * its rows; and the chain reschedules itself.
 */
const mock = (fn: unknown) => fn as jest.Mock;
const held = mock(prisma.organization.findMany);
const members = mock(prisma.membership.findMany);
const jobCreate = mock(prisma.job.create);
const jobCount = mock(prisma.job.count);

const TABLES = [
    prisma.session,
    prisma.customerSession,
    prisma.customerSignInCode,
    prisma.auditLog,
    prisma.secretAccessLog,
];

const NOW = new Date("2027-10-10T03:00:00.000Z");
const CUTOFF = new Date("2026-10-10T03:00:00.000Z");

const run = () => ({ id: "job_1", payload: {} }) as unknown as Job;
const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

function nextRun(): Date | undefined {
    const call = jobCreate.mock.calls.find(
        ([arg]) =>
            (arg as { data: { type: string } }).data.type ===
            SECURITY_LOG_RETENTION_TYPE,
    );
    return (call?.[0] as { data: { runAt: Date } } | undefined)?.data.runAt;
}

describe("SecurityLogRetentionHandler (DEC-119)", () => {
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        jest.resetAllMocks();
        jest.useFakeTimers({ now: NOW, advanceTimers: true });
        jobCreate.mockResolvedValue({});
        held.mockResolvedValue([]);
        members.mockResolvedValue([]);
        for (const table of TABLES) {
            mock(table.findMany).mockResolvedValue([]);
            mock(table.deleteMany).mockResolvedValue({ count: 0 });
        }
        log = jest.spyOn(Logger.prototype, "log").mockImplementation();
        error = jest.spyOn(Logger.prototype, "error").mockImplementation();
    });

    afterEach(() => {
        jest.useRealTimers();
        log.mockRestore();
        error.mockRestore();
    });

    it("prunes exactly the security log tables", () => {
        expect(SECURITY_LOG_TABLES).toEqual([
            "Session",
            "CustomerSession",
            "CustomerSignInCode",
            "AuditLog",
            "SecretAccessLog",
        ]);
    });

    it("deletes sign-in sessions a year after they ended, never a live one", async () => {
        mock(prisma.session.findMany).mockResolvedValueOnce(ids(2));
        mock(prisma.session.deleteMany).mockResolvedValueOnce({ count: 2 });

        const swept = await new SecurityLogRetentionHandler().sweep(NOW);

        expect(mock(prisma.session.findMany).mock.calls[0][0]).toEqual({
            where: { expiresAt: { lt: CUTOFF } },
            select: { id: true },
            orderBy: { expiresAt: "asc" },
            take: SECURITY_LOG_BATCH,
        });
        // The delete names the batch's ids and re-checks the date.
        expect(mock(prisma.session.deleteMany).mock.calls[0][0]).toEqual({
            where: { expiresAt: { lt: CUTOFF }, id: { in: ["r0", "r1"] } },
        });
        expect(swept.deleted.Session).toBe(2);
        expect(swept.more).toBe(false);
    });

    it("dates each table by when the row ended", async () => {
        await new SecurityLogRetentionHandler().sweep(NOW);
        expect(
            mock(prisma.customerSession.findMany).mock.calls[0][0].where,
        ).toEqual({ expiresAt: { lt: CUTOFF } });
        for (const table of [
            prisma.customerSignInCode,
            prisma.auditLog,
            prisma.secretAccessLog,
        ]) {
            expect(mock(table.findMany).mock.calls[0][0].where).toEqual({
                createdAt: { lt: CUTOFF },
            });
        }
    });

    it("never touches the audit trails or support-access sessions", async () => {
        for (const table of TABLES) {
            mock(table.findMany).mockResolvedValueOnce(ids(1));
            mock(table.deleteMany).mockResolvedValueOnce({ count: 1 });
        }
        await new SecurityLogRetentionHandler().handle(run());
        for (const kept of [
            prisma.auditEvent,
            prisma.adminAuditEvent,
            prisma.adminAccessSession,
        ]) {
            expect(kept.findMany).not.toHaveBeenCalled();
            expect(kept.deleteMany).not.toHaveBeenCalled();
        }
    });

    it("leaves a held business's rows, and its members' sign-in sessions", async () => {
        held.mockResolvedValue([{ id: "org_held" }]);
        members.mockResolvedValue([{ userId: "u_1" }, { userId: "u_2" }]);
        for (const table of TABLES) {
            mock(table.findMany).mockResolvedValueOnce(ids(1));
            mock(table.deleteMany).mockResolvedValueOnce({ count: 1 });
        }

        await new SecurityLogRetentionHandler().sweep(NOW);

        expect(members).toHaveBeenCalledWith({
            where: { organizationId: { in: ["org_held"] } },
            select: { userId: true },
            distinct: ["userId"],
        });
        const sessionWhere = {
            expiresAt: { lt: CUTOFF },
            userId: { notIn: ["u_1", "u_2"] },
        };
        expect(mock(prisma.session.findMany).mock.calls[0][0].where).toEqual(
            sessionWhere,
        );
        expect(mock(prisma.session.deleteMany).mock.calls[0][0].where).toEqual({
            ...sessionWhere,
            id: { in: ["r0"] },
        });
        const notHeld = { organizationId: { notIn: ["org_held"] } };
        for (const table of [
            prisma.customerSession,
            prisma.customerSignInCode,
        ]) {
            expect(mock(table.findMany).mock.calls[0][0].where).toEqual(
                expect.objectContaining(notHeld),
            );
            expect(mock(table.deleteMany).mock.calls[0][0].where).toEqual(
                expect.objectContaining(notHeld),
            );
        }
        const notHeldStore = {
            NOT: { store: { organizationId: { in: ["org_held"] } } },
        };
        for (const table of [prisma.auditLog, prisma.secretAccessLog]) {
            expect(mock(table.findMany).mock.calls[0][0].where).toEqual(
                expect.objectContaining(notHeldStore),
            );
            expect(mock(table.deleteMany).mock.calls[0][0].where).toEqual(
                expect.objectContaining(notHeldStore),
            );
        }
    });

    it("stops a table at its cap and comes back in a minute", async () => {
        mock(prisma.session.findMany).mockResolvedValue(
            ids(SECURITY_LOG_BATCH),
        );
        mock(prisma.session.deleteMany).mockResolvedValue({
            count: SECURITY_LOG_BATCH,
        });

        await new SecurityLogRetentionHandler().handle(run());

        expect(prisma.session.findMany).toHaveBeenCalledTimes(
            SECURITY_LOG_MAX_BATCHES,
        );
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + SECURITY_LOG_RETENTION_BACKLOG_MS),
        );
        // Counts only: no user, address or business.
        expect(log).toHaveBeenCalledWith(
            `security_logs_retention deleted=${SECURITY_LOG_BATCH * SECURITY_LOG_MAX_BATCHES} Session=${SECURITY_LOG_BATCH * SECURITY_LOG_MAX_BATCHES} CustomerSession=0 CustomerSignInCode=0 AuditLog=0 SecretAccessLog=0 more=true`,
        );
    });

    it("stops when a batch deletes nothing, rather than fetching it for ever", async () => {
        mock(prisma.session.findMany).mockResolvedValue(
            ids(SECURITY_LOG_BATCH),
        );
        mock(prisma.session.deleteMany).mockResolvedValue({ count: 0 });
        const swept = await new SecurityLogRetentionHandler().sweep(NOW);
        expect(prisma.session.findMany).toHaveBeenCalledTimes(1);
        expect(swept.more).toBe(false);
    });

    it("says nothing when nothing is due, and comes back in a day", async () => {
        await new SecurityLogRetentionHandler().handle(run());
        expect(log).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + SECURITY_LOG_RETENTION_EVERY_MS),
        );
    });

    it("keeps the chain going when the sweep fails", async () => {
        held.mockRejectedValue(new Error("db down"));
        await new SecurityLogRetentionHandler().handle(run());
        expect(error).toHaveBeenCalled();
        expect(nextRun()).toBeDefined();
    });

    it("takes a run already waiting as scheduled, and throws when none can be left", async () => {
        const handler = new SecurityLogRetentionHandler();
        jobCreate.mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(handler.schedule(NOW)).resolves.toBe(true);
        jobCreate.mockRejectedValue(new Error("db down"));
        await expect(handler.handle(run())).rejects.toThrow(
            "Could not schedule the next security log retention sweep",
        );
    });

    it("restarts the chain only when nothing is waiting or running", async () => {
        const handler = new SecurityLogRetentionHandler();
        jobCount.mockResolvedValueOnce(1);
        await handler.ensureScheduled(NOW);
        expect(jobCreate).not.toHaveBeenCalled();
        jobCount.mockResolvedValueOnce(0);
        await handler.ensureScheduled(NOW);
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: SECURITY_LOG_RETENTION_TYPE,
                payload: {},
                runAt: NOW,
            },
        });
    });
});
