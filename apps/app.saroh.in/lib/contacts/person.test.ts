import { describe, expect, it } from "vitest";

import type { Tab } from "@/lib/customer-workspace/view";

import type { ModuleStates, Viewer } from "./panels";
import {
    crumbsToSell,
    customerRedirectPath,
    personTabActions,
    personTabGates,
    withPersonTabs,
} from "./person";
import { personHref } from "./person-href";

const viewer = (...actions: string[]): Viewer => ({ role: "MEMBER", actions });

const modules = (states: Record<string, string>): ModuleStates =>
    Object.entries(states).map(([key, readiness]) => ({ key, readiness }));

describe("personHref (#869)", () => {
    it("is the contact's page, on a tab when one is named", () => {
        expect(personHref("c_1")).toBe("/contacts/c_1");
        expect(personHref("c_1", "inv")).toBe("/contacts/c_1?tab=inv");
        expect(personHref("c_1", null)).toBe("/contacts/c_1");
    });

    it("keeps an odd id inside its segment", () => {
        expect(personHref("a/b")).toBe("/contacts/a%2Fb");
    });
});

describe("customerRedirectPath — /customers/<id> lands on the person page", () => {
    it("takes a contact's id straight across, on the same tab", () => {
        expect(customerRedirectPath("c_1", null)).toBe("/contacts/c_1");
        expect(customerRedirectPath("c_1", null, "msg")).toBe(
            "/contacts/c_1?tab=msg",
        );
    });

    it("sends a linked store customer's id to its contact", () => {
        expect(customerRedirectPath("cus_9", "c_1", "ord")).toBe(
            "/contacts/c_1?tab=ord",
        );
    });

    it("leaves an id linked to no one for the person page to say so", () => {
        expect(customerRedirectPath("cus_9", null)).toBe("/contacts/cus_9");
    });
});

describe("personTabGates — each tab follows its module and permission", () => {
    const allOn = modules({ CRM: "ACTIVE", COURSES: "ACTIVE" });

    it("shows Leads and Enquiries with CRM on and lead:read", () => {
        const g = personTabGates(viewer("lead:read"), allOn);
        expect(g.leads).toBe(true);
        expect(g.enquiries).toBe(true);
    });

    it("hides them without lead:read — a Member who reads contacts only", () => {
        const g = personTabGates(viewer("contact:read"), allOn);
        expect(g.leads).toBe(false);
        expect(g.enquiries).toBe(false);
    });

    it("hides them where CRM is off, or not in the plan (DISABLED)", () => {
        const g = personTabGates(
            viewer("lead:read", "course:read"),
            modules({ CRM: "DISABLED", COURSES: "ACTIVE" }),
        );
        expect(g.leads).toBe(false);
        expect(g.enquiries).toBe(false);
        expect(g.courses).toBe(true);
    });

    it("shows Courses with the module on and course:read only", () => {
        expect(personTabGates(viewer("course:read"), allOn).courses).toBe(true);
        expect(personTabGates(viewer(), allOn).courses).toBe(false);
        expect(
            personTabGates(
                viewer("course:read"),
                modules({ COURSES: "DISABLED" }),
            ).courses,
        ).toBe(false);
    });

    it("counts a module still being set up as on: it holds real records", () => {
        expect(
            personTabGates(
                viewer("lead:read"),
                modules({ CRM: "SETUP_REQUIRED" }),
            ).leads,
        ).toBe(true);
    });

    it("fails open when the module list could not be read", () => {
        const g = personTabGates(viewer("lead:read", "course:read"), null);
        expect(g).toEqual({ leads: true, enquiries: true, courses: true });
    });

    it("never reads the role's name: no permissions sent, no tab (DEC-098)", () => {
        expect(personTabGates({ role: "OWNER" }, allOn)).toEqual({
            leads: false,
            enquiries: false,
            courses: false,
        });
        expect(personTabGates(null, allOn).leads).toBe(false);
    });
});

describe("personTabActions — money follows permissions (DEC-098)", () => {
    const on = modules({ PAYMENTS: "ACTIVE" });

    it("offers Subscribe with subscription:write and Payments on", () => {
        const both = viewer("subscription:read", "subscription:write");
        expect(personTabActions(both, on).subscribe).toBe(true);
        expect(
            personTabActions(both, modules({ PAYMENTS: "DISABLED" })).subscribe,
        ).toBe(false);
        expect(
            personTabActions(viewer("subscription:read"), on).subscribe,
        ).toBe(false);
    });

    it("offers New invoice with invoice:write, Payments or not (DEC-070)", () => {
        const both = viewer("invoice:read", "invoice:write");
        expect(
            personTabActions(both, modules({ PAYMENTS: "DISABLED" }))
                .newInvoice,
        ).toBe(true);
        expect(personTabActions(viewer("invoice:read"), on).newInvoice).toBe(
            false,
        );
    });

    it("offers Record payment with invoice:write, as Invoice Detail does", () => {
        const both = viewer("invoice:read", "invoice:write");
        expect(
            personTabActions(both, modules({ PAYMENTS: "DISABLED" }))
                .recordPayment,
        ).toBe(true);
        expect(personTabActions(viewer("invoice:read"), on).recordPayment).toBe(
            false,
        );
        expect(personTabActions(null, on).recordPayment).toBe(false);
    });

    it("never grants by role name", () => {
        expect(personTabActions({ role: "OWNER" }, on)).toEqual({
            subscribe: false,
            newInvoice: false,
            recordPayment: false,
        });
    });
});

describe("withPersonTabs", () => {
    const tab = (key: Tab["key"], label: string = key): Tab => ({
        key,
        label,
        count: null,
    });

    it("puts Leads and Enquiries after Overview and Courses before billing", () => {
        const base = [tab("over"), tab("ord"), tab("sub"), tab("notes")];
        const keys = withPersonTabs(base, [
            tab("crs"),
            tab("enq"),
            tab("lead"),
        ]).map((t) => t.key);
        expect(keys).toEqual([
            "over",
            "lead",
            "enq",
            "ord",
            "crs",
            "sub",
            "notes",
        ]);
    });

    it("leaves the read's tabs alone when there is nothing to add", () => {
        const base = [tab("over"), tab("bk"), tab("msg"), tab("notes")];
        expect(withPersonTabs(base, [])).toEqual(base);
    });

    it("never draws a tab twice", () => {
        const keys = withPersonTabs(
            [tab("over"), tab("notes")],
            [tab("notes", "Again")],
        ).map((t) => t.label);
        expect(keys).toEqual(["over", "notes"]);
    });
});

describe("crumbsToSell — the crumb leads to Contacts", () => {
    it("is Contacts wherever CRM is on, buyer or not", () => {
        expect(crumbsToSell(true, true, 2)).toBe(false);
        expect(crumbsToSell(true, false, 0)).toBe(false);
    });

    it("is Sell › Customers only with CRM off, for someone who buys (#858)", () => {
        expect(crumbsToSell(false, true, 1)).toBe(true);
        expect(crumbsToSell(false, true, 0)).toBe(false);
        expect(crumbsToSell(false, false, 0)).toBe(false);
    });
});
