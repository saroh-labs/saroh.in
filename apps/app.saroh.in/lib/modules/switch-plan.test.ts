import { describe, expect, it } from "vitest";

import {
    enabledDependents,
    listWords,
    missingDependencies,
    offImpact,
    offPlan,
    refusalActionLabel,
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
            "Courses turns off with it, and Calendar, Services and Courses leave the rail. Nothing is deleted.",
        );
        expect(offImpact({ rows: ["Insights"], dependents: [] })).toBe(
            "Insights leaves the rail. Nothing is deleted.",
        );
    });

    it("says nothing rather than invent a consequence", () => {
        expect(offImpact({ rows: [], dependents: [] })).toBeNull();
        expect(offImpact({ rows: [], dependents: [], lines: [] })).toBeNull();
    });

    it("puts the API's real counts first (F13)", () => {
        expect(
            offImpact({
                rows: ["Calendar", "Services"],
                dependents: [],
                lines: [
                    "3 upcoming bookings stay booked; the booking page stops taking new ones.",
                ],
            }),
        ).toBe(
            "3 upcoming bookings stay booked; the booking page stops taking new ones. Calendar and Services leave the rail. Nothing is deleted.",
        );
    });

    it("asks about a background module when the API has something to say", () => {
        expect(
            offImpact({
                rows: [],
                dependents: [],
                lines: [
                    "3 live subscriptions stop renewing until it's back on. Nobody is charged in between.",
                ],
            }),
        ).toBe(
            "3 live subscriptions stop renewing until it's back on. Nobody is charged in between. Nothing is deleted.",
        );
    });

    it("says it couldn't count when the API couldn't be asked", () => {
        expect(
            offImpact({ rows: ["Invoices"], dependents: [], lines: null }),
        ).toBe(
            "We couldn't count what this touches right now. Invoices leaves the rail. Nothing is deleted.",
        );
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

    it("gives a refusal a way to clear it only when it knows one", () => {
        expect(refusalActionLabel("COMMERCE_OPEN_ORDERS")).toBe("Go to Orders");
        expect(refusalActionLabel("SOMETHING_NEW")).toBeNull();
    });
});

describe("offPlan — nothing goes off unnamed (F13, DEC-067)", () => {
    const all = [
        ...catalogue(Object.keys(DEPS)),
        // Class packs needs Appointments, is on, and Saroh hasn't rolled
        // it out: the business can't see it.
        {
            key: "CLASS_PACKS",
            dependencies: ["APPOINTMENTS"],
            lifecycle: "ENABLED" as const,
        },
    ];
    const shown = all.filter((m) => m.key !== "CLASS_PACKS");

    it("turns off only what the business can see, every one to be named", () => {
        expect(offPlan(shown, all, "APPOINTMENTS")).toEqual({
            off: ["COURSES"],
            kept: ["CLASS_PACKS"],
        });
    });

    it("a hidden module that needs it is kept, never switched off unnamed", () => {
        const plan = offPlan(shown, all, "CRM");
        expect(plan.off).not.toContain("CLASS_PACKS");
        expect(plan.kept).toEqual(["CLASS_PACKS"]);
        // What goes off is each module the confirmation names.
        expect(plan.off).toEqual(
            enabledDependents(all, "CRM").filter((k) => k !== "CLASS_PACKS"),
        );
    });

    it("with nothing hidden, it is every module that needs it", () => {
        const every = catalogue(Object.keys(DEPS));
        expect(offPlan(every, every, "CRM").off).toEqual(
            enabledDependents(every, "CRM"),
        );
        expect(offPlan(every, every, "CRM").kept).toEqual([]);
    });
});
