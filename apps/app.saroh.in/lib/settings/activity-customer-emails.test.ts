/**
 * Settings › Activity tells a change to one of the business's automatic
 * customer emails (DEC-174, U4 #1135): the audit row the API writes as
 * `customer-notices.setting`, with the kind and on or off as it was and
 * became. The line opens Settings › Providers, where the switch is.
 */
import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { ACTIVITY_ACTIONS, activityLine } from "./activity";
import { activityDetail } from "./activity-detail";

const priya = { name: "Priya", email: "priya@example.com" };

function event(metadata: unknown): AuditEventRow {
    return {
        id: "evt_1",
        action: "customer-notices.setting",
        actorUserId: "u_priya",
        targetType: "organization",
        targetId: "org_1",
        outcome: "SUCCESS",
        metadata,
        createdAt: "2026-10-21T03:44:00.000Z",
        actor: priya,
        target: null,
    };
}

const change = (kind: unknown, before: boolean, after: boolean) =>
    event({ kind, changes: [{ field: "noticeOn", before, after }] });

describe("a customer email turned on or off", () => {
    it("is asked for", () => {
        expect(ACTIVITY_ACTIONS).toContain("customer-notices.setting");
    });

    it("says which, and which way, and opens Providers", () => {
        expect(activityLine(change("MEMBERSHIP", true, false))).toEqual({
            id: "evt_1",
            at: "2026-10-21T03:44:00.000Z",
            who: "Priya",
            what: "turned Membership emails off for customers",
            where: { label: "Providers", href: "/settings/providers" },
        });
        expect(
            activityLine(change("OVERDUE_REMINDERS", false, true))?.what,
        ).toBe("turned Overdue reminders on for customers");
    });

    it("a kind this app doesn't know is said generally, never as a key", () => {
        expect(activityLine(change("SOMETHING_NEW", true, false))?.what).toBe(
            "changed which emails customers get",
        );
        expect(activityLine(event({ kind: "REFUND" }))?.what).toBe(
            "changed which emails customers get",
        );
    });

    it("a refused change is not told", () => {
        expect(
            activityLine({
                ...change("REFUND", true, false),
                outcome: "DENIED",
            }),
        ).toBe(null);
    });

    it("its sheet says the email, as it was and became", () => {
        expect(
            activityDetail(change("REFUND", true, false), "Asia/Kolkata")
                .changes,
        ).toEqual([{ label: "Refunds", before: "On", after: "Off" }]);
        expect(
            activityDetail(change("NEW_KIND", false, true), "Asia/Kolkata")
                .changes,
        ).toEqual([
            { label: "An email to customers", before: "Off", after: "On" },
        ]);
    });
});
