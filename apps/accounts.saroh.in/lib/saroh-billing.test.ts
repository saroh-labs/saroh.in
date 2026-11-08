import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
    vi.fn(() => {
        throw new Error("NOT_FOUND");
    }),
);
vi.mock("next/navigation", () => ({ notFound }));

async function load(edition?: string) {
    if (edition) vi.stubEnv("NEXT_PUBLIC_EDITION", edition);
    vi.resetModules();
    return import("./saroh-billing");
}

const owner = [{ role: "OWNER" as const }];

describe("Billing profiles by edition (P0 #31)", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("India: in the menu for an owner and while a read fails; pages open", async () => {
        const { billingInMenu, billingProfilesOrNotFound } = await load();
        expect(billingInMenu(owner, [])).toBe(true);
        expect(billingInMenu(null, null)).toBe(true);
        expect(billingInMenu([{ role: "MEMBER" }], [])).toBe(false);
        expect(() => billingProfilesOrNotFound()).not.toThrow();
    });

    it("Global: never in the menu, and every page is not found", async () => {
        const { billingInMenu, billingProfilesOrNotFound, SAROH_BILLING } =
            await load("GLOBAL");
        expect(SAROH_BILLING).toBe(false);
        expect(billingInMenu(owner, [])).toBe(false);
        expect(billingInMenu(null, null)).toBe(false);
        expect(() => billingProfilesOrNotFound()).toThrow("NOT_FOUND");
    });
});
