import { describe, expect, it } from "vitest";

import { groupRepeats } from "./group";
import type { Notification } from "./service";

function n(id: string, type: string): Notification {
    return {
        id,
        type,
        title: type,
        body: null,
        leadId: null,
        reviewId: null,
        readAt: null,
        createdAt: "2026-11-26T04:00:00Z",
    };
}

describe("groupRepeats (DEC-278)", () => {
    it("folds one kind under its newest, keeping the order they came in", () => {
        const runs = groupRepeats([
            n("1", "calendar.behind"),
            n("2", "order.uncollected"),
            n("3", "calendar.behind"),
            n("4", "calendar.behind"),
        ]);
        expect(runs.map((r) => [r.head.id, r.rest.map((x) => x.id)])).toEqual([
            ["1", ["3", "4"]],
            ["2", []],
        ]);
    });

    it("never folds bookings: each is its own row", () => {
        const runs = groupRepeats([
            n("1", "booking.new"),
            n("2", "booking.new"),
            n("3", "booking.cancelled"),
        ]);
        expect(runs).toHaveLength(3);
    });
});
