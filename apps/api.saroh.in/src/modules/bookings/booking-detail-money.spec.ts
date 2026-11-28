/**
 * A booking's page for a viewer who reads no money (DEC-098): its refund
 * lines say what happened, never how much or the refund's id (pentest
 * 28 Nov 2026, L-1).
 */
import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { BookingDetailView } from "./bookings.service";
import { detailFor } from "./bookings.service";

const role = (actions: string[]): OrganizationContext => ({
    organizationId: "org",
    userId: "u",
    role: "MEMBER",
    roleKey: "custom",
    actions: resolveCapabilities("custom", actions),
});

const refund = {
    amountCents: 50_000,
    currency: "INR",
    refundId: "refund_1",
    outcome: "SENT",
};

const view = {
    id: "b1",
    snapshot: { priceCents: 50_000 },
    service: { id: "s1", priceCents: 50_000, gstRate: "18" },
    money: { pay: { word: "Refunded", how: null } },
    events: [
        { id: "e1", type: "CANCELLED", data: { reason: "Sick" } },
        { id: "e2", type: "REFUNDED", data: refund },
        {
            id: "e3",
            type: "REFUND_FAILED",
            data: { ...refund, outcome: "FAILED" },
        },
    ],
} as unknown as BookingDetailView;

describe("detailFor: refund lines", () => {
    it("keeps what happened and drops the amount for a viewer without money", () => {
        const shown = detailFor(role(["booking:read"]), view);
        const events = shown.events as unknown as {
            type: string;
            data: unknown;
        }[];
        expect(events[0]?.data).toEqual({ reason: "Sick" });
        expect(events[1]?.data).toEqual({ outcome: "SENT" });
        expect(events[2]?.data).toEqual({ outcome: "FAILED" });
        expect(JSON.stringify(shown)).not.toContain("refund_1");
        expect(JSON.stringify(shown)).not.toContain("50000");
    });

    it("leaves the refund whole for a viewer who reads money", () => {
        const shown = detailFor(role(["booking:read", "payment:read"]), view);
        const events = shown.events as unknown as { data: unknown }[];
        expect(events[1]?.data).toEqual(refund);
    });
});
