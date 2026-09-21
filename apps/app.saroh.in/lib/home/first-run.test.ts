import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";

import { firstRunJobs, sidebarName, turnOnOrder } from "./first-run";

function mod(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}

const ALL = [
    mod("COMMERCE"),
    mod("APPOINTMENTS", { dependencies: ["CRM"] }),
    mod("WEBSITE"),
    mod("CRM"),
    mod("PAYMENTS"),
];

describe("firstRunJobs", () => {
    it("offers the four starting jobs, in the design's order", () => {
        expect(firstRunJobs(ALL).map((j) => j.key)).toEqual([
            "COMMERCE",
            "APPOINTMENTS",
            "WEBSITE",
            "CRM",
        ]);
    });

    it("says what a pick pulls in, from the server's dependencies", () => {
        const bookings = firstRunJobs(ALL).find(
            (j) => j.key === "APPOINTMENTS",
        );
        expect(bookings?.pulls).toEqual(["CRM"]);
    });

    it("does not count a prerequisite that is already on", () => {
        const modules = ALL.map((m) =>
            m.key === "CRM" ? { ...m, lifecycle: "ENABLED" as const } : m,
        );
        const bookings = firstRunJobs(modules).find(
            (j) => j.key === "APPOINTMENTS",
        );
        expect(bookings?.pulls).toEqual([]);
    });

    it("leaves out a job this business cannot have", () => {
        const modules = ALL.filter((m) => m.key !== "WEBSITE");
        expect(firstRunJobs(modules).map((j) => j.key)).not.toContain(
            "WEBSITE",
        );
    });

    it("leaves out a job whose prerequisite this person may not turn on", () => {
        const modules = ALL.map((m) =>
            m.key === "CRM" ? { ...m, canManage: false } : m,
        );
        const keys = firstRunJobs(modules).map((j) => j.key);
        expect(keys).not.toContain("APPOINTMENTS");
        expect(keys).not.toContain("CRM");
        expect(keys).toContain("COMMERCE");
    });

    it("offers nothing to someone who may turn nothing on", () => {
        const modules = ALL.map((m) => ({ ...m, canManage: false }));
        expect(firstRunJobs(modules)).toEqual([]);
    });
});

describe("turnOnOrder", () => {
    it("puts prerequisites before what needs them", () => {
        expect(turnOnOrder(ALL, "APPOINTMENTS")).toEqual([
            "CRM",
            "APPOINTMENTS",
        ]);
    });

    it("survives a dependency cycle rather than hanging", () => {
        const modules = [
            mod("A", { dependencies: ["B"] }),
            mod("B", { dependencies: ["A"] }),
        ];
        expect(turnOnOrder(modules, "A")).toEqual(["B", "A"]);
    });
});

describe("sidebarName", () => {
    it("names CRM the way the sidebar does", () => {
        expect(sidebarName(ALL, "CRM")).toBe("Contacts");
    });

    it("falls back to the module's own label", () => {
        expect(sidebarName(ALL, "PAYMENTS")).toBe("PAYMENTS");
    });
});
