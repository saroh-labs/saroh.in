// #860: custom domains are re-checked in the background — often until
// live, daily after — through the same check as "Check now". DB-free:
// @saroh/database is mocked over an in-memory table, the host is a
// FakeDomainHosting and DNS a FakeDomainVerifier.
jest.mock("@saroh/database", () => ({
    prisma: {
        domain: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        site: { update: jest.fn() },
        job: { create: jest.fn(), count: jest.fn() },
    },
}));

jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: undefined }));

import { Logger } from "@nestjs/common";
import type { Domain, Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import type { EntitlementService } from "../billing/entitlement.service";
import { HOSTING_WORDS } from "./domain-hosting-sync";
import {
    DOMAIN_RECHECK_BATCH,
    DOMAIN_RECHECK_EVERY_MS,
    DOMAIN_RECHECK_MAX_HOST_FAILURES,
    nextRecheckAt,
    RECHECK_LIVE_MS,
    RECHECK_SLOW_MS,
    recheckDue,
} from "./domain-recheck";
import {
    DOMAIN_RECHECK_TYPE,
    DomainRecheckHandler,
} from "./domain-recheck.handler";
import { FakeDomainVerifier } from "./domain-verifier";
import { DomainsService } from "./domains.service";
import { FakeDomainHosting } from "./providers/fake-hosting";

const mutableEnv = env as Record<string, string | undefined>;
const findMany = prisma.domain.findMany as jest.Mock;
const findUnique = prisma.domain.findUnique as jest.Mock;
const update = prisma.domain.update as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;

const NOW = new Date("2026-10-09T10:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
    return new Date(NOW.getTime() - ms);
}

let seq = 0;
function row(over: Partial<Domain> = {}): Domain {
    seq += 1;
    return {
        id: `dom_${seq}`,
        organizationId: "org_1",
        hostname: `shop${seq}.acme.com`,
        siteId: null,
        status: "VERIFIED",
        verificationToken: "tok",
        verificationMethod: "DNS_TXT",
        verifiedAt: ago(2 * DAY),
        lastCheckedAt: null,
        lastCheckResult: null,
        hostingId: null,
        hostingStatus: null,
        hostingError: null,
        hostingCheckedAt: null,
        createdAt: ago(3 * DAY),
        updatedAt: ago(DAY),
        ...over,
    } as Domain;
}

/** The domain table, as the mocked prisma sees it. */
let table: Map<string, Domain>;

function seed(...rows: Domain[]): void {
    for (const r of rows) table.set(r.id, r);
}

function setup(hostingOn = true) {
    const hosting = new FakeDomainHosting();
    const verifier = new FakeDomainVerifier();
    const service = new DomainsService(
        verifier,
        { can: jest.fn() } as unknown as EntitlementService,
        hostingOn ? hosting : null,
    );
    const handler = new DomainRecheckHandler(
        service,
        hostingOn ? hosting : null,
    );
    return { hosting, verifier, service, handler };
}

describe("the re-check ladder", () => {
    it("checks a verified, never-checked domain at once", () => {
        expect(recheckDue(row(), NOW)).toBe(true);
    });

    it("asks a not-live domain every 5 minutes in its first hour", () => {
        const fresh = row({
            verifiedAt: ago(20 * MIN),
            hostingStatus: "PENDING",
            hostingCheckedAt: ago(4 * MIN),
        });
        expect(recheckDue(fresh, NOW)).toBe(false);
        expect(
            recheckDue({ ...fresh, hostingCheckedAt: ago(5 * MIN) }, NOW),
        ).toBe(true);
    });

    it("then hourly up to a day, then every 6 hours", () => {
        const hours = row({
            verifiedAt: ago(3 * HOUR),
            hostingStatus: "PENDING",
            hostingCheckedAt: ago(30 * MIN),
        });
        expect(recheckDue(hours, NOW)).toBe(false);
        expect(recheckDue({ ...hours, hostingCheckedAt: ago(HOUR) }, NOW)).toBe(
            true,
        );

        const days = row({
            verifiedAt: ago(3 * DAY),
            hostingStatus: "FAILED",
            hostingCheckedAt: ago(2 * HOUR),
        });
        expect(nextRecheckAt(days, NOW)).toEqual(
            new Date(ago(2 * HOUR).getTime() + RECHECK_SLOW_MS),
        );
    });

    it("asks a live domain once a day", () => {
        const live = row({
            verifiedAt: ago(10 * MIN),
            hostingStatus: "ACTIVE",
            hostingCheckedAt: ago(5 * MIN),
        });
        expect(nextRecheckAt(live, NOW)).toEqual(
            new Date(ago(5 * MIN).getTime() + RECHECK_LIVE_MS),
        );
        expect(recheckDue({ ...live, hostingCheckedAt: ago(DAY) }, NOW)).toBe(
            true,
        );
    });

    it("checks an unverified claim on the same ladder, and stops after 7 days", () => {
        const claim = row({
            status: "PENDING",
            verifiedAt: null,
            createdAt: ago(30 * MIN),
            lastCheckedAt: ago(6 * MIN),
        });
        expect(recheckDue(claim, NOW)).toBe(true);
        expect(recheckDue({ ...claim, createdAt: ago(7 * DAY) }, NOW)).toBe(
            false,
        );
    });
});

describe("DomainRecheckHandler", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.useFakeTimers({ now: NOW });
        for (const key of Object.keys(mutableEnv)) delete mutableEnv[key];
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
        table = new Map();
        findMany.mockImplementation(
            ({ where }: { where: { status: string } }) =>
                Promise.resolve(
                    [...table.values()].filter(
                        (d) => d.status === where.status,
                    ),
                ),
        );
        update.mockImplementation(
            ({
                where,
                data,
            }: {
                where: { id: string };
                data: Partial<Domain>;
            }) => {
                const found = table.get(where.id);
                if (!found) {
                    return Promise.reject(
                        Object.assign(new Error("gone"), { code: "P2025" }),
                    );
                }
                const next = { ...found, ...data } as Domain;
                table.set(where.id, next);
                return Promise.resolve(next);
            },
        );
        jobCreate.mockResolvedValue({});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const job = { id: "job_1", payload: {} } as unknown as Job;

    function nextRuns() {
        return jobCreate.mock.calls
            .map(
                ([arg]) =>
                    (arg as { data: { type: string; runAt: Date } }).data,
            )
            .filter((d) => d.type === DOMAIN_RECHECK_TYPE);
    }

    it("registers a verified domain the host doesn't have yet, then queues its next run", async () => {
        const { handler, hosting } = setup();
        const domain = row();
        seed(domain);

        await handler.handle(job);

        expect(hosting.calls).toEqual([
            { op: "register", arg: domain.hostname },
        ]);
        expect(table.get(domain.id)).toMatchObject({
            hostingId: "ch_1",
            hostingStatus: "PENDING",
            hostingCheckedAt: NOW,
        });
        expect(nextRuns()).toEqual([
            {
                type: DOMAIN_RECHECK_TYPE,
                payload: {},
                runAt: new Date(NOW.getTime() + DOMAIN_RECHECK_EVERY_MS),
            },
        ]);
    });

    it("notices a live domain that stopped pointing here", async () => {
        const { handler, hosting } = setup();
        const made = await hosting.register("shop.acme.com");
        hosting.set(made.id, "FAILED", "BLOCKED");
        const domain = row({
            hostname: "shop.acme.com",
            hostingId: made.id,
            hostingStatus: "ACTIVE",
            hostingCheckedAt: ago(DAY),
        });
        seed(domain);

        const summary = await handler.sweep(NOW);

        expect(summary).toMatchObject({ checked: 1, wentDown: 1 });
        expect(table.get(domain.id)).toMatchObject({
            hostingStatus: "FAILED",
            hostingError: HOSTING_WORDS.blocked,
        });
    });

    it("leaves a domain alone until its turn", async () => {
        const { handler, hosting } = setup();
        seed(
            row({
                hostingId: "ch_9",
                hostingStatus: "ACTIVE",
                hostingCheckedAt: ago(HOUR),
            }),
        );

        const summary = await handler.sweep(NOW);

        expect(summary.checked).toBe(0);
        expect(hosting.calls).toEqual([]);
    });

    it("verifies a claim whose TXT record has appeared", async () => {
        const { handler, verifier } = setup();
        verifier.setShouldPass(true);
        const claim = row({
            status: "PENDING",
            verifiedAt: null,
            createdAt: ago(10 * MIN),
        });
        seed(claim);

        await handler.sweep(NOW);

        expect(table.get(claim.id)).toMatchObject({
            status: "VERIFIED",
            verifiedAt: NOW,
            hostingStatus: "PENDING",
        });
    });

    it("checks the oldest first and at most a batch per run", async () => {
        const { handler, hosting } = setup();
        const rows = Array.from({ length: DOMAIN_RECHECK_BATCH + 5 }, (_, i) =>
            row({
                hostingCheckedAt: ago(DAY + i * MIN),
                hostingStatus: "ACTIVE",
            }),
        );
        seed(...rows);

        const summary = await handler.sweep(NOW);

        expect(summary.checked).toBe(DOMAIN_RECHECK_BATCH);
        expect(hosting.calls[0]).toEqual({
            op: "register",
            arg: rows[rows.length - 1].hostname,
        });
    });

    it("backs off when the host keeps failing, leaving the rest for the next run", async () => {
        const { handler, hosting } = setup();
        hosting.fail("register");
        seed(row(), row(), row(), row(), row());

        const summary = await handler.sweep(NOW);

        expect(summary).toMatchObject({
            checked: DOMAIN_RECHECK_MAX_HOST_FAILURES,
            hostBackedOff: true,
        });
        expect(hosting.calls).toHaveLength(DOMAIN_RECHECK_MAX_HOST_FAILURES);
        // The verification stands; the failure is on the row in words.
        expect([...table.values()][0]).toMatchObject({
            status: "VERIFIED",
            hostingStatus: "REGISTER_FAILED",
            hostingError: HOSTING_WORDS.unreachable,
        });
    });

    it("keeps going past a domain that fails, and still queues its next run", async () => {
        const { handler } = setup();
        const bad = row({
            hostingCheckedAt: ago(3 * DAY),
            hostingStatus: "ACTIVE",
        });
        const good = row({
            hostingCheckedAt: ago(2 * DAY),
            hostingStatus: "ACTIVE",
        });
        seed(bad, good);
        update.mockImplementationOnce(() =>
            Promise.reject(new Error("db blip")),
        );

        await handler.handle(job);

        expect(table.get(good.id)?.hostingCheckedAt).toEqual(NOW);
        expect(nextRuns()).toHaveLength(1);
    });

    it("deletes a hostname it registered again for a domain removed mid-check", async () => {
        const { handler, hosting } = setup();
        const domain = row();
        // Not in the table: the merchant removed it after the run read it.
        findMany.mockResolvedValueOnce([domain]).mockResolvedValueOnce([]);
        findUnique.mockResolvedValue(null);

        const summary = await handler.sweep(NOW);

        expect(summary.failed).toBe(1);
        expect(hosting.calls).toEqual([
            { op: "register", arg: domain.hostname },
            { op: "remove", arg: domain.hostname },
        ]);
        expect(hosting.hostnames.size).toBe(0);
    });

    it("still queues its next run when the sweep can't read, and throws when it can't queue", async () => {
        const { handler } = setup();
        findMany.mockRejectedValue(new Error("db down"));
        await handler.handle(job);
        expect(nextRuns()).toHaveLength(1);

        jobCreate.mockRejectedValue(new Error("db down"));
        await expect(handler.handle(job)).rejects.toThrow(
            /next domain re-check/,
        );
    });

    it("treats an already-waiting run as scheduled (P2002)", async () => {
        const { handler } = setup();
        jobCreate.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(handler.schedule(NOW)).resolves.toBe(true);
    });

    describe("with hosting off (no Cloudflare token: dev, local)", () => {
        it("is disabled, checks nothing and ends the chain quietly", async () => {
            const { handler } = setup(false);
            seed(row());

            expect(handler.enabled()).toBe(false);
            await handler.handle(job);

            expect(findMany).not.toHaveBeenCalled();
            expect(nextRuns()).toEqual([]);
        });

        it("never starts the chain", async () => {
            const { handler } = setup(false);
            await handler.ensureScheduled(NOW);
            expect(jobCount).not.toHaveBeenCalled();
            expect(jobCreate).not.toHaveBeenCalled();
        });
    });

    it("starts the chain when nothing is waiting or running", async () => {
        const { handler } = setup();
        jobCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

        await handler.ensureScheduled(NOW);
        await handler.ensureScheduled(NOW);

        expect(nextRuns()).toEqual([
            { type: DOMAIN_RECHECK_TYPE, payload: {}, runAt: NOW },
        ]);
    });
});
