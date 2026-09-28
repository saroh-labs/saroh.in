import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { ACTIVITY_ACTIONS, activityLine } from "./activity";
import { activityDetail } from "./activity-detail";

/** Settings › Activity's words for customer records (C10). */

function event(overrides: Partial<AuditEventRow>): AuditEventRow {
    return {
        id: "evt_1",
        action: "customer.merged",
        actorUserId: "u_sanjay",
        targetType: "contact",
        targetId: "c_asha",
        outcome: "SUCCESS",
        metadata: null,
        createdAt: "2026-09-28T03:44:00.000Z",
        actor: { name: "Sanjay", email: "sanjay@ryeandco.in" },
        target: null,
        ...overrides,
    };
}

describe("Activity — customer records", () => {
    it("asks the stream for merges and details changes", () => {
        expect(ACTIVITY_ACTIONS).toContain("customer.merged");
        expect(ACTIVITY_ACTIONS).toContain("customer.details.changed");
    });

    it("says what a merge moved, and opens the record kept", () => {
        const line = activityLine(
            event({
                metadata: {
                    role: "OWNER",
                    mergedContactId: "c_old",
                    moved: { orders: 3, notes: 1, bookings: 0 },
                    account: "none",
                },
            }),
        );
        expect(line?.what).toBe(
            "merged a duplicate customer record — 3 orders and 1 note moved",
        );
        expect(line?.where).toEqual({
            label: "Customer",
            href: "/customers/c_asha",
        });
    });

    it("keeps a long merge short, and says a merge that moved nothing", () => {
        expect(
            activityLine(
                event({
                    metadata: {
                        moved: {
                            orders: 2,
                            bookings: 1,
                            invoices: 1,
                            attention: 2,
                        },
                    },
                }),
            )?.what,
        ).toBe(
            "merged a duplicate customer record — 2 orders, 1 booking, 1 invoice and more moved",
        );
        expect(activityLine(event({ metadata: {} }))?.what).toBe(
            "merged a duplicate customer record",
        );
    });

    it("names the details staff changed, never their values", () => {
        const line = activityLine(
            event({
                action: "customer.details.changed",
                metadata: {
                    fields: ["firstName", "lastName", "email", "address"],
                },
            }),
        );
        expect(line?.what).toBe("changed a customer's name, email and address");
        expect(JSON.stringify(line)).not.toContain("@example");
    });

    it("says a details change with no fields plainly", () => {
        expect(
            activityLine(
                event({ action: "customer.details.changed", metadata: {} }),
            )?.what,
        ).toBe("changed a customer's details");
    });

    it("links to the list when the event names no one", () => {
        expect(activityLine(event({ targetId: null }))?.where).toEqual({
            label: "Customers",
            href: "/commerce/customers",
        });
    });

    it("tells nothing that was refused", () => {
        expect(activityLine(event({ outcome: "DENIED" }))).toBeNull();
    });

    it("opens a merge's sheet with what moved and the sign-in", () => {
        const detail = activityDetail(
            event({
                metadata: {
                    moved: { orders: 1, attention: 2 },
                    account: "move",
                },
            }),
            "Asia/Kolkata",
        );
        expect(detail.changes).toEqual([
            {
                label: "Moved to the record kept",
                before: null,
                after: "1 order, 2 Needs attention entries",
            },
            {
                label: "Website sign-in",
                before: null,
                after: "Moved to the record kept",
            },
        ]);
        expect(detail.withoutValues).toBe(false);
    });

    it("opens a details change's sheet with names only", () => {
        const detail = activityDetail(
            event({
                action: "customer.details.changed",
                metadata: { fields: ["phone", "company"] },
            }),
            "Asia/Kolkata",
        );
        expect(detail.changes).toEqual([
            { label: "Phone", before: null, after: null },
            { label: "Company", before: null, after: null },
        ]);
    });
});
