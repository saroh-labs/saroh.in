import { describe, expect, it } from "vitest";

import { formatRecent } from "@/lib/format/datetime";

import type { AuditEventRow } from "./activity";
import { activityLine, activityLines } from "./activity";
import { FIELD_PHRASES } from "./activity-changes";

const sanjay = { name: "Sanjay", email: "sanjay@ryeandco.in" };
const priya = { name: "Priya", email: "priya@ryeandco.in" };

function event(overrides: Partial<AuditEventRow>): AuditEventRow {
    return {
        id: "evt_1",
        action: "profile.update",
        actorUserId: "u_sanjay",
        targetType: "organization",
        targetId: "org_1",
        outcome: "SUCCESS",
        metadata: null,
        createdAt: "2026-09-25T03:44:00.000Z",
        actor: sanjay,
        target: null,
        ...overrides,
    };
}

const said = (e: Partial<AuditEventRow>, roles?: Record<string, string>) => {
    const line = activityLine(event(e), roles);
    return line ? `${line.who} ${line.what} → ${line.where.label}` : null;
};

describe("activityLine — settings saves", () => {
    it("names the one field that changed, and opens its tab", () => {
        const line = activityLine(event({ metadata: { fields: ["taxId"] } }));
        expect(line).toEqual({
            id: "evt_1",
            at: "2026-09-25T03:44:00.000Z",
            who: "Sanjay",
            what: "updated the GSTIN",
            where: {
                label: "Tax and invoices",
                href: "/settings/organization?section=tax",
            },
        });
    });

    it("says field names only, never a value", () => {
        expect(
            said({ metadata: { fields: ["invoicePrefix"], value: "RC" } }),
        ).toBe("Sanjay updated the invoice prefix → Tax and invoices");
    });

    it("says the address once, however many of its lines changed", () => {
        expect(
            said({
                metadata: {
                    fields: ["addressLine1", "city", "postalCode"],
                },
            }),
        ).toBe("Sanjay updated the registered address → Address");
    });

    it("lists up to three, then counts the rest", () => {
        expect(
            said({ metadata: { fields: ["legalName", "contactEmail"] } }),
        ).toBe(
            "Sanjay updated the legal name and the contact email → Identity",
        );
        expect(
            said({
                metadata: { fields: ["name", "website", "deliveryGstRate"] },
            }),
        ).toBe(
            "Sanjay updated the business name, the website and GST on delivery → Identity",
        );
        expect(
            said({
                metadata: {
                    fields: [
                        "gstRegistered",
                        "taxId",
                        "gstState",
                        "invoiceNumberFormat",
                    ],
                },
            }),
        ).toBe(
            "Sanjay updated the GST registration, the GSTIN and 2 other details → Tax and invoices",
        );
    });

    it("counts a field it does not know rather than guessing at it", () => {
        expect(
            said({ metadata: { fields: ["website", "somethingNew"] } }),
        ).toBe("Sanjay updated the website and 1 other detail → Contact");
        expect(said({ metadata: { fields: ["somethingNew"] } })).toBe(
            "Sanjay updated the business details → Business",
        );
        expect(said({ metadata: null })).toBe(
            "Sanjay updated the business details → Business",
        );
    });

    it("says a logo was changed, not set or removed — it cannot tell", () => {
        expect(said({ metadata: { fields: ["logo"] } })).toBe(
            "Sanjay changed the logo → Identity",
        );
    });

    it("has a phrase for every field a settings save records", () => {
        // The API's PROFILE_FIELDS, the tax and address columns, name and logo.
        for (const field of [
            "name",
            "legalName",
            "type",
            "country",
            "taxId",
            "contactEmail",
            "website",
            "timezone",
            "gstRegistered",
            "gstState",
            "addressLine1",
            "addressLine2",
            "city",
            "postalCode",
            "invoicePrefix",
            "invoiceNumberFormat",
            "deliveryGstRate",
            "deliverySacCode",
            "logo",
        ]) {
            expect(FIELD_PHRASES[field], field).toBeDefined();
        }
    });
});

describe("activityLine — values a save recorded (#509)", () => {
    it("says a short value in the sentence", () => {
        expect(
            said({
                actor: priya,
                metadata: {
                    fields: ["invoicePrefix"],
                    changes: [
                        { field: "invoicePrefix", before: "INV", after: "RC" },
                    ],
                },
            }),
        ).toBe("Priya changed the invoice prefix to RC → Tax and invoices");
    });

    it("says a cleared value, a GST registration and a logo in words", () => {
        const one = (field: string, before: unknown, after: unknown) =>
            said({
                metadata: {
                    fields: [field],
                    changes: [{ field, before, after }],
                },
            });
        expect(one("deliverySacCode", "996813", null)).toBe(
            "Sanjay cleared the delivery SAC → Tax and invoices",
        );
        expect(one("gstRegistered", false, true)).toBe(
            "Sanjay registered the business for GST → Tax and invoices",
        );
        expect(one("logo", null, "removed")).toBe(
            "Sanjay removed the logo → Identity",
        );
    });

    it("leaves a long value to the sheet", () => {
        expect(
            said({
                metadata: {
                    fields: ["addressLine1", "city"],
                    changes: [
                        {
                            field: "registeredAddress",
                            before: null,
                            after: "14 Hill Road, Indiranagar, Bengaluru 560038",
                        },
                    ],
                },
            }),
        ).toBe("Sanjay updated the registered address → Address");
    });

    it("names every field when a save changed several, values or not", () => {
        expect(
            said({
                metadata: {
                    fields: ["invoicePrefix", "contactEmail"],
                    changes: [
                        { field: "invoicePrefix", before: "INV", after: "RC" },
                    ],
                },
            }),
        ).toBe(
            "Sanjay updated the invoice prefix and the contact email → Tax and invoices",
        );
    });

    it("says opening hours, modules and plans", () => {
        expect(
            said({
                action: "storefront.hours.update",
                targetType: "storefront",
                metadata: { fields: ["openingHours"], changes: [] },
            }),
        ).toBe("Sanjay changed the opening hours → Hours");
        expect(
            said({
                action: "organization.module.enabled",
                targetType: "module",
                targetId: "PAYMENTS",
                metadata: { module: "Payments", enabled: true },
            }),
        ).toBe("Sanjay switched on Payments → Modules");
        // A row from before the name was recorded says the key in words.
        expect(
            said({
                action: "organization.module.disabled",
                targetId: "COMMERCE",
                metadata: null,
            }),
        ).toBe("Sanjay switched off Commerce → Modules");
        expect(
            said({
                action: "organization.plan.changed",
                metadata: { from: "Free", to: "Pro" },
            }),
        ).toBe("Sanjay moved the plan from Free to Pro → Plan and billing");
    });

    it("says a product marked sold out by hand, or available again (#515)", () => {
        expect(
            said({
                action: "product.sold-out.mark",
                targetType: "product",
                targetId: "p1",
                metadata: {
                    product: "Rye loaf",
                    storefront: "Hill Road",
                    storefrontId: "s1",
                },
            }),
        ).toBe("Sanjay marked Rye loaf sold out at Hill Road → Rye loaf");
        expect(
            said({
                action: "product.sold-out.clear",
                targetType: "product",
                targetId: "p1",
                metadata: { product: "Rye loaf", storefront: "Hill Road" },
            }),
        ).toBe(
            "Sanjay marked Rye loaf available again at Hill Road → Rye loaf",
        );
        // It opens the product at the storefront it was marked at.
        expect(
            activityLine(
                event({
                    action: "product.sold-out.mark",
                    targetId: "p1",
                    metadata: { product: "Rye loaf", storefrontId: "s1" },
                }),
            )?.where.href,
        ).toBe("/commerce/products/p1?storefront=s1");
    });

    it("says Track stock turned on or off, for a product or the business (#515)", () => {
        const film = "Stretch Film Hand Dispenser";
        expect(
            said({
                action: "product.stock-tracking.off",
                targetType: "product",
                targetId: "p1",
                metadata: { product: film, unitsZeroed: 38, storefronts: 2 },
            }),
        ).toBe(
            `Sanjay turned Track stock off for ${film} — 38 set to 0 → ${film}`,
        );
        // Nothing on the shelves: nothing to say about units.
        expect(
            said({
                action: "product.stock-tracking.off",
                targetId: "p1",
                metadata: { product: film, unitsZeroed: 0, storefronts: 0 },
            }),
        ).toBe(`Sanjay turned Track stock off for ${film} → ${film}`);
        expect(
            said({
                action: "product.stock-tracking.on",
                targetId: "p1",
                metadata: { product: film, soldOutCleared: 0 },
            }),
        ).toBe(`Sanjay turned Track stock on for ${film} → ${film}`);
        // Clearing the hand-marked Sold out is part of the one line.
        expect(
            said({
                action: "product.stock-tracking.on",
                targetId: "p1",
                metadata: { product: "Rye loaf", soldOutCleared: 2 },
            }),
        ).toBe(
            "Sanjay turned Track stock on for Rye loaf — cleared Sold out at 2 storefronts → Rye loaf",
        );
        // A first count started it.
        expect(
            said({
                action: "product.stock-tracking.on",
                targetId: "p1",
                metadata: {
                    product: "Rye loaf",
                    startedWithCount: true,
                    soldOutCleared: 1,
                },
            }),
        ).toBe(
            "Sanjay turned Track stock on for Rye loaf with its first count — cleared Sold out at 1 storefront → Rye loaf",
        );
        // It opens the product.
        expect(
            activityLine(
                event({
                    action: "product.stock-tracking.off",
                    targetId: "p1",
                    metadata: { product: film },
                }),
            )?.where,
        ).toEqual({ label: film, href: "/commerce/products/p1" });
        expect(
            said({
                action: "business.stock-tracking.off",
                targetType: "organization",
                metadata: { products: 12, unitsZeroed: 140, storefronts: 2 },
            }),
        ).toBe("Sanjay turned Track stock off for the business → Products");
        expect(
            said({
                action: "business.stock-tracking.on",
                metadata: { products: 12, soldOutCleared: 0 },
            }),
        ).toBe("Sanjay turned Track stock on for the business → Products");
    });

    it("says Saroh support for an operator's stock change, as the API names it", () => {
        const support = {
            name: "Saroh support",
            email: null,
            role: null,
            operator: true as const,
        };
        expect(
            said({
                action: "product.stock-tracking.off",
                actorUserId: null,
                actor: support,
                metadata: { product: "Rye loaf", byOperator: true },
            }),
        ).toBe("Saroh support turned Track stock off for Rye loaf → Rye loaf");
        expect(
            said({
                action: "product.sold-out.mark",
                actorUserId: null,
                actor: support,
                metadata: {
                    product: "Rye loaf",
                    storefront: "Bandra",
                    byOperator: true,
                },
            }),
        ).toBe("Saroh support marked Rye loaf sold out at Bandra → Rye loaf");
    });
});

describe("activityLine — the team", () => {
    it("names who was invited, and as what", () => {
        expect(
            said({
                action: "membership.invite",
                actor: priya,
                targetType: "invitation",
                target: { name: null, email: "meera@ryeandco.in" },
                metadata: { role: "MEMBER", siteCount: 0 },
            }),
        ).toBe("Priya invited meera@ryeandco.in as Member → Team");
    });

    it("names a role the business invented, and leaves out one it cannot", () => {
        const invite = {
            action: "membership.invite",
            actor: priya,
            target: { name: null, email: "meera@ryeandco.in" },
            metadata: { role: "role_floor" },
        };
        expect(said(invite, { role_floor: "Floor staff" })).toBe(
            "Priya invited meera@ryeandco.in as Floor staff → Team",
        );
        expect(said(invite)).toBe("Priya invited meera@ryeandco.in → Team");
    });

    it("says a role change from and to", () => {
        expect(
            said({
                action: "membership.role.update",
                actor: priya,
                targetType: "membership",
                target: { name: "Aditya", email: "aditya@ryeandco.in" },
                metadata: { from: "ADMIN", to: "MEMBER", siteCount: 0 },
            }),
        ).toBe("Priya moved Aditya from Admin to Member → Team");
    });

    it("says someone joined, and someone was removed", () => {
        expect(
            said({
                action: "membership.accept",
                actor: { name: "Meera", email: "meera@ryeandco.in" },
                metadata: { role: "MEMBER" },
            }),
        ).toBe("Meera joined the team as Member → Team");
        expect(
            said({
                action: "membership.remove",
                actor: priya,
                target: { name: null, email: "aditya@ryeandco.in" },
                metadata: { role: "MEMBER" },
            }),
        ).toBe("Priya removed aditya@ryeandco.in from the team → Team");
    });

    it("opens the Team page on its people", () => {
        expect(
            activityLine(event({ action: "membership.remove" }))?.where.href,
        ).toBe("/settings/people?view=people");
    });

    it("says so when the person is no longer there", () => {
        expect(
            said({
                action: "membership.remove",
                actor: null,
                target: null,
            }),
        ).toBe("Someone no longer here removed someone from the team → Team");
    });
});

describe("activityLines", () => {
    it("tells only what succeeded, and only what this page is about", () => {
        const lines = activityLines([
            event({ id: "a", metadata: { fields: ["website"] } }),
            event({ id: "b", outcome: "DENIED" }),
            event({ id: "c", action: "product-review.hide" }),
            event({ id: "d", action: "organization.onboard" }),
        ]);
        expect(lines.map((l) => [l.id, l.what])).toEqual([
            ["a", "updated the website"],
            ["d", "set up the business"],
        ]);
    });
});

describe("formatRecent", () => {
    const now = new Date("2026-09-25T06:00:00.000Z"); // 11:30 in Kolkata
    const zone = "Asia/Kolkata";

    it("gives today's hour, then yesterday, then the date", () => {
        expect(formatRecent("2026-09-25T03:44:00.000Z", zone, now)).toBe(
            "Today 09:14",
        );
        expect(formatRecent("2026-09-24T10:00:00.000Z", zone, now)).toBe(
            "Yesterday",
        );
        expect(formatRecent("2026-09-22T10:00:00.000Z", zone, now)).toBe(
            "22 Sep",
        );
        expect(formatRecent("2025-12-01T10:00:00.000Z", zone, now)).toBe(
            "1 Dec 2025",
        );
    });

    it("reads the day in the zone given, not the server's", () => {
        // 20:00 UTC on the 24th is already the 25th in Kolkata.
        expect(formatRecent("2026-09-24T20:00:00.000Z", zone, now)).toBe(
            "Today 01:30",
        );
    });
});
