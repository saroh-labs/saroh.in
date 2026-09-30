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

describe("settingsNudges (DEC-056)", () => {
    it("asks for email, the type, the logo and a pipeline, in the design's order", () => {
        const nudges = settingsNudges({
            settings: { profile: { ...profile, type: null }, logo: null },
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
            modules: [mod("COMMUNICATIONS"), mod("CRM")],
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
            settings: { profile, logo: null },
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
                    settings: { profile, logo: null },
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
                    settings: { profile, logo: null },
                    modules: [mod("COMMUNICATIONS")],
                    messaging: [comms("WHATSAPP")],
                }),
            ),
        ).toEqual(["businessType", "logo"]);
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

    it("is Home's steps, then the nudges, counted together", () => {
        const home = readyChecklist({ settings, modules });
        const list = settingsChecklist({ settings, modules, messaging: null });

        expect(keys(list.steps)).toEqual([
            ...keys(home.steps),
            "businessType",
            "logo",
        ]);
        expect(keys(list.left)).toEqual(["catalogue", "businessType", "logo"]);
        expect(list.done).toBe(home.done);
        expect(list.total).toBe(home.total + 2);
    });
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
