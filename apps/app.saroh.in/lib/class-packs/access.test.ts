import { describe, expect, it } from "vitest";

import {
    canReadPacks,
    canSellPacks,
    canUsePacksOnBookings,
    canWritePacks,
} from "./access";

type Org = Parameters<typeof canSellPacks>[0];

const org = (role: string, actions?: string[]): Org =>
    ({ id: "org_1", name: "Pulse", role, actions }) as unknown as Org;

describe("the pack powers (E26)", () => {
    it("a role with pack:sell sells and sees packs, and can't change them", () => {
        // The API resolves pack:sell with the read it implies.
        const seller = org("MEMBER", ["pack:sell", "pack:read"]);
        expect(canReadPacks(seller)).toBe(true);
        expect(canSellPacks(seller)).toBe(true);
        expect(canWritePacks(seller)).toBe(false);
    });

    it("a role with pack:write still sells", () => {
        // From an API that resolves the implied holds …
        expect(
            canSellPacks(
                org("MEMBER", ["pack:write", "pack:sell", "pack:read"]),
            ),
        ).toBe(true);
        // … and from one before E26, which asked pack:write to sell.
        expect(canSellPacks(org("MEMBER", ["pack:write", "pack:read"]))).toBe(
            true,
        );
    });

    it("pack:read alone reads, and sells nothing", () => {
        const reader = org("MEMBER", ["pack:read"]);
        expect(canReadPacks(reader)).toBe(true);
        expect(canSellPacks(reader)).toBe(false);
        expect(canWritePacks(reader)).toBe(false);
    });

    it("paying for a booking with a pack also needs booking:write", () => {
        expect(
            canUsePacksOnBookings(
                org("MEMBER", ["pack:sell", "pack:read", "booking:write"]),
            ),
        ).toBe(true);
        expect(
            canUsePacksOnBookings(org("MEMBER", ["pack:sell", "pack:read"])),
        ).toBe(false);
        expect(
            canUsePacksOnBookings(
                org("MEMBER", ["pack:read", "booking:write", "booking:read"]),
            ),
        ).toBe(false);
    });

    it("without resolved powers, owners and admins hold them all and a Member none", () => {
        for (const role of ["OWNER", "ADMIN"]) {
            expect(canReadPacks(org(role))).toBe(true);
            expect(canSellPacks(org(role))).toBe(true);
            expect(canWritePacks(org(role))).toBe(true);
            expect(canUsePacksOnBookings(org(role))).toBe(true);
        }
        // Whether a Member sells packs is F18's (matrix Q1).
        expect(canSellPacks(org("MEMBER"))).toBe(false);
        expect(canReadPacks(org("MEMBER"))).toBe(false);
    });

    it("no organization holds nothing", () => {
        expect(canSellPacks(null as Org)).toBe(false);
    });
});
