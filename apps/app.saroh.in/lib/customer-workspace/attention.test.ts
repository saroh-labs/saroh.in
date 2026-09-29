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
    rolesThatSeeSensitive,
    rowTags,
    sensitiveTickText,
    setAsideText,
    SUGGESTION_KINDS,
    suggestionDraft,
    suggestionsTitle,
    suggestionWhen,
    tagText,
    tagTitle,
    toInput,
    toSuggestionInput,
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
            "Takes warfarin. Check before any extraction · from their account",
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
            /^From their account · /,
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

    it("never starts or turns sensitive for a role without customer:sensitive (C13)", () => {
        const d = emptyDraft(false);
        expect(d.kind).toBe("MEDICAL");
        expect(d.sensitive).toBe(false);
        const access = pickKind(d, "ACCESS", false);
        expect(pickKind(access, "MEDICAL", false).sensitive).toBe(false);
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

describe("booking-page notes (C12)", () => {
    const rahul = entry({
        label: "I take amlodipine 5mg for blood pressure",
        detail: "I take amlodipine 5mg for blood pressure. Please check before the numbing.",
        source: "BOOKING_PAGE",
        status: "SUGGESTED",
        bookingId: "bk_1",
        createdByUserId: null,
        addedBy: null,
        createdAt: "2026-09-18T05:12:00Z",
    });

    it("starts from the suggested label, Medical and sensitive", () => {
        const draft = suggestionDraft(rahul, []);
        expect(draft).toMatchObject({
            kind: "MEDICAL",
            label: "I take amlodipine 5mg for blood pressure",
            sensitive: true,
            sensitiveSet: false,
        });
        // The design's card holds 40 characters.
        expect(
            suggestionDraft(entry({ label: "x".repeat(60) }), []).label,
        ).toHaveLength(40);
    });

    it("offers Medical, Allergy and Access; sensitive follows Medical until ticked", () => {
        expect(SUGGESTION_KINDS).toEqual(["MEDICAL", "ALLERGY", "ACCESS"]);
        const draft = suggestionDraft(rahul, []);
        expect(pickKind(draft, "ACCESS").sensitive).toBe(false);
        const ticked = { ...draft, sensitive: true, sensitiveSet: true };
        expect(pickKind(ticked, "ACCESS").sensitive).toBe(true);
        // A suggestion of a kind the card doesn't offer starts as Medical.
        expect(suggestionDraft(entry({ kind: "OTHER" }), []).kind).toBe(
            "MEDICAL",
        );
    });

    it("sends the kind, label and tick, never the booker's words", () => {
        const draft = {
            ...suggestionDraft(rahul, []),
            label: "  Takes amlodipine ",
        };
        expect(toSuggestionInput(draft, [])).toEqual({
            kind: "MEDICAL",
            label: "Takes amlodipine",
            sensitive: true,
            allergenId: null,
        });
    });

    it("sends an allergen from the list for an Allergy, with no label", () => {
        const draft = {
            ...pickKind(suggestionDraft(rahul, CHOICES), "ALLERGY"),
            allergenId: SESAME.id,
        };
        expect(draftProblem({ ...draft, allergenId: null }, CHOICES)).toEqual({
            field: "allergenId",
            message: "Pick what they're allergic to.",
        });
        expect(toSuggestionInput(draft, CHOICES)).toEqual({
            kind: "ALLERGY",
            label: "",
            sensitive: false,
            allergenId: SESAME.id,
        });
        expect(draftTag(draft, CHOICES)).toBe("Allergy: Sesame");
    });

    it("says how many notes wait, and who wrote each and when", () => {
        expect(suggestionsTitle([rahul])).toBe("1 note from the booking page");
        expect(suggestionsTitle([rahul, rahul])).toBe(
            "2 notes from the booking page",
        );
        // Their full name, as the design has it (DEC-073).
        expect(suggestionWhen("Rahul Verma", rahul, TZ, NOW)).toBe(
            "Rahul Verma wrote this when booking online, 18 Sep at 10:42",
        );
        expect(suggestionWhen(null, rahul, TZ, NOW)).toBe(
            "They wrote this when booking online, 18 Sep at 10:42",
        );
        expect(setAsideText(rahul)).toBe(
            "Set aside. The note stays in their booking history.",
        );
    });

    it("words a note sent from their account (A5) by where it came from", () => {
        const fromAccount = { ...rahul, source: "CUSTOMER" as const };
        expect(suggestionsTitle([fromAccount])).toBe(
            "1 note from their account",
        );
        expect(suggestionsTitle([fromAccount, rahul])).toBe(
            "2 notes from the customer",
        );
        expect(suggestionWhen("Rahul", fromAccount, TZ, NOW)).toBe(
            "Rahul sent this from their account, 18 Sep at 10:42",
        );
        // Set aside, it leaves their list: it isn't kept on a booking.
        expect(setAsideText(fromAccount)).toBe(
            "Set aside. It won't be added to their record.",
        );
        const added = { ...fromAccount, status: "ACTIVE" as const };
        expect(entryMeta(added, "user_1", TZ, NOW)).toBe(
            "From their account · 18 Sep",
        );
    });

    it("reads as from the booking page once added", () => {
        const added = { ...rahul, status: "ACTIVE" as const };
        expect(entryMeta(added, "user_1", TZ, NOW)).toBe(
            "From the booking page · 18 Sep",
        );
        expect(tagTitle({ ...added, label: "Takes amlodipine" })).toBe(
            `${rahul.detail} · from the booking page`,
        );
    });
});

describe("who can read a sensitive note (C12, DEC-073)", () => {
    const role = (
        label: string,
        actions: string[],
        members = 1,
        grants?: string[],
    ) => ({ label, actions, members, grants });

    it("names the roles that hold customer:sensitive, alphabetically", () => {
        expect(
            rolesThatSeeSensitive([
                role("Owner", ["org:read", "customer:sensitive"]),
                role("Member", ["org:read", "contact:read"], 3),
                role("Dentist", ["customer:sensitive", "contact:read"]),
            ]),
        ).toEqual(["Dentist", "Owner"]);
    });

    it("reads an invented role's grants, implied holds included", () => {
        expect(
            rolesThatSeeSensitive([
                role("Front desk", ["contact:write"], 1, [
                    "contact:write",
                    "contact:read",
                ]),
                role("Hygienist", [], 1, ["customer:sensitive"]),
            ]),
        ).toEqual(["Hygienist"]);
    });

    it("leaves out a role nobody holds", () => {
        expect(
            rolesThatSeeSensitive([
                role("Admin", ["customer:sensitive"], 0),
                role("Owner", ["customer:sensitive"]),
            ]),
        ).toEqual(["Owner"]);
    });

    it("says the roles in the tick, and only the rule when they're unknown", () => {
        expect(sensitiveTickText(["Dentist", "Owner"])).toBe(
            "Sensitive — only people who can see sensitive notes (Dentist, Owner) can read it",
        );
        expect(sensitiveTickText(null)).toBe(
            "Sensitive — only people who can see sensitive notes can read it",
        );
        expect(sensitiveTickText([])).toBe(
            "Sensitive — only people who can see sensitive notes can read it",
        );
    });
});
