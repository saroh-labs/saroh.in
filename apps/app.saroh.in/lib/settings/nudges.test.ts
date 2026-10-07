import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { settingsChecklist, settingsNudges } from "./nudges";
import { readyChecklist } from "./ready";

function mod(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "ENABLED",
        readiness: "ACTIVE",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}

const rolledOff = { blockers: [{ code: "ROLLOUT_DISABLED" }] };

function comms(
    channel: "EMAIL" | "WHATSAPP",
    status = "CONNECTED",
): ConnectedCommsProvider {
    return {
        id: channel,
        channel,
        provider: "RESEND",
        status,
        fromAddress: null,
        updatedAt: "2026-09-01T00:00:00Z",
    };
}

const profile = {
    legalName: null,
    type: "pvt",
    country: "IN",
    taxId: null,
    contactEmail: null,
    website: null,
};

const noPipeline = mod("CRM", {
    readiness: "SETUP_REQUIRED",
    blockers: [{ code: "CRM_NO_PIPELINE", actionHref: "/contacts/setup" }],
});

const keys = (items: { key: string }[]) => items.map((i) => i.key);

/** A business that has written an invoice: it invoices (DEC-070). */
const invoicing = {
    products: 0,
    services: 0,
    sites: 0,
    sitesNotLive: 0,
    invoices: 1,
};

describe("settingsNudges (DEC-056)", () => {
    it("asks for email, the type, the logo and a pipeline, in the design's order", () => {
        const nudges = settingsNudges({
            settings: {
                profile: { ...profile, type: null },
                logo: null,
                setup: invoicing,
            },
            modules: [mod("COMMUNICATIONS"), noPipeline],
            messaging: [],
        });
        expect(keys(nudges.filter((n) => n.left))).toEqual([
            "email",
            "businessType",
            "logo",
            "pipeline",
        ]);
        expect(nudges.find((n) => n.key === "pipeline")?.href).toBe(
            "/contacts/setup",
        );
    });

    it("marks a disconnected email provider as broken", () => {
        const [email] = settingsNudges({
            settings: { profile, logo: null },
            modules: [mod("COMMUNICATIONS")],
            messaging: [comms("EMAIL", "DISABLED")],
        });
        expect(email).toMatchObject({
            key: "email",
            label: "Reconnect email",
            broken: true,
            left: true,
        });
    });

    it("counts the done ones as done", () => {
        const nudges = settingsNudges({
            settings: {
                profile,
                logo: { url: "https://cdn/logo.png", mediaId: "m1" },
            },
            modules: [mod("COMMUNICATIONS"), mod("CRM"), mod("PAYMENTS")],
            messaging: [comms("EMAIL")],
        });
        expect(nudges.every((n) => !n.left)).toBe(true);
        expect(keys(nudges)).toEqual([
            "email",
            "businessType",
            "logo",
            "pipeline",
        ]);
    });

    it("asks for a business type while none is set (onboarding's Registered)", () => {
        const [type] = settingsNudges({
            settings: { profile: { ...profile, type: null }, logo: undefined },
            modules: null,
            messaging: null,
        });
        expect(type).toMatchObject({
            key: "businessType",
            left: true,
            // Straight to the Type field on Business › Identity.
            href: "/settings/organization?section=identity#business-type",
        });
        // A type this app doesn't know reads as Not set; `company` is Pvt Ltd.
        expect(
            settingsNudges({
                settings: { profile: { ...profile, type: "company" } },
                modules: null,
                messaging: null,
            })[0]?.left,
        ).toBe(false);
    });

    it("is done once any of F10's six types is saved, and only then", () => {
        const left = (type: string | null) =>
            settingsNudges({
                settings: { profile: { ...profile, type } },
                modules: null,
                messaging: null,
            }).find((n) => n.key === "businessType")?.left;
        for (const type of [
            "individual",
            "partnership",
            "llp",
            "pvt",
            "public",
            "trust",
        ]) {
            expect(left(type), type).toBe(false);
        }
        // Onboarding's "Registered" saves nothing; an unknown word is Not set.
        expect(left(null)).toBe(true);
        expect(left("")).toBe(true);
        expect(left("registered")).toBe(true);
    });

    it("never names a module Saroh has not rolled out (DEC-057)", () => {
        const nudges = settingsNudges({
            settings: { profile, logo: null, setup: invoicing },
            modules: [
                mod("COMMUNICATIONS", rolledOff),
                mod("CRM", { ...noPipeline, ...rolledOff }),
            ],
            messaging: [],
        });
        expect(keys(nudges)).toEqual(["businessType", "logo"]);
    });

    it("leaves out what could not be read, and what does not apply", () => {
        // Modules unread: no email or pipeline. Logo absent: an older API.
        expect(
            keys(
                settingsNudges({
                    settings: { profile },
                    modules: null,
                    messaging: [],
                }),
            ),
        ).toEqual(["businessType"]);
        // Communications and Contacts off.
        expect(
            keys(
                settingsNudges({
                    settings: { profile, logo: null, setup: invoicing },
                    modules: [
                        mod("COMMUNICATIONS", { lifecycle: "DISABLED" }),
                        mod("CRM", { lifecycle: "DISABLED" }),
                    ],
                    messaging: [],
                }),
            ),
        ).toEqual(["businessType", "logo"]);
        // Sending on WhatsApp alone: not asked about email at all.
        expect(
            keys(
                settingsNudges({
                    settings: { profile, logo: null, setup: invoicing },
                    modules: [mod("COMMUNICATIONS")],
                    messaging: [comms("WHATSAPP")],
                }),
            ),
        ).toEqual(["businessType", "logo"]);
    });
});

describe("business type and logo only when money is involved (DEC-070)", () => {
    const website = mod("WEBSITE");
    const none = { ...invoicing, invoices: 0 };
    const ask = (
        modules: ModuleView[] | null,
        setup: typeof invoicing | undefined,
    ) =>
        keys(
            settingsNudges({
                settings: {
                    profile: { ...profile, type: null },
                    logo: null,
                    setup,
                },
                modules,
                messaging: null,
            }),
        );

    it("asks neither of a site with nothing that sells and no invoice", () => {
        expect(ask([website], none)).toEqual([]);
    });

    it("asks both once the business has an invoice, a draft included", () => {
        expect(ask([website], invoicing)).toEqual(["businessType", "logo"]);
    });

    it("asks both while anything that takes money is on", () => {
        for (const key of [
            "COMMERCE",
            "APPOINTMENTS",
            "COURSES",
            "CLASS_PACKS",
            "PAYMENTS",
        ]) {
            expect(ask([website, mod(key)], none), key).toEqual([
                "businessType",
                "logo",
            ]);
        }
    });

    it("doesn't count a selling module that is off, or not rolled out", () => {
        expect(
            ask(
                [
                    website,
                    mod("COMMERCE", { lifecycle: "DISABLED" }),
                    mod("APPOINTMENTS", rolledOff),
                ],
                none,
            ),
        ).toEqual([]);
    });

    it("reads the modules alone from an API older than the invoice count", () => {
        const { invoices: _invoices, ...older } = none;
        expect(ask([website], older as typeof invoicing)).toEqual([]);
        expect(ask([website, mod("COMMERCE")], undefined)).toEqual([
            "businessType",
            "logo",
        ]);
    });

    it("asks as before when the modules could not be read", () => {
        expect(ask(null, none)).toEqual(["businessType", "logo"]);
    });
});

describe("settingsChecklist", () => {
    const settings = {
        tax: {
            registered: false,
            state: null,
            stateName: null,
            invoicePrefix: null,
            deliveryRate: "18",
            deliverySac: null,
        },
        profile: { ...profile, type: null },
        registeredAddress: {
            line1: "12 Hill Road",
            line2: null,
            city: "Bengaluru",
            postalCode: "560001",
            state: "29",
            stateName: "Karnataka",
        },
        logo: null,
    };
    const modules = [
        mod("COMMERCE", {
            readiness: "SETUP_REQUIRED",
            blockers: [{ code: "COMMERCE_NO_CATALOG" }],
        }),
    ];

    it("counts exactly Home's steps, and lists the nudges apart (UX-019)", () => {
        const home = readyChecklist({ settings, modules });
        const list = settingsChecklist({ settings, modules, messaging: null });

        expect(keys(list.steps)).toEqual(keys(home.steps));
        expect(keys(list.left)).toEqual(keys(home.left));
        expect(list.done).toBe(home.done);
        expect(list.total).toBe(home.total);
        // "Make it yours": never in the count.
        expect(keys(list.extras ?? [])).toEqual(["businessType", "logo"]);
    });

    it("never counts a pipeline as payment readiness (UX-019)", () => {
        const crm = [
            ...modules,
            mod("CRM", {
                readiness: "SETUP_REQUIRED",
                blockers: [{ code: "CRM_NO_PIPELINE" }],
            }),
        ];
        const home = readyChecklist({ settings, modules: crm });
        const list = settingsChecklist({
            settings,
            modules: crm,
            messaging: null,
        });
        expect(list.total).toBe(home.total);
        expect(keys(list.steps)).not.toContain("pipeline");
        expect(keys(list.extras ?? [])).toContain("pipeline");
    });

    it.each([
        ["Free, own email locked", false, false],
        ["Grow, room to connect", true, true],
    ])(
        "asks to connect email only where the email setup allows it (%s, UX-006)",
        (_plan, canConnect, asked) => {
            const comms = [...modules, mod("COMMUNICATIONS")];
            const list = settingsChecklist({
                settings,
                modules: comms,
                messaging: [],
                emailSetup: { connected: false, canConnect },
            });
            expect(keys(list.extras ?? []).includes("email")).toBe(asked);
        },
    );
});

describe("readyChecklist and rollout (DEC-057)", () => {
    it("names no step for a module Saroh has not rolled out", () => {
        const list = readyChecklist({
            settings: {
                tax: undefined,
                profile: null,
                registeredAddress: undefined,
            },
            modules: [
                mod("PAYMENTS", { lifecycle: "DISABLED", ...rolledOff }),
                mod("COMMERCE", {
                    blockers: [
                        { code: "ROLLOUT_DISABLED" },
                        { code: "COMMERCE_NO_CATALOG" },
                    ],
                }),
                mod("WEBSITE", {
                    blockers: [
                        { code: "ROLLOUT_DISABLED" },
                        { code: "WEBSITE_NO_SITE" },
                    ],
                }),
            ],
        });
        expect(list.steps).toEqual([]);
    });
});

describe("the email nudge follows the plan (DEC-091, #850)", () => {
    const base = {
        settings: { profile, logo: { url: "https://cdn/l.png", mediaId: "m" } },
        modules: [mod("COMMUNICATIONS")],
        messaging: [] as ConnectedCommsProvider[],
    };
    const free = { connected: false, canConnect: false };

    it("where the plan has room (or it can't be read), asks to connect, as before", () => {
        for (const emailSetup of [
            { connected: false, canConnect: true },
            null,
        ]) {
            const list = settingsChecklist({
                ...base,
                emailSetup,
                mayPlans: true,
            });
            // Among "Make it yours", never counted (UX-019).
            expect(
                (list.extras ?? []).find((i) => i.key === "email"),
            ).toMatchObject({
                cta: "Connect email",
                href: "/settings/providers",
                done: false,
            });
            expect(list.outside).toEqual([]);
        }
    });

    it("where it can't, never offers Connect: a paid plan, beside the steps and outside the count", () => {
        const list = settingsChecklist({
            ...base,
            emailSetup: free,
            mayPlans: true,
        });
        expect(keys(list.steps)).not.toContain("email");
        expect(keys(list.extras ?? [])).not.toContain("email");
        expect(list.outside).toEqual([
            {
                key: "email",
                label: "Email your customers",
                why: "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.",
                comesWith: "Comes with a paid plan",
                cta: "See plans",
                href: "/settings/billing#change-plan",
            },
        ]);
    });

    it("only to who may see the plans", () => {
        const list = settingsChecklist({
            ...base,
            emailSetup: free,
            mayPlans: false,
        });
        expect(keys(list.steps)).not.toContain("email");
        expect(keys(list.extras ?? [])).not.toContain("email");
        expect(list.outside).toEqual([]);
    });

    it("a disconnected provider is still Reconnect, whatever the plan", () => {
        const list = settingsChecklist({
            ...base,
            messaging: [comms("EMAIL", "DISABLED")],
            emailSetup: free,
            mayPlans: true,
        });
        expect((list.extras ?? []).find((i) => i.key === "email")?.label).toBe(
            "Reconnect email",
        );
        expect(list.outside).toEqual([]);
    });
});
