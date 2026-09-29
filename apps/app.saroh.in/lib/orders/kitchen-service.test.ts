import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => apiFetch(path) as unknown,
    getJson: vi.fn(),
    mutate: vi.fn(),
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import { getAttentionAllergies } from "@/lib/orders/kitchen-service";

/**
 * Order Detail's allergy banner, for an order read from before B15 (no
 * `attention` of its own): it reads the contact's Needs attention, never
 * their notes (Z2a).
 */

const SESAME = { id: "al_sesame", name: "Sesame" };
const SESAME_TOO = { id: "al_sesame_b", name: "sesame" };

const reply = (body: unknown, status = 200) =>
    apiFetch.mockResolvedValue({
        ok: status < 400,
        status,
        json: () => Promise.resolve(body),
    });

beforeEach(() => apiFetch.mockReset());

describe("getAttentionAllergies", () => {
    it("reads the Allergy entries, by every allergen of their name", async () => {
        reply({
            // Notes carry no allergens; even an old one that did is ignored.
            notes: {
                rows: [
                    {
                        body: "Old note",
                        allergens: [{ id: "al_nuts", name: "Nuts" }],
                        matchAllergens: [{ id: "al_nuts", name: "Nuts" }],
                    },
                ],
            },
            attention: {
                entries: [
                    {
                        id: "a1",
                        kind: "ALLERGY",
                        label: "Sesame",
                        detail: "Use the plain bun tray.",
                        sensitive: false,
                        allergen: SESAME,
                        matchAllergens: [SESAME, SESAME_TOO],
                        source: "STAFF",
                    },
                    {
                        id: "a2",
                        kind: "ACCESS",
                        label: "Step-free entry",
                        detail: null,
                        sensitive: false,
                        allergen: null,
                        matchAllergens: [],
                        source: "STAFF",
                    },
                ],
                hiddenSensitiveCount: 0,
            },
        });
        await expect(getAttentionAllergies("c_1")).resolves.toEqual([
            {
                body: "Allergy: Sesame. Use the plain bun tray.",
                allergens: [SESAME, SESAME_TOO],
            },
        ]);
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/customers/c_1/detail",
        );
    });

    it("is empty when Needs attention names no allergy, whatever the notes say", async () => {
        reply({
            notes: {
                rows: [
                    {
                        body: "Allergic to nuts",
                        allergens: [{ id: "al_nuts", name: "Nuts" }],
                    },
                ],
            },
            attention: { entries: [], hiddenSensitiveCount: 0 },
        });
        await expect(getAttentionAllergies("c_1")).resolves.toEqual([]);
    });

    it("says it couldn't check when Needs attention didn't load", async () => {
        reply({ notes: { rows: [] }, attention: null });
        await expect(getAttentionAllergies("c_1")).resolves.toBeNull();

        reply({ notes: { rows: [] } });
        await expect(getAttentionAllergies("c_1")).resolves.toBeNull();

        reply({ message: "Forbidden" }, 403);
        await expect(getAttentionAllergies("c_1")).resolves.toBeNull();
    });

    it("says it couldn't check when the API can't be reached", async () => {
        apiFetch.mockRejectedValueOnce(new Error("offline"));
        expect(await getAttentionAllergies("c_1")).toBeNull();
    });
});
