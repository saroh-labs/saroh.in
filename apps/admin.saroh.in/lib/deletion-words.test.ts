import { describe, expect, it } from "vitest";

import type { TrailRowLike } from "./deletion-words";
import {
    formatMinor,
    refundStage,
    trailDetail,
    trailTitle,
} from "./deletion-words";

const row = (extra: Partial<TrailRowLike>): TrailRowLike => ({
    action: "organization.deleted",
    outcome: "SUCCESS",
    reason: null,
    actor: null,
    actorUserId: "system:organization-deletion",
    refunds: null,
    steps: null,
    ...extra,
});

describe("deletion trail words (#921)", () => {
    it("names each step of a deletion", () => {
        expect(trailTitle(row({}))).toBe("Deleted");
        expect(
            trailTitle(
                row({ action: "organization.deletion.waiting_on_refunds" }),
            ),
        ).toBe("Waiting on refunds");
        expect(
            trailTitle(
                row({
                    action: "organization.deletion.cleanup",
                    outcome: "FAILURE",
                }),
            ),
        ).toBe("Clean-up unfinished");
        expect(
            trailTitle(row({ action: "organization.deletion.cleanup" })),
        ).toBe("Clean-up finished");
    });

    it("says how many refunds a run waited on, and what is owed", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.waiting_on_refunds",
                    refunds: { count: 2, owedMinorByCurrency: { INR: 62_000 } },
                }),
            ),
        ).toBe("2 refunds still owed to customers · ₹620.00");
    });

    it("says how each clean-up step went", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.cleanup",
                    steps: [
                        { step: "billing", result: "ok" },
                        { step: "keys", result: "failed" },
                    ],
                }),
            ),
        ).toBe("Saroh billing: done · Payment and messaging keys: failed");
    });

    it("says who did an operator's step, and why", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.scheduled",
                    reason: "Owner asked",
                    actor: "Priya",
                    actorUserId: "u1",
                }),
            ),
        ).toBe("Owner asked · Priya");
        expect(trailDetail(row({}))).toBe("Saroh, automatically");
    });

    it("words where a refund stands, and its amount", () => {
        expect(refundStage("CONFIRMING")).toBe("Sent, not confirmed");
        expect(formatMinor(45_000, "INR")).toBe("₹450.00");
        expect(formatMinor(null, "INR")).toBe("—");
    });
});
