import { describe, expect, it } from "vitest";

import type { NotedAllergen } from "./contact-attention";
import { planAllergyEntries } from "./contact-attention";

const at = (day: number) => new Date(Date.UTC(2026, 8, day));

function noted(over: Partial<NotedAllergen>): NotedAllergen {
    return {
        contactId: "asha",
        allergenId: "sesame",
        allergenName: "Sesame",
        noteAuthorId: "nisha",
        noteCreatedAt: at(1),
        ...over,
    };
}

describe("note allergens become Allergy entries (C1)", () => {
    it("makes one entry per allergen a contact's notes name", () => {
        const plan = planAllergyEntries(
            [
                noted({}),
                noted({ allergenId: "peanut", allergenName: "Peanuts " }),
            ],
            [],
        );
        expect(plan).toEqual([
            {
                contactId: "asha",
                allergenId: "peanut",
                label: "Peanuts",
                createdByUserId: "nisha",
                createdAt: at(1),
            },
            {
                contactId: "asha",
                allergenId: "sesame",
                label: "Sesame",
                createdByUserId: "nisha",
                createdAt: at(1),
            },
        ]);
    });

    it("names an allergen once, from the oldest note, across rows of one name", () => {
        const plan = planAllergyEntries(
            [
                noted({ noteAuthorId: "ravi", noteCreatedAt: at(9) }),
                noted({
                    allergenId: "sesame-stall",
                    allergenName: " SESAME",
                    noteCreatedAt: at(3),
                    noteAuthorId: null,
                }),
            ],
            [],
        );
        expect(plan).toEqual([
            {
                contactId: "asha",
                allergenId: "sesame-stall",
                label: "SESAME",
                createdByUserId: null,
                createdAt: at(3),
            },
        ]);
    });

    it("keeps each contact's list apart", () => {
        const plan = planAllergyEntries(
            [noted({}), noted({ contactId: "ravi" })],
            [],
        );
        expect(plan.map((p) => p.contactId).sort()).toEqual(["asha", "ravi"]);
    });

    it("makes nothing a contact already has, removed or not, so a second run is a no-op", () => {
        const notes = [
            noted({}),
            noted({ allergenId: "peanut", allergenName: "Peanuts" }),
        ];
        const first = planAllergyEntries(notes, []);
        expect(first).toHaveLength(2);
        expect(
            planAllergyEntries(
                notes,
                first.map((p) => ({ contactId: p.contactId, name: p.label })),
            ),
        ).toEqual([]);
        // An entry of the same name typed by hand counts too.
        expect(
            planAllergyEntries(notes, [{ contactId: "asha", name: "sesame" }]),
        ).toEqual([expect.objectContaining({ allergenId: "peanut" })]);
    });

    it("makes nothing when no note names an allergen", () => {
        expect(planAllergyEntries([], [])).toEqual([]);
    });
});
