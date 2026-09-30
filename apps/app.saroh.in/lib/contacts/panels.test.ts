import { describe, expect, it } from "vitest";

import type { ModuleStates } from "./panels";
import { contactPanels, moduleOn, sellPacksOnly, viewerCan } from "./panels";

const on = (...keys: string[]): ModuleStates =>
    ["PAYMENTS", "APPOINTMENTS", "CLASS_PACKS", "COURSES", "CRM"].map(
        (key) => ({
            key,
            readiness: keys.includes(key) ? "ACTIVE" : "DISABLED",
        }),
    );

const ALL = on("PAYMENTS", "APPOINTMENTS", "CLASS_PACKS", "COURSES", "CRM");

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

    it("offers Sell a pack to a role that sells packs, and not to one that only reads them (E26)", () => {
        const seller = contactPanels(
            { role: "MEMBER", actions: ["pack:sell", "pack:read"] },
            ALL,
        );
        expect(seller.panels).toEqual(["packs"]);
        expect(seller.canAct.packs).toBe(true);
        // An API from before E26 sends pack:write, which sold then.
        const legacy = contactPanels(
            { role: "MEMBER", actions: ["pack:read", "pack:write"] },
            ALL,
        );
        expect(legacy.canAct.packs).toBe(true);
    });

    it("drops subscriptions with Payments off and keeps invoices, with no invoice mentions on packs and courses (DEC-070)", () => {
        const plan = contactPanels(
            { role: "OWNER" },
            on("APPOINTMENTS", "CLASS_PACKS", "COURSES", "CRM"),
        );
        expect(plan.panels).toEqual(["packs", "courses", "invoices"]);
        expect(plan.canAct.subscriptions).toBe(false);
        expect(plan.canAct.invoices).toBe(true);
        // A pack or course sold with Payments off issues no invoice.
        expect(plan.mentionInvoices).toBe(false);
        expect(plan.paymentsOn).toBe(false);
    });

    it("gives a business with no modules on its invoices, to a role that reads them", () => {
        expect(contactPanels({ role: "OWNER" }, on()).panels).toEqual([
            "invoices",
        ]);
        expect(contactPanels({ role: "MEMBER" }, on()).panels).toEqual([]);
    });

    it("drops packs with Class packs off and courses with Courses off", () => {
        expect(contactPanels({ role: "ADMIN" }, on("PAYMENTS")).panels).toEqual(
            ["subscriptions", "invoices"],
        );
    });

    it("follows Class packs, not Appointments, for the packs panel (E12)", () => {
        expect(
            contactPanels(
                { role: "OWNER" },
                on("PAYMENTS", "APPOINTMENTS", "COURSES", "CRM"),
            ).panels,
        ).not.toContain("packs");
        expect(
            contactPanels({ role: "OWNER" }, on("CLASS_PACKS")).panels,
        ).toContain("packs");
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

describe("sellPacksOnly (C7)", () => {
    it("asks for no panel, only what selling a pack needs", () => {
        const plan = sellPacksOnly();
        expect(plan.panels).toEqual([]);
        expect(plan.canAct).toEqual({
            subscriptions: false,
            packs: true,
            courses: false,
            invoices: false,
        });
        // Nothing read through it may mention an invoice.
        expect(plan.mentionInvoices).toBe(false);
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
