import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { emailAttention, providersTabNote, readyChecklist } from "./ready";

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

const settled = {
    logo: { url: "https://x/logo.png", mediaId: "m" },
    tax: {
        registered: true,
        state: "29",
        stateName: "Karnataka",
        invoicePrefix: "RC",
        deliveryRate: "18",
        deliverySac: null,
    },
    profile: {
        legalName: null,
        type: null,
        country: "IN",
        taxId: "29AAGCR4375J1ZU",
        contactEmail: null,
        website: null,
    },
};

describe("emailAttention", () => {
    const comm = [mod("COMMUNICATIONS")];

    it("says nothing while Communications is off", () => {
        expect(
            emailAttention(
                [mod("COMMUNICATIONS", { lifecycle: "DISABLED" })],
                [],
            ),
        ).toBeNull();
    });

    it("flags a disconnected email provider", () => {
        expect(emailAttention(comm, [comms("EMAIL", "DISABLED")])).toBe(
            "disconnected",
        );
    });

    it("flags nothing connected at all", () => {
        expect(emailAttention(comm, [])).toBe("not-connected");
    });

    it("leaves a WhatsApp-only business alone", () => {
        expect(emailAttention(comm, [comms("WHATSAPP")])).toBeNull();
    });

    it("cannot tell without both lists", () => {
        expect(emailAttention(null, [])).toBeNull();
        expect(emailAttention(comm, null)).toBeNull();
    });

    it("names it on the Providers tab", () => {
        expect(providersTabNote("disconnected")).toBe(
            "Needs you: email is disconnected",
        );
        expect(providersTabNote(null)).toBeNull();
    });
});

describe("readyChecklist", () => {
    it("is empty when everything is done", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [mod("COMMUNICATIONS"), mod("PAYMENTS"), mod("CRM")],
            messaging: [comms("EMAIL")],
        });
        expect(r).toEqual({ left: [], done: 5, total: 5 });
    });

    it("lists what is left, each going where it is fixed", () => {
        const r = readyChecklist({
            settings: {
                ...settled,
                logo: null,
                profile: { ...settled.profile, taxId: null },
            },
            modules: [
                mod("COMMUNICATIONS"),
                mod("PAYMENTS", {
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        {
                            code: "PAYMENTS_NO_PROVIDER",
                            actionHref: "/settings/providers",
                        },
                    ],
                }),
                mod("CRM", {
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        { code: "CRM_NO_PIPELINE", actionHref: "/pipeline" },
                    ],
                }),
            ],
            messaging: [comms("EMAIL", "DISABLED")],
        });
        expect(r.done).toBe(0);
        expect(r.total).toBe(5);
        expect(r.left.map((i) => [i.key, i.href, i.broken])).toEqual([
            ["email", "/settings/providers", true],
            ["payments", "/settings/providers", false],
            ["logo", "/settings/organization?section=identity", false],
            ["gstin", "/settings/organization?section=tax", false],
            ["pipeline", "/pipeline", false],
        ]);
    });

    it("counts a step that does not apply as done", () => {
        const r = readyChecklist({
            settings: {
                ...settled,
                tax: { ...settled.tax, registered: false },
                profile: { ...settled.profile, taxId: null },
            },
            modules: [
                mod("CRM", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                    blockers: [{ code: "CRM_NO_PIPELINE" }],
                }),
            ],
            messaging: [],
        });
        expect(r).toEqual({ left: [], done: 5, total: 5 });
    });

    it("leaves out what it could not read, rather than call it done", () => {
        const r = readyChecklist({
            settings: { logo: null, tax: undefined, profile: null },
            modules: null,
            messaging: null,
        });
        expect(r.total).toBe(1);
        expect(r.left.map((i) => i.key)).toEqual(["logo"]);
    });
});
