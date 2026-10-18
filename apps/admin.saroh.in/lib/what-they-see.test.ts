import { describe, expect, it } from "vitest";

import type {
    BusinessModulesState,
    BusinessModuleState,
    BusinessPlan,
    BusinessView,
    CatalogueModuleRow,
    Panel,
    SiteTrackersRow,
} from "./businesses";
import {
    addressHost,
    addressLabel,
    lockedWords,
    moduleWords,
    paymentWords,
    planWords,
    providerName,
    trackerWords,
    websiteWords,
    whatTheySee,
} from "./what-they-see";

const row = (over: Partial<CatalogueModuleRow>): CatalogueModuleRow => ({
    moduleId: "blog",
    name: "Blog",
    state: "on",
    limit: null,
    per: "",
    planState: "on",
    planLimit: null,
    override: "",
    usage: null,
    limitable: false,
    ...over,
});

const plan = (over: Partial<BusinessPlan> = {}): BusinessPlan => ({
    effective: {
        id: "growth",
        name: "Growth",
        basePlanId: "growth",
        basePlanName: "Growth",
        override: null,
    },
    subscription: null,
    catalogue: null,
    legacyReason: null,
    overrides: [],
    limits: [],
    ...over,
});

const site = (over: Partial<SiteTrackersRow> = {}): SiteTrackersRow => ({
    id: "s1",
    name: "Northwind",
    subdomain: "northwind",
    trackersOn: 0,
    switchedOff: null,
    switchedOffBy: null,
    ...over,
});

describe("planWords", () => {
    it("names the plan they are on", () => {
        expect(planWords(plan())).toBe("Growth");
    });
    it("falls back to the subscription's plan, then the free floor", () => {
        expect(
            planWords(
                plan({
                    effective: null,
                    subscription: {
                        status: "ACTIVE",
                        plan: {
                            id: "p",
                            key: "pro",
                            name: "Pro",
                            version: 1,
                            interval: "MONTH",
                        },
                        provider: null,
                        currentPeriodEnd: null,
                        cancelAtPeriodEnd: false,
                    },
                }),
            ),
        ).toBe("Pro");
        expect(planWords(plan({ effective: null }))).toBe(
            "No plan — the free floor applies",
        );
    });
});

const mod = (over: Partial<BusinessModuleState>): BusinessModuleState => ({
    moduleKey: "WEBSITE",
    label: "Website",
    state: "on",
    blocker: null,
    reason: null,
    fix: null,
    dependencies: [],
    ...over,
});

const modules = (
    rows: BusinessModuleState[],
    over: Partial<BusinessModulesState> = {},
): BusinessModulesState => ({
    organizationId: "o1",
    planLimitsEnforced: true,
    note: null,
    modules: rows,
    ...over,
});

describe("moduleWords", () => {
    it("words each module's true state with the API's reason", () => {
        expect(
            moduleWords(
                modules([
                    mod({}),
                    mod({ moduleKey: "CRM", label: "CRM" }),
                    mod({
                        moduleKey: "APPOINTMENTS",
                        label: "Bookings",
                        state: "off",
                        blocker: "ROLLOUT_DISABLED",
                        reason: "Release off for everyone",
                    }),
                    mod({
                        moduleKey: "COURSES",
                        label: "Courses",
                        state: "locked",
                        blocker: "ENTITLEMENT_REQUIRED",
                        reason: "Not in their plan",
                    }),
                ]),
            ),
        ).toBe(
            "On: Website, CRM. Off: Bookings (release off for everyone). Locked: Courses (not in their plan).",
        );
    });

    it("never says On for a module whose release is off, whatever their switch", () => {
        const words = moduleWords(
            modules([
                mod({
                    moduleKey: "APPOINTMENTS",
                    label: "Bookings",
                    state: "off",
                    reason: "Release off for everyone",
                }),
            ]),
        );
        expect(words).toBe(
            "None on. Off: Bookings (release off for everyone).",
        );
    });

    it("lists an on module by name only, even with setup still to do", () => {
        expect(
            moduleWords(modules([mod({ reason: "Publish a page first" })])),
        ).toBe("On: Website.");
    });
});

describe("lockedWords", () => {
    it("gives the plan's reason for each row that is off", () => {
        expect(
            lockedWords(
                plan({
                    catalogue: {
                        modules: [
                            row({ name: "Products" }),
                            row({ name: "Blog", state: "locked" }),
                            row({
                                name: "Courses",
                                state: "hidden",
                                override: "Removed by Saroh",
                            }),
                        ],
                    } as BusinessPlan["catalogue"],
                }),
            ),
        ).toBe(
            "Blog (not in their plan, shown locked), Courses (removed by Saroh, hidden)",
        );
    });
    it("is null when everything is on, or off the catalogue", () => {
        expect(lockedWords(plan())).toBeNull();
        expect(
            lockedWords(
                plan({
                    catalogue: {
                        modules: [row({})],
                    } as BusinessPlan["catalogue"],
                }),
            ),
        ).toBeNull();
    });
});

describe("paymentWords", () => {
    it("says connected or not, by provider name, and nothing more", () => {
        expect(paymentWords([])).toBe("Not connected");
        expect(
            paymentWords([
                {
                    provider: "CASHFREE",
                    connected: false,
                    needsAttention: false,
                },
            ]),
        ).toBe("Not connected");
        expect(
            paymentWords([
                {
                    provider: "RAZORPAY",
                    connected: true,
                    needsAttention: false,
                },
            ]),
        ).toBe("Connected: Razorpay");
    });
    it("says when the provider refused the keys", () => {
        expect(
            paymentWords([
                { provider: "RAZORPAY", connected: true, needsAttention: true },
            ]),
        ).toBe(
            "Connected: Razorpay (its keys were refused — they need entering again)",
        );
    });
    it("words an unknown provider plainly", () => {
        expect(providerName("STRIPE")).toBe("Stripe");
    });
});

describe("websiteWords", () => {
    const s = (published: boolean, name = "Northwind") => ({
        id: name,
        name,
        published,
        addresses: [],
    });
    it("says plainly when nothing is published", () => {
        expect(websiteWords([])).toBe("No site yet");
        expect(websiteWords([s(false)])).toBe(
            "Not published — 1 site, none live",
        );
    });
    it("names what is published", () => {
        expect(websiteWords([s(true)])).toBe("Published: Northwind");
        expect(websiteWords([s(true), s(false, "Draft")])).toBe(
            "Published: Northwind (1 not published)",
        );
    });
});

describe("trackerWords", () => {
    it("is off with none set up", () => {
        expect(trackerWords([site()], plan())).toBe("Off — none set up");
    });
    it("is on with trackers on, counted", () => {
        expect(trackerWords([site({ trackersOn: 2 })], plan())).toBe(
            "On — 2 trackers",
        );
    });
    it("says Saroh switched them off, before anything else", () => {
        expect(
            trackerWords(
                [
                    site({
                        trackersOn: 2,
                        switchedOff: {
                            at: "2026-10-09T00:00:00Z",
                            reason: null,
                            byUserId: null,
                        },
                    }),
                ],
                plan(),
            ),
        ).toBe("Off — switched off by Saroh on Northwind");
    });
    it("is off when their plan doesn't include trackers", () => {
        expect(
            trackerWords(
                [site({ trackersOn: 1 })],
                plan({
                    catalogue: {
                        modules: [
                            row({ moduleId: "site-trackers", state: "locked" }),
                        ],
                    } as BusinessPlan["catalogue"],
                }),
            ),
        ).toBe("Off — not in their plan (1 tracker set up)");
    });
});

describe("addresses", () => {
    it("shows a host without the scheme, and what kind it is", () => {
        expect(addressHost("https://northwind.saroh.app")).toBe(
            "northwind.saroh.app",
        );
        expect(
            addressLabel({ kind: "own-domain", url: "https://x.example" }),
        ).toBe("Their own domain");
        expect(
            addressLabel({ kind: "web-address", url: "https://x.saroh.app" }),
        ).toBe("Web address");
    });
});

describe("whatTheySee", () => {
    const view = (over: Partial<BusinessView>): BusinessView =>
        ({
            plan: { status: "ok", data: plan() },
            sites: { status: "ok", data: [site()] },
            presence: {
                status: "ok",
                data: {
                    sites: [
                        {
                            id: "s1",
                            name: "Northwind",
                            published: true,
                            addresses: [],
                        },
                    ],
                    payments: [],
                },
            },
            ...over,
        }) as BusinessView;
    const ok = (
        state: BusinessModulesState = modules([mod({})]),
    ): Panel<BusinessModulesState> => ({ status: "ok", data: state });

    it("gives one line per area, in order", () => {
        expect(whatTheySee(view({}), ok())).toEqual([
            { area: "Plan", text: "Growth" },
            { area: "Modules", text: "On: Website." },
            { area: "Payments", text: "Not connected" },
            { area: "Website", text: "Published: Northwind" },
            { area: "Trackers", text: "Off — none set up" },
        ]);
    });

    it("says plan limits aren't enforced once, under Modules, not per module", () => {
        const lines = whatTheySee(
            view({}),
            ok(
                modules(
                    [
                        mod({}),
                        mod({
                            moduleKey: "APPOINTMENTS",
                            label: "Bookings",
                        }),
                    ],
                    {
                        planLimitsEnforced: false,
                        note: "Plan limits not enforced yet",
                    },
                ),
            ),
        );
        expect(lines.slice(1, 3)).toEqual([
            { area: "Modules", text: "On: Website, Bookings." },
            { area: "Plan limits", text: "Plan limits not enforced yet" },
        ]);
        expect(
            lines.filter((l) => l.text.includes("not enforced")),
        ).toHaveLength(1);
    });

    it("says an area couldn't be read rather than guessing", () => {
        const lines = whatTheySee(
            view({
                presence: { status: "failed" },
                plan: { status: "failed" },
            }),
            { status: "failed" },
        );
        expect(lines.find((l) => l.area === "Payments")?.text).toBe(
            "Couldn’t be read just now",
        );
        expect(lines.find((l) => l.area === "Plan")?.text).toBe(
            "Couldn’t be read just now",
        );
        expect(lines.find((l) => l.area === "Modules")?.text).toBe(
            "Couldn’t be read just now",
        );
        expect(
            whatTheySee(view({ presence: undefined }), ok()).find(
                (l) => l.area === "Website",
            )?.text,
        ).toBe("Couldn’t be read just now");
    });
});
