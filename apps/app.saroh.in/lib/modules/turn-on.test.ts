import { describe, expect, it } from "vitest";

import type { ModuleView } from "./schema";
import {
    comesWithLines,
    draftFrom,
    finishSetupItems,
    hoursErrorsByWeekday,
    landingHref,
    moduleName,
    problemsOf,
    PROVIDERS_HREF,
    sellsOnline,
    setupFor,
    tidyAddress,
    turnedOnToast,
    turnOnPlan,
} from "./turn-on";
import { fieldErrorsOf, normalisePath, suggestionOf } from "./turn-on-errors";
import { decodeSetupDefaults, FALLBACK_SETUP } from "./turn-on-schema";

const NEEDS: Record<string, string[]> = {
    WEBSITE: [],
    CRM: [],
    APPOINTMENTS: ["CRM"],
    COURSES: ["APPOINTMENTS"],
    CLASS_PACKS: ["APPOINTMENTS"],
    COMMERCE: [],
    PAYMENTS: [],
    COMMUNICATIONS: ["CRM"],
    INSIGHTS: [],
};

function view(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: NEEDS[key] ?? [],
        blockers: [],
        ...over,
    };
}

const allOff = Object.keys(NEEDS).map((k) => view(k));

describe("what turns on, in order (DEC-068)", () => {
    it("turns on what a pick needs first: Class packs brings Bookings and Contacts", () => {
        const plan = turnOnPlan({ picked: ["CLASS_PACKS"], modules: allOff });
        expect(plan.order).toEqual(["CRM", "APPOINTMENTS", "CLASS_PACKS"]);
        expect(plan.comesWith).toEqual(["CRM", "APPOINTMENTS"]);
    });

    it("leaves alone what is on already", () => {
        const modules = allOff.map((m) =>
            m.key === "CRM" ? { ...m, lifecycle: "ENABLED" as const } : m,
        );
        const plan = turnOnPlan({ picked: ["APPOINTMENTS"], modules });
        expect(plan.order).toEqual(["APPOINTMENTS"]);
        expect(plan.comesWith).toEqual([]);
    });

    it("reads what setup-defaults said a module needs when the list doesn't know it", () => {
        const plan = turnOnPlan({
            picked: ["APPOINTMENTS"],
            modules: [],
            apiDeps: { APPOINTMENTS: ["CRM"] },
        });
        expect(plan.order).toEqual(["CRM", "APPOINTMENTS"]);
    });

    it("several picks share what they need once", () => {
        const plan = turnOnPlan({
            picked: ["COMMERCE", "APPOINTMENTS", "COURSES"],
            modules: allOff,
        });
        expect(plan.order).toEqual([
            "COMMERCE",
            "CRM",
            "APPOINTMENTS",
            "COURSES",
        ]);
        expect(plan.comesWith).toEqual(["CRM"]);
    });

    it("selling online brings Website after Sell (DEC-069)", () => {
        const plan = turnOnPlan({
            picked: ["COMMERCE"],
            modules: allOff,
            sellsOnline: true,
        });
        expect(plan.order).toEqual(["COMMERCE", "WEBSITE"]);
        expect(plan.websiteForShop).toBe(true);
        expect(plan.comesWith).toEqual([]);
    });

    it("pick-up only, or a website already on, brings no website", () => {
        expect(
            turnOnPlan({ picked: ["COMMERCE"], modules: allOff }).order,
        ).toEqual(["COMMERCE"]);
        const withSite = allOff.map((m) =>
            m.key === "WEBSITE" ? { ...m, lifecycle: "ENABLED" as const } : m,
        );
        const plan = turnOnPlan({
            picked: ["COMMERCE"],
            modules: withSite,
            sellsOnline: true,
        });
        expect(plan.order).toEqual(["COMMERCE"]);
        expect(plan.websiteForShop).toBe(false);
    });

    it("never brings a website Saroh hasn't rolled out", () => {
        const dark = allOff.map((m) =>
            m.key === "WEBSITE"
                ? { ...m, blockers: [{ code: "ROLLOUT_DISABLED" }] }
                : m,
        );
        const plan = turnOnPlan({
            picked: ["COMMERCE"],
            modules: dark,
            sellsOnline: true,
        });
        expect(plan.order).toEqual(["COMMERCE"]);
    });
});

describe("what the sheet says comes with it", () => {
    it("uses the first-run card's words for Bookings", () => {
        const plan = turnOnPlan({ picked: ["APPOINTMENTS"], modules: allOff });
        expect(comesWithLines(plan, allOff)).toEqual([
            "Bookings need someone to book, so Contacts comes with it.",
        ]);
    });

    it("names who needs each module it brings, in the app's words", () => {
        const plan = turnOnPlan({ picked: ["CLASS_PACKS"], modules: allOff });
        expect(comesWithLines(plan, allOff)).toEqual([
            "Bookings need someone to book, so Contacts comes with it.",
            "Class packs are visits people book, so Bookings comes with it.",
        ]);
    });

    it("falls back to a plain sentence for a pair it has no words for", () => {
        const modules = [
            view("INSIGHTS", { dependencies: ["COMMERCE"] }),
            view("COMMERCE"),
        ];
        const plan = turnOnPlan({ picked: ["INSIGHTS"], modules });
        expect(comesWithLines(plan, modules)).toEqual([
            "Insights needs Sell, so Sell comes with it.",
        ]);
    });

    it("calls modules by the rail's names", () => {
        expect(moduleName("COMMERCE")).toBe("Sell");
        expect(moduleName("APPOINTMENTS")).toBe("Bookings");
        expect(moduleName("CRM")).toBe("Contacts");
        expect(moduleName("NEW", [{ key: "NEW", label: "Brand new" }])).toBe(
            "Brand new",
        );
    });
});

describe("the draft and what it sends", () => {
    const defaults = [
        decodeSetupDefaults("COMMERCE", {
            data: {
                defaults: {
                    storefrontName: "Northwind",
                    fulfilment: ["PICKUP"],
                },
                dependencies: [],
                hidden: false,
            },
        }),
        decodeSetupDefaults("APPOINTMENTS", {
            defaults: {
                hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
                    weekday,
                    open: "10:00",
                    close: "19:00",
                })),
                service: {
                    name: "Consultation",
                    durationMinutes: 30,
                    price: "500.00",
                },
            },
            dependencies: ["CRM"],
            hidden: false,
        }),
        decodeSetupDefaults("WEBSITE", {
            defaults: { siteName: "Northwind", address: "northwind" },
            dependencies: [],
            hidden: false,
        }),
    ];

    it("starts from the API's defaults", () => {
        const draft = draftFrom(defaults);
        expect(draft.COMMERCE.storefrontName).toBe("Northwind");
        expect(draft.WEBSITE.address).toBe("northwind");
        expect(draft.APPOINTMENTS.name).toBe("Consultation");
        expect(draft.APPOINTMENTS.duration).toBe("30");
        // Mon–Sat open, Sunday closed; Monday first.
        expect(draft.APPOINTMENTS.days.map((d) => d.on)).toEqual([
            true,
            true,
            true,
            true,
            true,
            true,
            false,
        ]);
    });

    it("falls back to Mon–Sat 10–7 when the defaults couldn't be read", () => {
        const draft = draftFrom([decodeSetupDefaults("APPOINTMENTS", null)]);
        expect(setupFor("APPOINTMENTS", draft)).toMatchObject({
            hours: FALLBACK_SETUP.APPOINTMENTS.hours,
        });
        expect(draft.COMMERCE.fulfilment).toEqual(["PICKUP"]);
    });

    it("sends each module's setup in the contract's shape", () => {
        const draft = draftFrom(defaults);
        draft.COMMERCE.fulfilment = ["SHIPPING", "PICKUP"];
        draft.COMMERCE.storefrontName = "  Northwind Bazaar ";
        expect(setupFor("COMMERCE", draft)).toEqual({
            storefrontName: "Northwind Bazaar",
            fulfilment: ["PICKUP", "SHIPPING"],
        });
        expect(setupFor("APPOINTMENTS", draft)).toEqual({
            hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
                weekday,
                open: "10:00",
                close: "19:00",
            })),
            service: {
                name: "Consultation",
                durationMinutes: 30,
                price: "500.00",
            },
        });
        expect(setupFor("WEBSITE", draft)).toEqual({
            siteName: "Northwind",
            address: "northwind",
        });
        for (const k of ["CRM", "PAYMENTS", "INSIGHTS", "CLASS_PACKS"]) {
            expect(setupFor(k, draft)).toEqual({});
        }
    });

    it("knows delivery and shipping are selling online", () => {
        const draft = draftFrom(defaults);
        expect(sellsOnline(draft)).toBe(false);
        draft.COMMERCE.fulfilment = ["PICKUP", "LOCAL_DELIVERY"];
        expect(sellsOnline(draft)).toBe(true);
    });

    it("tidies an address as it is typed", () => {
        expect(tidyAddress("My Shop!")).toBe("my-shop");
        expect(tidyAddress("Café 24")).toBe("caf-24");
        // Never two hyphens in a row, never past 57 (DEC-071).
        expect(tidyAddress("my--shop")).toBe("my-shop");
        expect(tidyAddress("a".repeat(70))).toHaveLength(57);
    });
});

describe("problems found before sending", () => {
    const draft = () => draftFrom([]);

    it("asks for what is plainly missing, on its field", () => {
        const d = draft();
        d.COMMERCE.fulfilment = [];
        d.APPOINTMENTS.duration = "0";
        d.APPOINTMENTS.price = "5,00";
        d.WEBSITE.address = "-no";
        const problems = problemsOf(d, ["COMMERCE", "APPOINTMENTS", "WEBSITE"]);
        expect(Object.keys(problems.COMMERCE ?? {})).toEqual([
            "storefrontName",
            "fulfilment",
        ]);
        expect(Object.keys(problems.APPOINTMENTS ?? {})).toEqual([
            "service.name",
            "service.durationMinutes",
            "service.price",
        ]);
        expect(Object.keys(problems.WEBSITE ?? {})).toEqual([
            "siteName",
            "address",
        ]);
    });

    it("refuses a web address the API would: two hyphens, or past 57 (DEC-071)", () => {
        const d = draft();
        d.WEBSITE.siteName = "Rye";
        d.WEBSITE.address = "my--shop";
        expect(problemsOf(d, ["WEBSITE"]).WEBSITE).toEqual({
            address: "An address can't have two hyphens in a row.",
        });
        d.WEBSITE.address = "a".repeat(58);
        expect(problemsOf(d, ["WEBSITE"]).WEBSITE?.address).toMatch(/3 to 57/);
        d.WEBSITE.address = "a".repeat(57);
        expect(problemsOf(d, ["WEBSITE"])).toEqual({});
    });

    it("only judges the modules being turned on", () => {
        expect(problemsOf(draft(), ["CRM", "INSIGHTS"])).toEqual({});
    });

    it("puts a day whose close isn't after its open on that day", () => {
        const d = draft();
        d.APPOINTMENTS.name = "Cut";
        d.APPOINTMENTS.price = "300";
        const tuesday = d.APPOINTMENTS.days.find((x) => x.weekday === 2);
        if (tuesday) tuesday.close = "09:00";
        const problems = problemsOf(d, ["APPOINTMENTS"]);
        expect(problems.APPOINTMENTS).toEqual({
            "hours.1": "Close after you open.",
        });
        expect(
            hoursErrorsByWeekday(problems.APPOINTMENTS ?? {}, d).get(2),
        ).toBe("Close after you open.");
    });

    it("asks for at least one open day", () => {
        const d = draft();
        d.APPOINTMENTS.days = d.APPOINTMENTS.days.map((x) => ({
            ...x,
            on: false,
        }));
        expect(problemsOf(d, ["APPOINTMENTS"]).APPOINTMENTS?.hours).toBe(
            "Open on at least one day.",
        );
    });
});

describe("the API's field errors (a 400 with field paths)", () => {
    it("normalises a path", () => {
        expect(normalisePath("setup.hours[2].open")).toBe("hours.2.open");
        expect(normalisePath("setup.address")).toBe("address");
    });

    it("reads a single named field", () => {
        expect(
            fieldErrorsOf({
                error: {
                    message: "That address is taken.",
                    details: { field: "setup.address" },
                },
            }),
        ).toEqual({ address: "That address is taken." });
    });

    it("reads a map or a list of fields", () => {
        expect(
            fieldErrorsOf({
                error: {
                    message: "Validation failed",
                    details: {
                        fields: { "setup.service.price": "Write a price." },
                    },
                },
            }),
        ).toEqual({ "service.price": "Write a price." });
        expect(
            fieldErrorsOf({
                error: {
                    message: "Validation failed",
                    details: [
                        { path: "setup.siteName", message: "Name it." },
                        {
                            property: "setup.hours[0].close",
                            constraints: { a: "Too early." },
                        },
                    ],
                },
            }),
        ).toEqual({ siteName: "Name it.", "hours.0.close": "Too early." });
    });

    it("reads class-validator's sentences and ignores a plain one", () => {
        expect(
            fieldErrorsOf({
                error: {
                    message: "Validation failed",
                    details: [
                        "setup.storefrontName should not be empty",
                        "Something went wrong",
                    ],
                },
            }),
        ).toEqual({
            storefrontName: "setup.storefrontName should not be empty",
        });
    });

    it("reads the 409 for a taken address, and the free one it offers", () => {
        const body = {
            error: {
                code: "CONFLICT",
                message: "northwind.saroh.app belongs to another business",
                details: {
                    field: "setup.address",
                    reason: "taken",
                    suggestion: "northwind-2",
                },
            },
        };
        expect(fieldErrorsOf(body)).toEqual({
            address: "northwind.saroh.app belongs to another business",
        });
        expect(suggestionOf(body)).toBe("northwind-2");
        expect(suggestionOf({ error: { message: "No." } })).toBeNull();
    });

    it("finds nothing in a body with no fields", () => {
        expect(fieldErrorsOf({ error: { message: "No." } })).toEqual({});
        expect(fieldErrorsOf(null)).toEqual({});
    });
});

describe("after it is on", () => {
    it("lands on the first pick's screen, or Providers when connecting now", () => {
        const d = draftFrom([]);
        const plan = turnOnPlan({ picked: ["APPOINTMENTS"], modules: allOff });
        expect(landingHref(["APPOINTMENTS"], plan, d)).toBe("/bookings");
        const pay = turnOnPlan({ picked: ["PAYMENTS"], modules: allOff });
        expect(landingHref(["PAYMENTS"], pay, d)).toBe(PROVIDERS_HREF);
        d.connect.PAYMENTS = false;
        expect(landingHref(["PAYMENTS"], pay, d)).toBe(
            "/billing/subscriptions",
        );
        const comms = turnOnPlan({
            picked: ["COMMUNICATIONS"],
            modules: allOff,
        });
        d.connect.COMMUNICATIONS = false;
        expect(landingHref(["COMMUNICATIONS"], comms, d)).toBeNull();
    });

    it("lists the Finish setup items in the app's words, never a code or a gate", () => {
        const items = finishSetupItems([
            view("COMMERCE", {
                lifecycle: "ENABLED",
                readiness: "SETUP_REQUIRED",
                blockers: [
                    { code: "COMMERCE_NO_CATALOG" },
                    { code: "ENTITLEMENT_REQUIRED" },
                ],
            }),
            view("WEBSITE", {
                lifecycle: "ENABLED",
                readiness: "SETUP_REQUIRED",
                blockers: [
                    { code: "WEBSITE_NO_PUBLICATION", message: "Publish it." },
                ],
            }),
            view("CRM", { lifecycle: "ENABLED", readiness: "ACTIVE" }),
            null,
        ]);
        expect(items).toEqual([
            "Add a product to start selling.",
            "Publish it.",
        ]);
        expect(turnedOnToast(["Sell", "Website"], items)).toBe(
            "Sell and Website are on. Finish setup: Add a product to start selling. Publish it.",
        );
        expect(turnedOnToast(["Contacts"], [])).toBe("Contacts is on.");
    });
});

describe("decoding setup-defaults", () => {
    it("keeps the fallback for a module whose defaults are in a shape it doesn't know", () => {
        const read = decodeSetupDefaults("WEBSITE", {
            defaults: { siteName: 3 },
            dependencies: [],
            hidden: true,
        });
        expect(read.defaults).toEqual(FALLBACK_SETUP.WEBSITE);
        expect(read.hidden).toBe(true);
        expect(read.read).toBe(true);
    });

    it("says it couldn't be read", () => {
        const read = decodeSetupDefaults("CRM", null);
        expect(read).toEqual({
            key: "CRM",
            defaults: null,
            dependencies: [],
            hidden: false,
            read: false,
        });
    });
});
