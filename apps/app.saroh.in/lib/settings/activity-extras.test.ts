import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { activityLine } from "./activity";
import { activityDetail } from "./activity-detail";

const event = (metadata: unknown): AuditEventRow => ({
    id: "e1",
    action: "membership.extras.update",
    actorUserId: "u1",
    targetType: "membership",
    targetId: "u2",
    outcome: "SUCCESS",
    metadata,
    createdAt: "2026-09-28T10:00:00.000Z",
    actor: { name: "Priya", email: "priya@example.in", role: "OWNER" },
    target: { name: "Ravi", email: "ravi@example.in", role: "MEMBER" },
});

describe("Activity: a person's extra permissions (F17)", () => {
    it("says what was given, naming who gave it", () => {
        const line = activityLine(
            event({ givenLabels: ["Refund orders"], takenLabels: [] }),
        );
        expect(line?.who).toBe("Priya");
        expect(line?.what).toBe("gave Ravi Refund orders");
        expect(line?.where.label).toBe("Team");
    });

    it("says what was taken away", () => {
        expect(
            activityLine(
                event({ givenLabels: [], takenLabels: ["See invoices"] }),
            )?.what,
        ).toBe("took See invoices away from Ravi");
    });

    it("says both, and never a code", () => {
        const line = activityLine(
            event({
                given: ["order:refund"],
                givenLabels: ["Refund orders"],
                takenLabels: ["See invoices", "Export orders"],
            }),
        );
        expect(line?.what).toBe(
            "changed Ravi’s extra permissions: gave Refund orders, took away See invoices and Export orders",
        );
        expect(line?.what).not.toContain("order:");
    });

    it("lists Given and Taken away in the detail sheet", () => {
        const detail = activityDetail(
            event({
                givenLabels: ["Refund orders"],
                takenLabels: ["See invoices"],
            }),
            "Asia/Kolkata",
        );
        expect(detail.changes).toEqual([
            { label: "Given", before: null, after: "Refund orders" },
            { label: "Taken away", before: null, after: "See invoices" },
        ]);
    });
});
