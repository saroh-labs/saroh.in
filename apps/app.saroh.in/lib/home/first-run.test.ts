import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import { INVOICE_JOB } from "@/lib/organizations/kind";

import {
    firstRunJobs,
    mayWriteInvoices,
    onButNotOpen,
    sidebarName,
    turnOnOrder,
} from "./first-run";

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

    it("never offers a module Saroh hasn't rolled out, nor one that needs it (DEC-057)", () => {
        const dark = [{ code: "ROLLOUT_DISABLED" }];
        const modules = ALL.map((m) =>
            m.key === "WEBSITE" || m.key === "CRM"
                ? { ...m, blockers: dark }
                : m,
        );
        // Website is dark; Contacts is dark, and Bookings needs it while off.
        expect(firstRunJobs(modules).map((j) => j.key)).toEqual(["COMMERCE"]);
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

describe("firstRunJobs by kind (DEC-070)", () => {
    const MAY_INVOICE = { mayWrite: true, hasInvoice: false };

    it("a business: Sell first, as today", () => {
        expect(firstRunJobs(ALL, "BUSINESS").map((j) => j.key)).toEqual([
            "COMMERCE",
            "APPOINTMENTS",
            "WEBSITE",
            "CRM",
        ]);
        // No kind at all (an older API) is a business.
        expect(firstRunJobs(ALL, undefined).map((j) => j.key)).toEqual(
            firstRunJobs(ALL, "BUSINESS").map((j) => j.key),
        );
    });

    it("just me: Bookings first, then Invoice a client, and Sell last but never gone", () => {
        const jobs = firstRunJobs(ALL, "SOLO", MAY_INVOICE);
        expect(jobs.map((j) => j.key)).toEqual([
            "APPOINTMENTS",
            INVOICE_JOB,
            "CRM",
            "WEBSITE",
            "COMMERCE",
        ]);
        const invoice = jobs.find((j) => j.key === INVOICE_JOB);
        expect(invoice).toMatchObject({
            verb: "Invoice a client",
            href: "/billing/invoices/new",
            pulls: [],
        });
        expect(invoice?.gives).toBeUndefined();
        expect(jobs.find((j) => j.key === "CRM")?.verb).toBe(
            "Keep track of clients",
        );
    });

    it("a site for my work: Website first, and Contacts hears from readers", () => {
        const jobs = firstRunJobs(ALL, "WORK", MAY_INVOICE);
        expect(jobs.map((j) => j.key)).toEqual([
            "WEBSITE",
            "CRM",
            "APPOINTMENTS",
            "COMMERCE",
        ]);
        expect(jobs[0]?.verb).toBe("Put up a website");
        expect(jobs.find((j) => j.key === "CRM")?.verb).toBe(
            "Hear from readers",
        );
    });

    it("an unknown kind reads as a business", () => {
        expect(firstRunJobs(ALL, "SHOP").map((j) => j.key)).toEqual([
            "COMMERCE",
            "APPOINTMENTS",
            "WEBSITE",
            "CRM",
        ]);
    });

    it("still leaves out a job whose module is dark, for every kind (DEC-057)", () => {
        const dark = [{ code: "ROLLOUT_DISABLED" }];
        const modules = ALL.map((m) =>
            m.key === "WEBSITE" ? { ...m, blockers: dark } : m,
        );
        for (const kind of ["BUSINESS", "SOLO", "WORK"]) {
            expect(
                firstRunJobs(modules, kind, MAY_INVOICE).map((j) => j.key),
            ).not.toContain("WEBSITE");
        }
    });

    it("offers Invoice a client only to someone who may write invoices", () => {
        const keys = (facts?: {
            mayWrite: boolean;
            hasInvoice: boolean | null;
        }) => firstRunJobs(ALL, "SOLO", facts).map((j) => j.key);
        // A Member without invoice:write.
        expect(keys({ mayWrite: false, hasInvoice: false })).not.toContain(
            INVOICE_JOB,
        );
        // Nobody said.
        expect(keys(undefined)).not.toContain(INVOICE_JOB);
    });

    it("drops Invoice a client once the business has an invoice, and keeps it when that can't be read", () => {
        expect(
            firstRunJobs(ALL, "SOLO", {
                mayWrite: true,
                hasInvoice: true,
            }).map((j) => j.key),
        ).not.toContain(INVOICE_JOB);
        expect(
            firstRunJobs(ALL, "SOLO", {
                mayWrite: true,
                hasInvoice: null,
            }).map((j) => j.key),
        ).toContain(INVOICE_JOB);
    });

    it("offers a SOLO Member who may turn nothing on only the invoice, when they may write one", () => {
        const modules = ALL.map((m) => ({ ...m, canManage: false }));
        expect(
            firstRunJobs(modules, "SOLO", MAY_INVOICE).map((j) => j.key),
        ).toEqual([INVOICE_JOB]);
        expect(
            firstRunJobs(modules, "SOLO", {
                mayWrite: false,
                hasInvoice: null,
            }),
        ).toEqual([]);
    });

    it("never offers Invoice a client to a business or a site for my work", () => {
        for (const kind of ["BUSINESS", "WORK"]) {
            expect(
                firstRunJobs(ALL, kind, MAY_INVOICE).map((j) => j.key),
            ).not.toContain(INVOICE_JOB);
        }
    });
});

describe("mayWriteInvoices", () => {
    it("reads the resolved actions when the API sent them", () => {
        expect(
            mayWriteInvoices({ role: "MEMBER", actions: ["invoice:write"] }),
        ).toBe(true);
        expect(
            mayWriteInvoices({ role: "OWNER", actions: ["invoice:read"] }),
        ).toBe(false);
    });

    it("falls back to the built-in roles without them", () => {
        expect(mayWriteInvoices({ role: "OWNER" })).toBe(true);
        expect(mayWriteInvoices({ role: "ADMIN" })).toBe(true);
        expect(mayWriteInvoices({ role: "MEMBER" })).toBe(false);
        expect(mayWriteInvoices(null)).toBe(false);
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

describe("onButNotOpen", () => {
    const off = { code: "UNAUTHORIZED" } as const;

    it("is true when the business runs a module this role doesn't reach", () => {
        // A Storefront team member (F16): Sell is on, but not for them.
        expect(
            onButNotOpen([
                mod("COMMERCE", {
                    lifecycle: "ENABLED",
                    canManage: false,
                    blockers: [off],
                }),
            ]),
        ).toBe(true);
    });

    it("is false when nothing is on for the business", () => {
        expect(
            onButNotOpen([
                mod("COMMERCE", {
                    canManage: false,
                    blockers: [off, { code: "ORG_MODULE_DISABLED" }],
                }),
            ]),
        ).toBe(false);
    });

    it("ignores a module Saroh hasn't rolled out", () => {
        expect(
            onButNotOpen([
                mod("COMMERCE", {
                    lifecycle: "ENABLED",
                    blockers: [off, { code: "ROLLOUT_DISABLED" }],
                }),
            ]),
        ).toBe(false);
    });
});
