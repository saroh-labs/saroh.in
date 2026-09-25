import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { activityDetail, formatFullMoment } from "./activity-detail";

const priya = {
    name: "Priya",
    email: "priya@ryeandco.in",
    role: "OWNER",
};

function event(overrides: Partial<AuditEventRow>): AuditEventRow {
    return {
        id: "evt_1",
        action: "profile.update",
        actorUserId: "u_priya",
        targetType: "organization",
        targetId: "org_1",
        outcome: "SUCCESS",
        metadata: null,
        // 13:47 in Kolkata.
        createdAt: "2026-09-25T08:17:00.000Z",
        actor: priya,
        target: null,
        ...overrides,
    };
}

const KOLKATA = "Asia/Kolkata";

describe("formatFullMoment", () => {
    it("says the day, the date and the minute in the business's zone", () => {
        expect(formatFullMoment("2026-09-25T08:17:00.000Z", KOLKATA)).toBe(
            "Friday 25 September 2026, 13:47 IST",
        );
    });

    it("names the zone as a person knows it, else by its offset", () => {
        expect(
            formatFullMoment("2026-09-25T08:17:00.000Z", "Europe/London"),
        ).toBe("Friday 25 September 2026, 09:17 BST");
        expect(
            formatFullMoment("2026-09-25T08:17:00.000Z", "Australia/Sydney"),
        ).toBe("Friday 25 September 2026, 18:17 GMT+10");
    });
});

describe("activityDetail — who", () => {
    it("gives the name, the email and the role now", () => {
        expect(activityDetail(event({}), KOLKATA).who).toEqual({
            name: "Priya",
            email: "priya@ryeandco.in",
            role: "Owner",
            gone: false,
        });
    });

    it("says someone has left the team, and names a role the business invented", () => {
        expect(
            activityDetail(event({ actor: { ...priya, role: null } }), KOLKATA)
                .who,
        ).toMatchObject({ role: null, gone: true });
        expect(
            activityDetail(
                event({ actor: { ...priya, role: "role_floor" } }),
                KOLKATA,
                { role_floor: "Floor staff" },
            ).who.role,
        ).toBe("Floor staff");
    });

    it("does not repeat an email that is the name, nor call an older row's actor gone", () => {
        expect(
            activityDetail(
                event({ actor: { name: null, email: "a@rye.in" } }),
                KOLKATA,
            ).who,
        ).toEqual({ name: "a@rye.in", email: null, role: null, gone: false });
    });
});

describe("activityDetail — what changed", () => {
    it("lists every field, before and after where kept, changed where not", () => {
        const detail = activityDetail(
            event({
                metadata: {
                    fields: [
                        "invoicePrefix",
                        "gstRegistered",
                        "contactEmail",
                        "website",
                    ],
                    changes: [
                        { field: "invoicePrefix", before: "INV", after: "RC" },
                        { field: "gstRegistered", before: true, after: false },
                    ],
                },
            }),
            KOLKATA,
        );
        expect(detail.changes).toEqual([
            { label: "Invoice prefix", before: "INV", after: "RC" },
            {
                label: "GST registration",
                before: "Registered",
                after: "Not registered",
            },
            { label: "Contact email", before: null, after: null },
            { label: "Website", before: null, after: null },
        ]);
        expect(detail.withoutValues).toBe(false);
    });

    it("says an earlier save kept no values, listing every field once", () => {
        const detail = activityDetail(
            event({
                metadata: {
                    fields: [
                        "country",
                        "taxId",
                        "addressLine1",
                        "city",
                        "postalCode",
                    ],
                },
            }),
            KOLKATA,
        );
        expect(detail.changes.map((c) => c.label)).toEqual([
            "Country",
            "GSTIN or tax ID",
            "Registered address",
        ]);
        expect(detail.withoutValues).toBe(true);
    });

    it("shows a value first set as not set before it, and the logo by what happened", () => {
        expect(
            activityDetail(
                event({
                    metadata: {
                        fields: ["legalName", "logo"],
                        changes: [
                            {
                                field: "legalName",
                                before: null,
                                after: "Rye LLP",
                            },
                            { field: "logo", before: null, after: "added" },
                        ],
                    },
                }),
                KOLKATA,
            ).changes,
        ).toEqual([
            { label: "Legal name", before: "Not set", after: "Rye LLP" },
            { label: "Logo", before: null, after: "Added" },
        ]);
    });

    it("tells a storefront's hours, a module, a plan and a role", () => {
        const rows = (e: Partial<AuditEventRow>) =>
            activityDetail(event(e), KOLKATA).changes;
        expect(
            rows({
                action: "storefront.hours.update",
                metadata: {
                    fields: ["openingHours"],
                    storefront: "High Street",
                    changes: [
                        {
                            field: "openingHours",
                            before: "Mon–Sun 09:00–18:00",
                            after: "Mon–Sat 09:00–18:00, Sun closed",
                        },
                    ],
                },
            }),
        ).toEqual([
            {
                label: "Opening hours, High Street",
                before: "Mon–Sun 09:00–18:00",
                after: "Mon–Sat 09:00–18:00, Sun closed",
            },
        ]);
        expect(
            rows({
                action: "product.sold-out.mark",
                targetId: "p1",
                metadata: { product: "Rye loaf", storefront: "Hill Road" },
            }),
        ).toEqual([
            { label: "Product", before: null, after: "Rye loaf" },
            {
                label: "On the shop, Hill Road",
                before: "Available",
                after: "Sold out",
            },
        ]);
        expect(
            rows({
                action: "product.sold-out.clear",
                metadata: { product: "Rye loaf", storefront: "Hill Road" },
            }).at(-1),
        ).toEqual({
            label: "On the shop, Hill Road",
            before: "Sold out",
            after: "Available",
        });
        expect(
            rows({
                action: "product.stock-tracking.off",
                targetId: "p1",
                metadata: {
                    product: "Stretch Film Hand Dispenser",
                    unitsZeroed: 38,
                    storefronts: 2,
                },
            }),
        ).toEqual([
            {
                label: "Product",
                before: null,
                after: "Stretch Film Hand Dispenser",
            },
            { label: "Track stock", before: "On", after: "Off" },
            {
                label: "Stock",
                before: null,
                after: "38 units set to 0 at 2 storefronts",
            },
        ]);
        expect(
            rows({
                action: "product.stock-tracking.on",
                targetId: "p1",
                metadata: {
                    product: "Rye loaf",
                    startedWithCount: true,
                    soldOutCleared: 1,
                },
            }),
        ).toEqual([
            { label: "Product", before: null, after: "Rye loaf" },
            { label: "Track stock", before: "Off", after: "On" },
            { label: "Started by", before: null, after: "Its first count" },
            {
                label: "Sold out by hand",
                before: null,
                after: "Cleared at 1 storefront",
            },
        ]);
        expect(
            rows({
                action: "business.stock-tracking.off",
                metadata: { products: 12, unitsZeroed: 1400, storefronts: 1 },
            }),
        ).toEqual([
            { label: "Track stock", before: "On", after: "Off" },
            {
                label: "Products",
                before: null,
                after: "12 products stopped counting",
            },
            {
                label: "Stock",
                before: null,
                after: "1,400 units set to 0 at 1 storefront",
            },
        ]);
        expect(
            rows({
                action: "business.stock-tracking.on",
                metadata: { products: 1, soldOutCleared: 3 },
            }),
        ).toEqual([
            { label: "Track stock", before: "Off", after: "On" },
            {
                label: "Products",
                before: null,
                after: "1 product counting again, from 0",
            },
            {
                label: "Sold out by hand",
                before: null,
                after: "Cleared 3 marks",
            },
        ]);
        expect(
            rows({
                action: "organization.module.enabled",
                targetId: "PAYMENTS",
                metadata: { module: "Payments", enabled: true },
            }),
        ).toEqual([{ label: "Payments", before: "Off", after: "On" }]);
        expect(
            rows({
                action: "organization.plan.changed",
                metadata: { from: null, to: "Pro" },
            }),
        ).toEqual([{ label: "Plan", before: "None", after: "Pro" }]);
        expect(
            rows({
                action: "membership.role.update",
                metadata: { from: "ADMIN", to: "MEMBER" },
            }),
        ).toEqual([{ label: "Role", before: "Admin", after: "Member" }]);
        expect(
            rows({
                action: "membership.invite",
                target: { name: null, email: "meera@ryeandco.in", role: null },
                metadata: { role: "MEMBER" },
            }),
        ).toEqual([
            { label: "Invited", before: null, after: "meera@ryeandco.in" },
            { label: "Role", before: null, after: "Member" },
        ]);
    });

    it("has nothing to list for setting up the business", () => {
        expect(
            activityDetail(event({ action: "organization.onboard" }), KOLKATA)
                .changes,
        ).toEqual([]);
    });
});
