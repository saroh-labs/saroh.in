jest.mock("@saroh/database", () => ({
    prisma: { job: { findMany: jest.fn(), updateMany: jest.fn() } },
}));

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@saroh/database";

import {
    CANCEL_REFUSED,
    cancelJob,
    classifyJobCancels,
    JOB_CANCELLED,
} from "./job-cancel";

const find = prisma.job.findMany as jest.Mock;
const update = prisma.job.updateMany as jest.Mock;

const job = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: "enquiry.notify",
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe("classifyJobCancels (#907)", () => {
    it("cancels only a job that hasn't started or is waiting to retry", async () => {
        find.mockResolvedValue([
            job("fresh"),
            job("retrying", { attempts: 2, lastError: "x" }),
            job("running", { status: "PROCESSING" }),
            job("done", { status: "DONE" }),
            job("failed", { status: "FAILED" }),
            job("again", { status: JOB_CANCELLED }),
        ]);
        const verdicts = await classifyJobCancels([
            "fresh",
            "retrying",
            "running",
            "done",
            "failed",
            "again",
            "gone",
        ]);
        expect(verdicts.map((v) => [v.targetId, v.verdict])).toEqual([
            ["fresh", "act"],
            ["retrying", "act"],
            ["running", "unsafe"],
            ["done", "skip"],
            ["failed", "skip"],
            ["again", "skip"],
            ["gone", "skip"],
        ]);
        expect(verdicts[0]?.detail).toBe(
            "Cancel enquiry.notify before it runs",
        );
        expect(verdicts[1]?.detail).toBe(
            "Cancel enquiry.notify, waiting to retry after 2 of 5 tries",
        );
        expect(update).not.toHaveBeenCalled();
    });

    it.each(Object.keys(CANCEL_REFUSED))(
        "refuses %s: its state lives elsewhere or it restarts itself",
        async (type) => {
            find.mockResolvedValue([job("j", { type })]);
            const [verdict] = await classifyJobCancels(["j"]);
            expect(verdict?.verdict).toBe("unsafe");
        },
    );
});

describe("cancelJob (#907)", () => {
    it("cancels a waiting job, fenced on PENDING", async () => {
        find.mockResolvedValue([job("j")]);
        update.mockResolvedValue({ count: 1 });
        await expect(cancelJob("j")).resolves.toEqual({
            status: "DONE",
            detail: "Cancelled; it will not run",
        });
        expect(update).toHaveBeenCalledWith({
            where: { id: "j", status: "PENDING" },
            data: expect.objectContaining({
                status: JOB_CANCELLED,
                lockedAt: null,
                lockedBy: null,
            }),
        });
    });

    it("says so when a worker claimed it first", async () => {
        find.mockResolvedValue([job("j")]);
        update.mockResolvedValue({ count: 0 });
        await expect(cancelJob("j")).resolves.toEqual({
            status: "SKIPPED",
            detail: "It started before it was cancelled",
        });
    });

    it("classifies again and never writes to a job that started since the dry run", async () => {
        find.mockResolvedValue([job("j", { status: "PROCESSING" })]);
        const outcome = await cancelJob("j");
        expect(outcome.status).toBe("SKIPPED");
        expect(update).not.toHaveBeenCalled();
    });
});

describe("CANCEL_REFUSED names real job types", () => {
    const SRC = join(__dirname, "..", "..");
    const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) return walk(path);
            return entry.name.endsWith(".ts") &&
                !entry.name.endsWith(".spec.ts")
                ? [path]
                : [];
        });
    const exported = new Set<string>();
    for (const path of walk(SRC)) {
        for (const m of readFileSync(path, "utf8").matchAll(
            /export const [A-Z][A-Z0-9_]*_TYPE\s*=\s*"([^"]+)"/g,
        )) {
            exported.add(m[1] as string);
        }
    }

    // A renamed type would make its refusal silently stop applying.
    it.each(Object.keys(CANCEL_REFUSED))(
        "%s is a job type constant",
        (type) => {
            expect(exported.has(type)).toBe(true);
        },
    );
});
