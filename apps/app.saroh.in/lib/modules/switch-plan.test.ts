import { describe, expect, it } from "vitest";

import {
    enabledDependents,
    listWords,
    missingDependencies,
    offImpact,
    setupActionLabel,
} from "./switch-plan";

// The API's registry, as `GET /modules` sends it.
const DEPS: Record<string, string[]> = {
    WEBSITE: [],
    CRM: [],
    APPOINTMENTS: ["CRM"],
    COURSES: ["APPOINTMENTS"],
    COMMERCE: [],
    PAYMENTS: [],
    COMMUNICATIONS: ["CRM"],
    AUTOMATIONS: ["CRM"],
    INSIGHTS: [],
};

function catalogue(on: string[]) {
    return Object.entries(DEPS).map(([key, dependencies]) => ({
        key,
        dependencies,
        lifecycle: on.includes(key)
            ? ("ENABLED" as const)
            : ("DISABLED" as const),
    }));
}

describe("turning a module off", () => {
    it("takes what needs it along, a module before what it needs", () => {
        const all = catalogue(Object.keys(DEPS));
        expect(enabledDependents(all, "CRM")).toEqual([
            "COURSES",
            "APPOINTMENTS",
            "COMMUNICATIONS",
            "AUTOMATIONS",
        ]);
        expect(enabledDependents(all, "APPOINTMENTS")).toEqual(["COURSES"]);
    });

    it("leaves out what is already off", () => {
        const some = catalogue(["CRM", "APPOINTMENTS", "AUTOMATIONS"]);
        expect(enabledDependents(some, "CRM")).toEqual([
            "APPOINTMENTS",
            "AUTOMATIONS",
        ]);
    });

    it("takes nothing when nothing needs it", () => {
        expect(enabledDependents(catalogue(["COMMERCE"]), "COMMERCE")).toEqual(
            [],
        );
    });
});

describe("turning a module on", () => {
    it("turns on what it needs first, in the order the API accepts", () => {
        expect(missingDependencies(catalogue([]), "COURSES")).toEqual([
            "CRM",
            "APPOINTMENTS",
        ]);
        expect(missingDependencies(catalogue(["CRM"]), "COURSES")).toEqual([
            "APPOINTMENTS",
        ]);
    });

    it("needs nothing when its dependencies are on", () => {
        expect(
            missingDependencies(catalogue(["CRM", "APPOINTMENTS"]), "COURSES"),
        ).toEqual([]);
        expect(missingDependencies(catalogue([]), "WEBSITE")).toEqual([]);
    });
});

describe("what turning it off says", () => {
    it("names the modules that go with it and the rows that leave", () => {
        expect(
            offImpact({
                rows: ["Calendar", "Services", "Courses"],
                dependents: ["Courses"],
            }),
        ).toBe(
            "If you turn it off: Courses turns off with it, and Calendar, Services and Courses leave the rail. Nothing is deleted.",
        );
        expect(offImpact({ rows: ["Insights"], dependents: [] })).toBe(
            "If you turn it off: Insights leaves the rail. Nothing is deleted.",
        );
    });

    it("says nothing rather than invent a consequence", () => {
        expect(offImpact({ rows: [], dependents: [] })).toBeNull();
    });
});

describe("words", () => {
    it("joins a list as a sentence", () => {
        expect(listWords([])).toBe("");
        expect(listWords(["Sell"])).toBe("Sell");
        expect(listWords(["Orders", "Products", "Customers"])).toBe(
            "Orders, Products and Customers",
        );
    });

    it("gives a setup step a verb only when it knows one", () => {
        expect(setupActionLabel("CRM_NO_PIPELINE")).toBe("Create a pipeline");
        expect(setupActionLabel("AUTOMATIONS_NO_RULE")).toBeNull();
    });
});
