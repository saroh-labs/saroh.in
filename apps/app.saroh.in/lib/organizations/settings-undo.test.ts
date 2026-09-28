import { describe, expect, it } from "vitest";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import type {
    OrganizationSettings,
    OrganizationSettingsInput,
} from "./settings-service";
import {
    CHANGED_SINCE,
    hoursUndo,
    hoursUndoRefusal,
    logoUndo,
    logoUndoRefusal,
    NUMBERED_SINCE,
    settingsUndo,
    touchedFields,
    undoRefusal,
} from "./settings-undo";

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("missing");
    return value;
}

function org(over: Partial<OrganizationSettings> = {}): OrganizationSettings {
    return {
        id: "org_1",
        name: "Rye & Co.",
        slug: "rye",
        profile: {
            legalName: null,
            type: "individual",
            country: "IN",
            taxId: null,
            contactEmail: "hello@rye.in",
            website: null,
            timezone: "Asia/Kolkata",
            phone: null,
        },
        tradingSince: null,
        tax: {
            registered: false,
            state: "29",
            stateName: "Karnataka",
            invoicePrefix: "RC",
            deliveryRate: "18",
            deliverySac: null,
            invoiceNumber: {
                parts: ["PREFIX", "FY"],
                separator: "/",
                digits: 4,
                restart: "FY",
                custom: false,
                counters: { FY: 12, MONTH: 3, NEVER: 40 },
            },
        },
        registeredAddress: {
            line1: "14 Church Street",
            line2: null,
            city: "Bengaluru",
            postalCode: "560001",
            state: "29",
            stateName: "Karnataka",
        },
        logo: null,
        ...over,
    };
}

/** The settings with a change applied, as a save would return them. */
function withTax(
    s: OrganizationSettings,
    tax: Partial<NonNullable<OrganizationSettings["tax"]>>,
): OrganizationSettings {
    return { ...s, tax: { ...must(s.tax), ...tax } };
}

describe("settingsUndo (F12)", () => {
    it("puts the prefix back, and expects the one the save left", () => {
        const before = org();
        const sent: OrganizationSettingsInput = {
            tax: { invoicePrefix: "RY" },
        };
        const after = withTax(before, { invoicePrefix: "RY" });

        const undo = settingsUndo(before, after, sent);

        expect(undo?.input).toEqual({ tax: { invoicePrefix: "RC" } });
        expect(undo?.expect).toEqual({ "tax.invoicePrefix": "RY" });
        // A prefix change numbers differently: a number taken since fixes it.
        expect(undo?.counters).toEqual({ FY: 12, MONTH: 3, NEVER: 40 });
        expect(undoRefusal(must(undo), after)).toBeNull();
    });

    it("sends back only what the save sent, blanks as empty strings", () => {
        const before = org();
        const sent: OrganizationSettingsInput = {
            name: "Rye and Co",
            profile: { legalName: "Rye Foods LLP", website: "https://rye.in" },
            registeredAddress: { line2: "Near the park" },
        };
        const after = org({
            name: "Rye and Co",
            profile: {
                ...must(before.profile),
                legalName: "Rye Foods LLP",
                website: "https://rye.in",
            },
            registeredAddress: {
                ...must(before.registeredAddress),
                line2: "Near the park",
            },
        });

        const undo = settingsUndo(before, after, sent);

        expect(undo?.input).toEqual({
            name: "Rye & Co.",
            profile: { legalName: "", website: "" },
            registeredAddress: { line2: "" },
        });
        // Nothing about numbering changed: no counters to watch.
        expect(undo?.counters).toBeNull();
    });

    it("turns a registration back off with the state and GSTIN it replaced", () => {
        const before = org();
        const sent: OrganizationSettingsInput = {
            tax: { registered: true, state: "29" },
            profile: { taxId: "29AAGCR4375J1ZU" },
        };
        const after = org({
            profile: { ...must(before.profile), taxId: "29AAGCR4375J1ZU" },
            tax: { ...must(before.tax), registered: true },
        });

        const undo = settingsUndo(before, after, sent);

        expect(undo?.input).toEqual({
            tax: { registered: false, state: "29" },
            profile: { taxId: "" },
        });
        expect(undoRefusal(must(undo), after)).toBeNull();
    });

    it("keeps a chosen number format's Undo, as the format it replaced", () => {
        const chosen = {
            parts: ["PREFIX", "FY"] as const,
            separator: "/" as const,
            digits: 4,
            restart: "FY" as const,
        };
        const before = withTax(org(), {
            invoiceNumber: {
                ...chosen,
                parts: [...chosen.parts],
                custom: true,
                counters: { FY: 1, MONTH: 1, NEVER: 1 },
            },
        });
        const next = {
            ...chosen,
            parts: [...chosen.parts],
            separator: "-" as const,
        };
        const after = withTax(before, {
            invoiceNumber: { ...must(must(before.tax).invoiceNumber), ...next },
        });

        const undo = settingsUndo(before, after, {
            tax: { invoiceNumber: next },
        });

        expect(undo?.input.tax?.invoiceNumber).toEqual({
            ...chosen,
            parts: [...chosen.parts],
        });
    });

    it("offers no Undo for a number format chosen for the first time", () => {
        const before = org();
        const next = {
            parts: ["PREFIX", "FY"] as ("PREFIX" | "FY")[],
            separator: "-" as const,
            digits: 4,
            restart: "FY" as const,
        };
        expect(
            settingsUndo(before, before, { tax: { invoiceNumber: next } }),
        ).toBeNull();
    });

    it("offers no Undo when the read had no tax or address to put back", () => {
        const older = org({ tax: undefined, registeredAddress: undefined });
        expect(
            settingsUndo(older, older, { tax: { invoicePrefix: "RY" } }),
        ).toBeNull();
        expect(
            settingsUndo(older, older, { registeredAddress: { city: "Pune" } }),
        ).toBeNull();
    });
});

describe("undoRefusal (F12)", () => {
    const before = org();
    const sent: OrganizationSettingsInput = { tax: { invoicePrefix: "RY" } };
    const after = withTax(before, { invoicePrefix: "RY" });
    const undo = must(settingsUndo(before, after, sent));

    it("refuses when another tab changed the same field since", () => {
        const now = withTax(after, { invoicePrefix: "RZ" });
        expect(undoRefusal(undo, now)).toBe(CHANGED_SINCE);
    });

    it("lets a change to another field stand", () => {
        const now = org({
            ...after,
            profile: {
                ...must(after.profile),
                website: "https://elsewhere.in",
            },
        });
        expect(undoRefusal(undo, now)).toBeNull();
    });

    it("refuses once an invoice has been numbered since", () => {
        const now = withTax(after, {
            invoiceNumber: {
                ...must(must(after.tax).invoiceNumber),
                counters: { FY: 13, MONTH: 4, NEVER: 41 },
            },
        });
        expect(undoRefusal(undo, now)).toBe(NUMBERED_SINCE);
    });

    it("does not watch the counters for a change that doesn't number", () => {
        const contact = must(
            settingsUndo(
                before,
                org({
                    profile: {
                        ...must(before.profile),
                        website: "https://x.in",
                    },
                }),
                { profile: { website: "https://x.in" } },
            ),
        );
        const now = org({
            profile: { ...must(before.profile), website: "https://x.in" },
            tax: {
                ...must(before.tax),
                invoiceNumber: {
                    ...must(must(before.tax).invoiceNumber),
                    counters: { FY: 99, MONTH: 9, NEVER: 99 },
                },
            },
        });
        expect(undoRefusal(contact, now)).toBeNull();
    });

    it("reads a field by the same path from either side", () => {
        expect(touchedFields(after, sent)).toEqual(undo.expect);
    });
});

describe("logoUndo (F12)", () => {
    const logo = (mediaId: string | null) => ({
        url: `https://cdn/${mediaId ?? "old"}.png`,
        mediaId,
    });

    it("takes a first logo off again", () => {
        const undo = logoUndo(org({ logo: null }), org({ logo: logo("m2") }));
        expect(undo).toEqual({ mediaId: null, expect: "m2" });
    });

    it("points a replaced logo back at the old library image", () => {
        const undo = logoUndo(
            org({ logo: logo("m1") }),
            org({ logo: logo("m2") }),
        );
        expect(undo).toEqual({ mediaId: "m1", expect: "m2" });
        expect(
            logoUndoRefusal(must(undo), org({ logo: logo("m2") })),
        ).toBeNull();
        expect(logoUndoRefusal(must(undo), org({ logo: logo("m3") }))).toBe(
            CHANGED_SINCE,
        );
    });

    it("puts a removed logo back", () => {
        const undo = logoUndo(org({ logo: logo("m1") }), org({ logo: null }));
        expect(undo).toEqual({ mediaId: "m1", expect: null });
    });

    it("offers none for a logo that was only an address, or unknown", () => {
        expect(
            logoUndo(org({ logo: logo(null) }), org({ logo: logo("m2") })),
        ).toBeNull();
        expect(
            logoUndo(org({ logo: undefined }), org({ logo: logo("m2") })),
        ).toBeNull();
    });
});

describe("hoursUndo (F12)", () => {
    const week = (open: string): OpeningHoursDay[] =>
        (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const).map(
            (day) => ({ day, open, close: "19:00", closed: false }),
        );

    it("puts every storefront's week back", () => {
        const undo = hoursUndo([
            { id: "s1", before: week("09:00"), after: week("08:00") },
            { id: "s2", before: week("10:00"), after: week("08:00") },
        ]);
        expect(undo?.map((e) => e.before[0]?.open)).toEqual(["09:00", "10:00"]);
        expect(
            hoursUndoRefusal(must(undo), [
                { id: "s1", openingHours: week("08:00") },
                { id: "s2", openingHours: week("08:00") },
            ]),
        ).toBeNull();
    });

    it("refuses when a storefront's week changed since", () => {
        const undo = must(
            hoursUndo([
                { id: "s1", before: week("09:00"), after: week("08:00") },
            ]),
        );
        expect(
            hoursUndoRefusal(undo, [{ id: "s1", openingHours: week("07:00") }]),
        ).toBe(CHANGED_SINCE);
        expect(hoursUndoRefusal(undo, [])).toBe(CHANGED_SINCE);
    });

    it("offers none when a storefront never had hours", () => {
        expect(
            hoursUndo([{ id: "s1", before: null, after: week("08:00") }]),
        ).toBeNull();
        expect(hoursUndo([])).toBeNull();
    });
});
