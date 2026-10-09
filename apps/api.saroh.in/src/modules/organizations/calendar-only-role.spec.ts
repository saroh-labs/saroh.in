import { CALENDAR_ONLY_ACTIONS as STORED_ACTIONS } from "@saroh/database";

import { seatOf, VIEW_ONLY_ACTIONS } from "../billing/seats";
import { mayTakeDeskPayment } from "../bookings/booking-access";
import {
    CALENDAR_ONLY_ACTIONS,
    CALENDAR_ONLY_ROLE_KEY,
} from "./calendar-only-role";
import { ORG_ACTIONS } from "./organization-actions";
import type { OrgAction } from "./organization-policy";
import { allows, resolveCapabilities } from "./organization-policy";

/**
 * "Calendar only" (#868; owner decision 2026-10-08): what someone on the
 * diary given a login holds by default — their own diary, nothing else.
 */

/** Every permission that reads or moves money (DEC-098, ADR-008). */
const MONEY: readonly OrgAction[] = ORG_ACTIONS.filter((a) =>
    /^(payment|invoice|order|pack|subscription|billing|course):/.test(a),
);

const resolved = resolveCapabilities(CALENDAR_ONLY_ROLE_KEY, [
    ...CALENDAR_ONLY_ACTIONS,
]);

describe("the Calendar only role (#868)", () => {
    it("is the same list the database makes it with", () => {
        expect([...CALENDAR_ONLY_ACTIONS]).toEqual([...STORED_ACTIONS]);
    });

    it("holds only real actions", () => {
        for (const action of CALENDAR_ONLY_ACTIONS) {
            expect(ORG_ACTIONS).toContain(action);
        }
    });

    it("sees and changes bookings and the services they are for", () => {
        expect(resolved.has("booking:read")).toBe(true);
        expect(resolved.has("booking:write")).toBe(true);
        expect(resolved.has("service:read")).toBe(true);
    });

    it("holds no money, in any form, implied holds included", () => {
        expect(MONEY.length).toBeGreaterThan(5);
        for (const action of MONEY) expect(resolved.has(action)).toBe(false);
        // No desk payment either: that needs `invoice:write` (DEC-098).
        expect(
            mayTakeDeskPayment({
                organizationId: "org",
                userId: "u",
                role: "MEMBER",
                roleKey: CALENDAR_ONLY_ROLE_KEY,
                actions: resolved,
            }),
        ).toBe(false);
    });

    it("reads no customers, team, settings or diary set-up", () => {
        for (const action of [
            "contact:read",
            "customer:sensitive",
            "member:read",
            "member:invite",
            "lead:read",
            "service:write",
            "org:update",
            "store:read",
            "site:read",
            "notification:read",
        ] as OrgAction[]) {
            expect(resolved.has(action)).toBe(false);
        }
    });

    it("is narrower than Member, and never resolves to the floor without its row", () => {
        const member = resolveCapabilities("MEMBER");
        expect(member.has("contact:read")).toBe(true);
        // A business whose row isn't there yet still gets the narrow list.
        const unstored = resolveCapabilities(CALENDAR_ONLY_ROLE_KEY);
        expect([...unstored].sort()).toEqual([...resolved].sort());
        expect(unstored.has("contact:read")).toBe(false);
    });

    it("uses a team seat: it changes bookings (DEC-105)", () => {
        expect(resolved.has("booking:write")).toBe(true);
        expect(VIEW_ONLY_ACTIONS.has("booking:write")).toBe(false);
        const roles = new Map([
            [CALENDAR_ONLY_ROLE_KEY, [...CALENDAR_ONLY_ACTIONS]],
        ]);
        expect(seatOf(roles, CALENDAR_ONLY_ROLE_KEY)).toBe("seat");
        // Even an owner who trims it to looking: they take bookings.
        const trimmed = new Map([[CALENDAR_ONLY_ROLE_KEY, ["booking:read"]]]);
        expect(seatOf(trimmed, CALENDAR_ONLY_ROLE_KEY, [], true)).toBe("seat");
    });

    it("is judged by the policy on its own key", () => {
        const ctx = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER" as const,
            roleKey: CALENDAR_ONLY_ROLE_KEY,
            actions: resolved,
        };
        expect(allows(ctx, "booking:write")).toBe(true);
        expect(allows(ctx, "payment:read")).toBe(false);
        expect(allows(ctx, "invoice:read")).toBe(false);
        expect(allows(ctx, "order:read")).toBe(false);
    });
});
