import { parseEnv } from "../../env";
import {
    RETENTION_AFTER_DELETION_DAYS,
    retentionAfterDeletionDays,
    retentionCutoff,
    retentionEndsAt,
    SECURITY_LOG_RETENTION_DAYS,
    securityLogCutoff,
} from "./retention";

/**
 * How long Saroh keeps things (DEC-122): the two numbers the Privacy Policy
 * states. A change here is a change to a published promise.
 */
describe("retention after deletion", () => {
    it("is 180 days, as the Privacy Policy says", () => {
        expect(RETENTION_AFTER_DELETION_DAYS).toBe(180);
        expect(retentionAfterDeletionDays(undefined)).toBe(180);
    });

    it("can be lengthened by the environment, never shortened", () => {
        expect(retentionAfterDeletionDays(365)).toBe(365);
        expect(retentionAfterDeletionDays("200")).toBe(200);
        // Under SKIP_ENV_VALIDATION nothing checks the value first.
        expect(retentionAfterDeletionDays("30")).toBe(180);
        expect(retentionAfterDeletionDays(0)).toBe(180);
        expect(retentionAfterDeletionDays(-5)).toBe(180);
        expect(retentionAfterDeletionDays("soon")).toBe(180);
        expect(retentionAfterDeletionDays("180.5")).toBe(180);
    });

    it("is refused at boot when the environment sets it below 180", () => {
        const base = { DATABASE_URL: "postgresql://x@localhost/x" };
        const low = parseEnv({ ...base, RETENTION_AFTER_DELETION_DAYS: "30" });
        expect(low.success).toBe(false);
        const ok = parseEnv({ ...base, RETENTION_AFTER_DELETION_DAYS: "365" });
        if (ok.success) {
            expect(ok.data.RETENTION_AFTER_DELETION_DAYS).toBe(365);
        } else {
            // Another variable this machine lacks; ours is not the issue.
            expect(
                ok.error.issues.map((issue) => issue.path.join(".")),
            ).not.toContain("RETENTION_AFTER_DELETION_DAYS");
        }
    });

    it("ends 180 days after the business was deleted", () => {
        const deleted = new Date("2026-10-10T08:00:00.000Z");
        expect(retentionEndsAt(deleted, 180).toISOString()).toBe(
            "2027-04-08T08:00:00.000Z",
        );
    });

    it("makes a business due exactly when its retention has ended", () => {
        const now = new Date("2027-04-08T08:00:00.000Z");
        const cutoff = retentionCutoff(now, 180);
        expect(cutoff.toISOString()).toBe("2026-10-10T08:00:00.000Z");
        // Deleted at the cutoff: due. A second later: not yet.
        const due = (deletedAt: Date) =>
            deletedAt.getTime() <= cutoff.getTime();
        expect(due(new Date("2026-10-10T08:00:00.000Z"))).toBe(true);
        expect(due(new Date("2026-10-10T08:00:01.000Z"))).toBe(false);
    });
});

describe("security log retention", () => {
    it("is one year, as the Privacy Policy says", () => {
        expect(SECURITY_LOG_RETENTION_DAYS).toBe(365);
    });

    it("cuts off a year before now", () => {
        expect(
            securityLogCutoff(
                new Date("2027-10-10T00:00:00.000Z"),
            ).toISOString(),
        ).toBe("2026-10-10T00:00:00.000Z");
    });
});
