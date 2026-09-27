import { describe, expect, it } from "vitest";

import type { AttentionEntry } from "./attention";
import {
    draftChanged,
    draftFrom,
    draftProblem,
    draftTag,
    emptyDraft,
    entryMeta,
    fieldOf,
    hiddenText,
    pickKind,
    picksAllergen,
    rowTags,
    tagText,
    tagTitle,
    toInput,
} from "./attention";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-27T06:30:00Z");

const SESAME = { id: "al_sesame", name: "Sesame" };
const PEANUTS = { id: "al_peanuts", name: "Peanuts" };
const CHOICES = [SESAME, PEANUTS];

function entry(over: Partial<AttentionEntry> = {}): AttentionEntry {
    return {
        id: "att_1",
        kind: "MEDICAL",
        label: "Blood thinners",
        detail: "Takes warfarin. Check before any extraction",
        sensitive: true,
        allergen: null,
        source: "STAFF",
        status: "ACTIVE",
        createdByUserId: "user_asha",
        addedBy: "Asha Rao",
        createdAt: "2026-09-18T05:00:00Z",
        updatedAt: "2026-09-18T05:00:00Z",
        ...over,
    };
}

describe("tags", () => {
    it("say the kind in words", () => {
        expect(tagText({ kind: "ALLERGY", label: "Sesame" })).toBe(
            "Allergy: Sesame",
        );
        expect(tagText({ kind: "MEDICAL", label: "Pregnant" })).toBe(
            "Medical: Pregnant",
        );
        expect(tagText({ kind: "ACCESS", label: "Anxious patient" })).toBe(
            "Access: Anxious patient",
        );
        expect(tagText({ kind: "OTHER", label: "Hard of hearing" })).toBe(
            "Other: Hard of hearing",
        );
    });

    it("title with the detail, and where it came from", () => {
        expect(tagTitle(entry())).toBe(
            "Takes warfarin. Check before any extraction",
        );
        expect(tagTitle(entry({ detail: null }))).toBe("Blood thinners");
        expect(tagTitle(entry({ detail: "  ", source: "BOOKING_PAGE" }))).toBe(
            "Blood thinners · from the booking page",
        );
        expect(tagTitle(entry({ source: "CUSTOMER" }))).toBe(
            "Takes warfarin. Check before any extraction · from the customer",
        );
    });
});

describe("what a role can't see", () => {
    it("is nothing when nothing is hidden", () => {
        expect(hiddenText(0, 2)).toBeNull();
        expect(hiddenText(0, 0)).toBeNull();
    });

    it("is '1 more note' beside tags the role can see", () => {
        expect(hiddenText(1, 1)).toBe("1 more note you can't see");
        expect(hiddenText(2, 1)).toBe("2 more notes you can't see");
    });

    it("drops 'more' when the role sees none", () => {
        expect(hiddenText(1, 0)).toBe("1 note you can't see");
        expect(hiddenText(3, 0)).toBe("3 notes you can't see");
    });

    it("on a list row: a Member sees the Allergy tag, and the Medical one counted", () => {
        expect(
            rowTags({
                attention: [
                    { kind: "ALLERGY", label: "Latex", sensitive: false },
                ],
                hiddenSensitiveCount: 1,
            }),
        ).toEqual({
            tags: ["Allergy: Latex"],
            hidden: "1 more note you can't see",
        });
    });

    it("on a list row: an Owner sees both, nothing hidden", () => {
        expect(
            rowTags({
                attention: [
                    { kind: "ALLERGY", label: "Latex", sensitive: false },
                    {
                        kind: "MEDICAL",
                        label: "Blood thinners",
                        sensitive: true,
                    },
                ],
                hiddenSensitiveCount: 0,
            }),
        ).toEqual({
            tags: ["Allergy: Latex", "Medical: Blood thinners"],
            hidden: null,
        });
    });

    it("on a list row with nothing: no tags", () => {
        expect(rowTags({ attention: [], hiddenSensitiveCount: 0 })).toEqual({
            tags: [],
            hidden: null,
        });
    });
});

describe("who added it", () => {
    it("says You for the viewer's own", () => {
        expect(entryMeta(entry(), "user_asha", TZ, NOW)).toMatch(
            /^Added by You · /,
        );
    });

    it("says a teammate by first name", () => {
        expect(entryMeta(entry(), "user_other", TZ, NOW)).toMatch(
            /^Added by Asha · /,
        );
    });

    it("says where a booking-page or customer note came from", () => {
        expect(
            entryMeta(
                entry({ source: "BOOKING_PAGE", createdByUserId: null }),
                null,
                TZ,
                NOW,
            ),
        ).toMatch(/^From the booking page · /);
        expect(entryMeta(entry({ source: "CUSTOMER" }), null, TZ, NOW)).toMatch(
            /^From the customer · /,
        );
    });

    it("names nobody when it knows nobody", () => {
        expect(
            entryMeta(
                entry({ createdByUserId: null, addedBy: null }),
                null,
                TZ,
                NOW,
            ),
        ).toMatch(/^Added /);
    });
});

describe("the editor", () => {
    it("starts as Medical, sensitive", () => {
        const d = emptyDraft();
        expect(d.kind).toBe("MEDICAL");
        expect(d.sensitive).toBe(true);
    });

    it("turns sensitive off for Access and on again for Medical", () => {
        const access = pickKind(emptyDraft(), "ACCESS");
        expect(access.sensitive).toBe(false);
        expect(pickKind(access, "MEDICAL").sensitive).toBe(true);
    });

    it("keeps a tick set by hand when the kind changes", () => {
        const unticked = {
            ...emptyDraft(),
            sensitive: false,
            sensitiveSet: true,
        };
        expect(pickKind(unticked, "MEDICAL").sensitive).toBe(false);
        const ticked = {
            ...pickKind(emptyDraft(), "ACCESS"),
            sensitive: true,
            sensitiveSet: true,
        };
        expect(pickKind(ticked, "OTHER").sensitive).toBe(true);
    });

    it("edits an entry as it is, and a changed kind keeps its tick", () => {
        const d = draftFrom(entry(), CHOICES);
        expect(d).toMatchObject({
            kind: "MEDICAL",
            label: "Blood thinners",
            detail: "Takes warfarin. Check before any extraction",
            sensitive: true,
            allergenId: null,
        });
        expect(pickKind(d, "ACCESS").sensitive).toBe(true);
        expect(draftChanged(d, d)).toBe(false);
        expect(draftChanged(d, { ...d, detail: "Other" })).toBe(true);
        expect(draftChanged(d, { ...d, label: " Blood thinners " })).toBe(
            false,
        );
    });

    it("matches an allergy to the list by name", () => {
        const d = draftFrom(
            entry({
                kind: "ALLERGY",
                label: "Sesame",
                sensitive: false,
                allergen: { id: "al_sesame_store2", name: "sesame " },
            }),
            CHOICES,
        );
        expect(d.allergenId).toBe("al_sesame");
    });

    it("picks the allergen from the list only for an allergy, and only with a list", () => {
        const allergy = pickKind(emptyDraft(), "ALLERGY");
        expect(picksAllergen(allergy, CHOICES)).toBe(true);
        expect(picksAllergen(allergy, [])).toBe(false);
        expect(picksAllergen(emptyDraft(), CHOICES)).toBe(false);
    });

    it("asks for the allergen when there is a list", () => {
        const allergy = pickKind(emptyDraft(), "ALLERGY");
        expect(draftProblem(allergy, CHOICES)).toEqual({
            field: "allergenId",
            message: "Pick what they're allergic to.",
        });
        expect(
            draftProblem({ ...allergy, allergenId: SESAME.id }, CHOICES),
        ).toBeNull();
    });

    it("asks for a label otherwise", () => {
        expect(draftProblem(emptyDraft(), CHOICES)).toEqual({
            field: "label",
            message: "Say what the team should know.",
        });
        expect(draftProblem(pickKind(emptyDraft(), "ALLERGY"), [])).toEqual({
            field: "label",
            message: "Say what they're allergic to.",
        });
        expect(
            draftProblem({ ...emptyDraft(), label: "  " }, CHOICES)?.field,
        ).toBe("label");
    });

    it("holds the API's limits", () => {
        const long = { ...emptyDraft(), label: "x".repeat(61) };
        expect(draftProblem(long, [])?.field).toBe("label");
        const detail = {
            ...emptyDraft(),
            label: "Pregnant",
            detail: "y".repeat(501),
        };
        expect(draftProblem(detail, [])).toEqual({
            field: "detail",
            message: "Keep the detail under 500 characters.",
        });
        expect(
            draftProblem({ ...detail, detail: "y".repeat(500) }, []),
        ).toBeNull();
    });

    it("sends Access 'Wheelchair' as typed, not sensitive", () => {
        const d = {
            ...pickKind(emptyDraft(), "ACCESS"),
            label: " Wheelchair ",
            detail: "  ",
        };
        expect(toInput(d, CHOICES)).toEqual({
            kind: "ACCESS",
            label: "Wheelchair",
            detail: null,
            sensitive: false,
            allergenId: null,
        });
        expect(draftTag(d, CHOICES)).toBe("Access: Wheelchair");
    });

    it("sends a listed allergy by its allergen, for the API to name", () => {
        const d = {
            ...pickKind(emptyDraft(), "ALLERGY"),
            label: "left over",
            allergenId: PEANUTS.id,
        };
        expect(toInput(d, CHOICES)).toEqual({
            kind: "ALLERGY",
            label: "",
            detail: null,
            sensitive: false,
            allergenId: PEANUTS.id,
        });
        expect(draftTag(d, CHOICES)).toBe("Allergy: Peanuts");
    });

    it("sends a typed allergy where the business keeps no list", () => {
        const d = {
            ...pickKind(emptyDraft(), "ALLERGY"),
            label: "Shellfish",
            allergenId: "stale",
        };
        expect(toInput(d, [])).toMatchObject({
            kind: "ALLERGY",
            label: "Shellfish",
            allergenId: null,
        });
    });

    it("drops an allergen when the kind moves off Allergy", () => {
        const d = pickKind(
            {
                ...pickKind(emptyDraft(), "ALLERGY"),
                allergenId: SESAME.id,
                label: "Sesame",
            },
            "OTHER",
        );
        expect(toInput(d, CHOICES).allergenId).toBeNull();
    });

    it("puts the API's refusal on a field the sheet has", () => {
        expect(fieldOf("label")).toBe("label");
        expect(fieldOf("allergenId")).toBe("allergenId");
        expect(fieldOf("detail")).toBe("detail");
        expect(fieldOf("kind")).toBeNull();
        expect(fieldOf(undefined)).toBeNull();
    });
});
