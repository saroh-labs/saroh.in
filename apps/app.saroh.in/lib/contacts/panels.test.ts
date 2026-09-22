import { describe, expect, it } from "vitest";

import type { ModuleStates } from "./panels";
import { contactPanels, moduleOn, viewerCan } from "./panels";

const on = (...keys: string[]): ModuleStates =>
    ["PAYMENTS", "APPOINTMENTS", "COURSES", "CRM"].map((key) => ({
        key,
        readiness: keys.includes(key) ? "ACTIVE" : "DISABLED",
    }));

const ALL = on("PAYMENTS", "APPOINTMENTS", "COURSES", "CRM");

describe("contactPanels", () => {
    it("gives an owner with every module all four panels, each with its action", () => {
        const plan = contactPanels({ role: "OWNER" }, ALL);
        expect(plan.panels).toEqual([
            "subscriptions",
            "packs",
            "courses",
            "invoices",
        ]);
        expect(plan.canAct).toEqual({
            subscriptions: true,
            packs: true,
            courses: true,
            invoices: true,
        });
        expect(plan.mentionInvoices).toBe(true);
        expect(plan.paymentsOn).toBe(true);
    });

    it("requests nothing for a member, so their contact page has no forbidden screen", () => {
        const plan = contactPanels({ role: "MEMBER" }, ALL);
        expect(plan.panels).toEqual([]);
        expect(Object.values(plan.canAct).some(Boolean)).toBe(false);
        expect(plan.mentionInvoices).toBe(false);
    });

    it("goes by the actions the API resolved over the role's name", () => {
        const plan = contactPanels(
            { role: "MEMBER", actions: ["pack:read", "course:read"] },
            ALL,
        );
        expect(plan.panels).toEqual(["packs", "courses"]);
        expect(plan.canAct.packs).toBe(false);
        expect(plan.canAct.courses).toBe(false);
    });

    it("drops the money panels with Payments off, keeping packs and courses without invoice mentions", () => {
        const plan = contactPanels(
            { role: "OWNER" },
            on("APPOINTMENTS", "COURSES", "CRM"),
        );
        expect(plan.panels).toEqual(["packs", "courses"]);
        expect(plan.canAct.subscriptions).toBe(false);
        expect(plan.canAct.invoices).toBe(false);
        expect(plan.mentionInvoices).toBe(false);
        expect(plan.paymentsOn).toBe(false);
    });

    it("drops packs with Appointments off and courses with Courses off", () => {
        expect(contactPanels({ role: "ADMIN" }, on("PAYMENTS")).panels).toEqual(
            ["subscriptions", "invoices"],
        );
    });

    it("fails open when the modules could not be read", () => {
        expect(contactPanels({ role: "OWNER" }, null).panels).toHaveLength(4);
        expect(contactPanels({ role: "OWNER" }, []).panels).toHaveLength(4);
    });

    it("requests nothing with no organization", () => {
        expect(contactPanels(null, ALL).panels).toEqual([]);
    });
});

describe("moduleOn", () => {
    it("reads readiness, and treats a module it does not name as unknown", () => {
        expect(moduleOn(on("PAYMENTS"), "PAYMENTS")).toBe(true);
        expect(
            moduleOn(
                [{ key: "PAYMENTS", readiness: "SETUP_REQUIRED" }],
                "PAYMENTS",
            ),
        ).toBe(true);
        expect(moduleOn(on("CRM"), "PAYMENTS")).toBe(false);
        expect(moduleOn(on("CRM"), "SOMETHING_NEW")).toBe(true);
    });
});

describe("viewerCan", () => {
    it("falls back to owner and admin when no actions were sent", () => {
        expect(viewerCan({ role: "ADMIN" }, "invoice:read")).toBe(true);
        expect(viewerCan({ role: "REVIEWER" }, "invoice:read")).toBe(false);
        expect(viewerCan({ role: "OWNER", actions: [] }, "invoice:read")).toBe(
            false,
        );
    });
});
