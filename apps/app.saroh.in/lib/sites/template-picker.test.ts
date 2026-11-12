import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { Template } from "@/lib/sites/service";

import {
    isSuggested,
    moduleStates,
    moduleStatesWith,
    offReason,
    shapeWord,
    startingTemplate,
    suggestedTemplates,
    suggestedTitle,
    templateGroups,
    usesLine,
} from "./template-picker";

/** The catalogue as `GET …/sites/templates` sends it (U12), trimmed. */
function t(id: string, over: Partial<Template> = {}): Template {
    return { id, version: 1, name: id, slug: id, kinds: [], uses: [], ...over };
}
const CATALOGUE: Template[] = [
    t("starter"),
    t("personal"),
    t("portfolio"),
    t("writing"),
    t("blogs", { kinds: ["creator", "coach"], uses: ["WEBSITE"] }),
    t("ceramics", { kinds: ["shop", "creator"], uses: ["COMMERCE"] }),
    t("gym", {
        kinds: ["gym"],
        uses: ["APPOINTMENTS", "PAYMENTS", "CLASS_PACKS"],
    }),
    t("bakery", { kinds: ["food"], uses: ["COMMERCE"], shape: "store" }),
    t("studio", { kinds: ["creator"], uses: ["WEBSITE", "CRM"] }),
    t("developer", { kinds: ["creator"], uses: ["WEBSITE", "CRM"] }),
    t("dietician", { kinds: ["coach", "clinic"], uses: ["APPOINTMENTS"] }),
];

function mod(key: string, on: boolean, hidden = false): ModuleView {
    return {
        key,
        label: key,
        lifecycle: on ? "ENABLED" : "DISABLED",
        readiness: on ? "ACTIVE" : "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: hidden ? [{ code: "ROLLOUT_DISABLED" }] : [],
    };
}

/** One of the catalogue's, by id. */
function of(id: string): Template {
    const found = CATALOGUE.find((x) => x.id === id);
    if (!found) throw new Error(`No ${id} in the catalogue`);
    return found;
}

const ids = (list: readonly Pick<Template, "id">[]) => list.map((x) => x.id);

describe("which templates are suggested (U12)", () => {
    it("suggests a business with Sell on the shops' templates, its default first", () => {
        const states = moduleStates([
            mod("COMMERCE", true),
            mod("APPOINTMENTS", false),
        ]);
        expect(
            ids(suggestedTemplates(CATALOGUE, "BUSINESS", states, "starter")),
        ).toEqual(["starter", "blogs", "ceramics", "bakery"]);
    });

    it("suggests a business with Bookings on the gym's and the dietician's", () => {
        const states = moduleStates([
            mod("COMMERCE", false),
            mod("APPOINTMENTS", true),
        ]);
        expect(
            ids(suggestedTemplates(CATALOGUE, "BUSINESS", states, "starter")),
        ).toEqual(["starter", "blogs", "gym", "dietician"]);
    });

    it("suggests a site for my work the portfolios and writing, Portfolio first", () => {
        expect(
            ids(suggestedTemplates(CATALOGUE, "WORK", null, "portfolio")),
        ).toEqual([
            "portfolio",
            "writing",
            "blogs",
            "ceramics",
            "studio",
            "developer",
        ]);
    });

    it("suggests Just me the personal site and a practitioner's", () => {
        const states = moduleStates([mod("APPOINTMENTS", true)]);
        const shown = ids(
            suggestedTemplates(CATALOGUE, "SOLO", states, "personal"),
        );
        expect(shown[0]).toBe("personal");
        expect(shown).toContain("dietician");
        expect(shown).not.toContain("starter");
        expect(shown).not.toContain("bakery");
    });

    it("always suggests the kind's default, and reads an unknown kind as a business", () => {
        expect(isSuggested(t("starter"), "WHATEVER", null, "starter")).toBe(
            true,
        );
        expect(isSuggested(t("writing"), undefined, null, "starter")).toBe(
            false,
        );
        expect(isSuggested(t("writing"), "WORK", null, "portfolio")).toBe(true);
    });

    it("suggests on the kind alone when the modules couldn't be read", () => {
        const shown = ids(
            suggestedTemplates(CATALOGUE, "BUSINESS", null, "starter"),
        );
        expect(shown).toEqual(
            expect.arrayContaining(["bakery", "gym", "dietician"]),
        );
    });

    it("counts what the Turn on sheet is switching on as on", () => {
        const states = moduleStatesWith(
            [mod("COMMERCE", false), mod("WEBSITE", false)],
            ["COMMERCE", "WEBSITE"],
        );
        expect(isSuggested(of("bakery"), "BUSINESS", states, "starter")).toBe(
            true,
        );
    });
});

describe("what a card says", () => {
    it("names what a template uses in the merchant's words", () => {
        expect(usesLine(t("x", { uses: ["COMMERCE"] }))).toBe("Uses Products");
        expect(
            usesLine(
                t("x", { uses: ["APPOINTMENTS", "PAYMENTS", "CLASS_PACKS"] }),
            ),
        ).toBe("Uses Bookings, Plans and Class packs");
        expect(usesLine(t("x", { uses: ["WEBSITE", "CRM"] }))).toBe(
            "Uses Enquiries",
        );
        expect(usesLine(t("x", { uses: ["WEBSITE"] }))).toBeNull();
        expect(usesLine(t("x", { uses: undefined }))).toBeNull();
    });

    it("says what it is built around", () => {
        expect(shapeWord(t("x", { shape: "store" }))).toBe("Shop");
        expect(shapeWord(t("x", { shape: null }))).toBeNull();
    });

    it("says which module holds sections back, never refusing (DEC-070)", () => {
        const states = moduleStates([
            mod("COMMERCE", false),
            mod("APPOINTMENTS", true),
            mod("PAYMENTS", false),
            mod("CLASS_PACKS", false),
            mod("CRM", false),
        ]);
        expect(offReason(of("bakery"), states)).toBe(
            "Uses Sell: turn it on to use this",
        );
        // Class packs aren't offered (DEC-099), so they are never named.
        expect(offReason(of("gym"), states)).toBe(
            "Uses Payments: turn it on to use this",
        );
        // Contacts off holds nothing back: enquiries still arrive.
        expect(offReason(of("developer"), states)).toBeNull();
    });

    it("never names a module Saroh hasn't offered the business (DEC-057)", () => {
        const states = moduleStates([mod("COMMERCE", false, true)]);
        expect(offReason(of("bakery"), states)).toBeNull();
    });

    it("says nothing when the modules couldn't be read", () => {
        expect(offReason(of("bakery"), moduleStates(null))).toBeNull();
    });

    it("names every module off, once", () => {
        const states = moduleStates([
            mod("APPOINTMENTS", false),
            mod("PAYMENTS", false),
        ]);
        expect(offReason(of("gym"), states)).toBe(
            "Uses Bookings and Payments: turn them on to use this",
        );
    });
});

describe("the trade (DEC-216)", () => {
    it("names who the suggestions are for", () => {
        expect(suggestedTitle("salon")).toBe("Suggested for salons");
        expect(suggestedTitle("other")).toBe("Suggested");
        expect(suggestedTitle(null)).toBe("Suggested");
        // Other says the trade typed beside it (12 Nov 2026).
        expect(suggestedTitle("other", "Bakery")).toBe("Suggested for Bakery");
        expect(suggestedTitle("shop", "Bakery")).toBe("Suggested for shops");
    });
});

describe("the picker's groups (DEC-216)", () => {
    const groups = (...args: Parameters<typeof templateGroups<Template>>) =>
        templateGroups(...args).map((g) => [g.title, ids(g.templates)]);

    it("puts the trade's own first, the default leading, then the rest, then those that need a module", () => {
        const states = moduleStates([
            mod("COMMERCE", false),
            mod("APPOINTMENTS", true),
            mod("PAYMENTS", true),
        ]);
        expect(
            groups(CATALOGUE, {
                trade: "coach",
                kind: "BUSINESS",
                modules: states,
                defaultId: "starter",
            }),
        ).toEqual([
            ["Suggested for coaches", ["starter", "blogs", "dietician"]],
            [
                "Made for other trades",
                [
                    "personal",
                    "portfolio",
                    "writing",
                    "gym",
                    "studio",
                    "developer",
                ],
            ],
            ["Need Sell", ["ceramics", "bakery"]],
        ]);
    });

    it("suggests the trade's templates even with their module off, saying why on the card", () => {
        const states = moduleStates([mod("APPOINTMENTS", false)]);
        const [suggested] = templateGroups(CATALOGUE, {
            trade: "clinic",
            kind: "BUSINESS",
            modules: states,
            defaultId: "starter",
        });
        expect(ids(suggested.templates)).toEqual(["starter", "dietician"]);
        expect(offReason(of("dietician"), states)).toBe(
            "Uses Bookings: turn it on to use this",
        );
    });

    it("falls back to the kind's rules with no trade", () => {
        const states = moduleStates([mod("COMMERCE", false)]);
        const [suggested] = templateGroups(CATALOGUE, {
            trade: null,
            kind: "WORK",
            modules: states,
            defaultId: "portfolio",
        });
        expect(suggested.title).toBe("Suggested");
        expect(ids(suggested.templates)).toEqual(
            ids(suggestedTemplates(CATALOGUE, "WORK", states, "portfolio")),
        );
    });

    it("puts every template in exactly one group, and leaves out an empty one", () => {
        const all = templateGroups(CATALOGUE, {
            trade: "gym",
            kind: "BUSINESS",
            modules: null,
            defaultId: "starter",
        });
        expect(all.flatMap((g) => ids(g.templates)).sort()).toEqual(
            ids(CATALOGUE).sort(),
        );
        // Modules not known: none is said to be off.
        expect(all.map((g) => g.title)).toEqual([
            "Suggested for gyms",
            "Made for other trades",
        ]);
    });

    it("reads Something else as no trade: the kind's rules", () => {
        const basis = {
            kind: "BUSINESS",
            modules: null,
            defaultId: "starter",
        };
        expect(
            ids(
                templateGroups(CATALOGUE, { ...basis, trade: "other" })[0]
                    .templates,
            ),
        ).toEqual(
            ids(
                templateGroups(CATALOGUE, { ...basis, trade: null })[0]
                    .templates,
            ),
        );
    });

    it("is one group when there is one template", () => {
        expect(
            groups([t("personal")], {
                trade: null,
                kind: "SOLO",
                modules: null,
                defaultId: "personal",
            }),
        ).toEqual([["Suggested", ["personal"]]]);
    });
});

describe("the template it starts on", () => {
    it("is the one the address asks for, by id or slug", () => {
        const list = [t("starter"), t("ceramics", { slug: "store" })];
        expect(startingTemplate(list, "store", "starter")).toBe("ceramics");
        expect(startingTemplate(list, "ceramics", "starter")).toBe("ceramics");
    });

    it("else the kind's, else the first", () => {
        const list = [t("starter"), t("portfolio")];
        expect(startingTemplate(list, "gone", "portfolio")).toBe("portfolio");
        expect(startingTemplate(list, null, "gone")).toBe("starter");
        expect(startingTemplate([], null, "starter")).toBeNull();
    });
});
