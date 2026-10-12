import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { ACTIVITY_ACTIONS, activityLine } from "./activity";
import { activityDetail } from "./activity-detail";

/**
 * Settings › Activity's lines and sheet rows for a change to what
 * something costs (owner, 12 Oct 2026), and the rows the rates sheet wrote
 * before, which still read.
 */

const asha = { name: "Asha", email: "asha@example.com", role: "OWNER" };

function event(overrides: Partial<AuditEventRow>): AuditEventRow {
    return {
        id: "evt_1",
        action: "price.changed",
        actorUserId: "u_asha",
        targetType: "product",
        targetId: "p1",
        outcome: "SUCCESS",
        metadata: null,
        createdAt: "2026-10-12T06:30:00.000Z",
        actor: asha,
        target: null,
        ...overrides,
    };
}

const loaf = (changes: unknown[], more: Record<string, unknown> = {}) => ({
    kind: "PRODUCT",
    name: "Rye loaf",
    currency: "INR",
    source: "editor",
    changes,
    ...more,
});

const said = (e: Partial<AuditEventRow>) => {
    const line = activityLine(event(e));
    return line ? `${line.who} ${line.what}` : null;
};
const rows = (e: Partial<AuditEventRow>) =>
    activityDetail(event(e), "Asia/Kolkata").changes;

describe("a change to what something costs, as a line", () => {
    it("is one of the actions the page asks for; an item's first entry is not", () => {
        expect(ACTIVITY_ACTIONS).toContain("price.changed");
        expect(ACTIVITY_ACTIONS).toContain("gst-rate.set");
        expect(ACTIVITY_ACTIONS).not.toContain("price.set");
        expect(said({ action: "price.set", metadata: loaf([]) })).toBeNull();
    });

    it("says who changed the price, of what, from what to what", () => {
        expect(
            said({
                metadata: loaf([
                    { field: "price", before: "780.00", after: "820.00" },
                ]),
            }),
        ).toBe("Asha changed the price of Rye loaf from ₹780 to ₹820");
    });

    it("says an MRP set, changed and removed", () => {
        expect(
            said({
                metadata: loaf([
                    { field: "mrp", before: null, after: "1000.00" },
                ]),
            }),
        ).toBe("Asha set the MRP of Rye loaf to ₹1,000");
        expect(
            said({
                metadata: loaf([
                    { field: "mrp", before: "1000.00", after: "1200.00" },
                ]),
            }),
        ).toBe("Asha changed the MRP of Rye loaf from ₹1,000 to ₹1,200");
        expect(
            said({
                metadata: loaf([
                    { field: "mrp", before: "1000.00", after: null },
                ]),
            }),
        ).toBe("Asha removed the MRP of Rye loaf");
    });

    it("says a GST rate as the rates sheet's line always did", () => {
        expect(
            said({
                metadata: loaf(
                    [{ field: "gstRate", before: null, after: "18" }],
                    { source: "rates" },
                ),
            }),
        ).toBe("Asha set the GST rate of Rye loaf to 18%");
        expect(
            said({
                metadata: loaf([{ field: "gstRate", before: "5", after: "0" }]),
            }),
        ).toBe("Asha changed the GST rate of Rye loaf from 5% to 0%");
        expect(
            said({
                metadata: loaf([
                    { field: "gstRate", before: "5", after: null },
                ]),
            }),
        ).toBe("Asha removed the GST rate of Rye loaf");
    });

    it("says GST on this price in the select's own words", () => {
        expect(
            said({
                metadata: loaf([
                    {
                        field: "gstPriceMode",
                        before: "INCLUDED",
                        after: "ADDED",
                    },
                ]),
            }),
        ).toBe("Asha changed GST on the price of Rye loaf to GST is added");
        expect(
            said({
                metadata: loaf([
                    { field: "gstPriceMode", before: "ADDED", after: null },
                ]),
            }),
        ).toBe(
            "Asha changed GST on the price of Rye loaf to same as the business",
        );
    });

    it("several fields in one save: the first whole, the rest named", () => {
        expect(
            said({
                metadata: loaf([
                    { field: "price", before: "780.00", after: "820.00" },
                    { field: "mrp", before: null, after: "1000.00" },
                ]),
            }),
        ).toBe(
            "Asha changed the price of Rye loaf from ₹780 to ₹820, and its MRP",
        );
        expect(
            said({
                metadata: loaf([
                    { field: "price", before: "780.00", after: "820.00" },
                    { field: "mrp", before: null, after: "1000.00" },
                    { field: "gstRate", before: "5", after: "18" },
                    {
                        field: "gstPriceMode",
                        before: null,
                        after: "ADDED",
                    },
                ]),
            }),
        ).toBe(
            "Asha changed the price of Rye loaf from ₹780 to ₹820, and its MRP, GST rate and GST on its price",
        );
    });

    it("names an option after its product", () => {
        const large = { option: { id: "v1", title: "Large" } };
        expect(
            said({
                metadata: loaf(
                    [{ field: "price", before: "900.00", after: "950.00" }],
                    large,
                ),
            }),
        ).toBe("Asha changed the price of Rye loaf (Large) from ₹900 to ₹950");
        // No price of its own any more: it takes the product's.
        expect(
            said({
                metadata: loaf(
                    [{ field: "price", before: "900.00", after: null }],
                    large,
                ),
            }),
        ).toBe("Asha set Rye loaf (Large) back to the product's price");
    });

    it("a service and a course, each in its own currency", () => {
        expect(
            said({
                targetType: "service",
                targetId: "svc1",
                metadata: {
                    kind: "SERVICE",
                    name: "Personal Training",
                    currency: "INR",
                    changes: [
                        { field: "price", before: "1500.00", after: "1800.00" },
                    ],
                },
            }),
        ).toBe(
            "Asha changed the price of Personal Training from ₹1,500 to ₹1,800",
        );
        expect(
            said({
                targetType: "course",
                targetId: "c1",
                metadata: {
                    kind: "COURSE",
                    name: "Beginners' wheel",
                    currency: "GBP",
                    changes: [
                        { field: "price", before: "80.00", after: "95.00" },
                    ],
                },
            }),
        ).toBe("Asha changed the price of Beginners' wheel from £80 to £95");
    });

    it("Saroh support's change says so, and one with nothing readable still says something true", () => {
        expect(
            said({
                actor: { name: "Saroh support", email: null, operator: true },
                actorUserId: null,
                metadata: loaf(
                    [{ field: "price", before: "780.00", after: "820.00" }],
                    { byOperator: true },
                ),
            }),
        ).toBe("Saroh support changed the price of Rye loaf from ₹780 to ₹820");
        expect(said({ metadata: loaf([]) })).toBe(
            "Asha changed what Rye loaf costs",
        );
        expect(said({ metadata: null })).toBe(
            "Asha changed what a product costs",
        );
    });

    it("links to the item: the product, the service, the course", () => {
        const where = (e: Partial<AuditEventRow>) =>
            activityLine(event(e))?.where;
        const one = [{ field: "price", before: "1.00", after: "2.00" }];
        expect(where({ metadata: loaf(one) })).toEqual({
            label: "Rye loaf",
            href: "/commerce/products/p1",
        });
        expect(
            where({
                targetType: "service",
                targetId: "svc1",
                metadata: { kind: "SERVICE", name: "Haircut", changes: one },
            }),
        ).toEqual({ label: "Haircut", href: "/services/svc1" });
        expect(
            where({
                targetType: "course",
                targetId: "c1",
                metadata: { kind: "COURSE", name: "Beginners", changes: one },
            }),
        ).toEqual({ label: "Beginners", href: "/courses/c1" });
    });

    it("a refused or failed change is not told", () => {
        expect(
            said({
                outcome: "DENIED",
                metadata: loaf([
                    { field: "price", before: "780.00", after: "820.00" },
                ]),
            }),
        ).toBeNull();
    });
});

describe("the sheet a line opens", () => {
    it("names the item, then each field as it was and became", () => {
        expect(
            rows({
                metadata: loaf([
                    { field: "price", before: "780.00", after: "820.00" },
                    { field: "mrp", before: null, after: "1000.00" },
                    { field: "gstRate", before: "5", after: "18" },
                    {
                        field: "gstPriceMode",
                        before: null,
                        after: "ADDED",
                    },
                ]),
            }),
        ).toEqual([
            { label: "Product", before: null, after: "Rye loaf" },
            { label: "Price", before: "₹780", after: "₹820" },
            { label: "MRP", before: "Not set", after: "₹1,000" },
            { label: "GST rate", before: "5%", after: "18%" },
            {
                label: "GST on this price",
                before: "Same as the business",
                after: "GST is added",
            },
        ]);
    });

    it("names an option, and what it takes from its product", () => {
        expect(
            rows({
                metadata: loaf(
                    [{ field: "price", before: "900.00", after: null }],
                    { option: { id: "v1", title: "Large" } },
                ),
            }),
        ).toEqual([
            { label: "Product", before: null, after: "Rye loaf" },
            { label: "Option", before: null, after: "Large" },
            {
                label: "Price",
                before: "₹900",
                after: "Same as the product",
            },
        ]);
    });

    it("a service and a course are called what they are", () => {
        expect(
            rows({
                metadata: {
                    kind: "SERVICE",
                    name: "Haircut",
                    currency: "INR",
                    changes: [{ field: "gstRate", before: "18", after: null }],
                },
            }),
        ).toEqual([
            { label: "Service", before: null, after: "Haircut" },
            { label: "GST rate", before: "18%", after: "Not set" },
        ]);
        expect(
            rows({
                metadata: { kind: "COURSE", name: "Beginners", changes: [] },
            }),
        ).toEqual([{ label: "Course", before: null, after: "Beginners" }]);
    });
});

describe("a row the rates sheet wrote before price history", () => {
    const old = {
        action: "gst-rate.set",
        targetType: "service",
        targetId: "svc1",
        metadata: {
            kind: "SERVICE",
            name: "Personal Training",
            from: null,
            to: "18",
        },
    };

    it("still reads, as a line and in the sheet, and links to its item", () => {
        expect(said(old)).toBe(
            "Asha set the GST rate of Personal Training to 18%",
        );
        expect(rows(old)).toEqual([
            { label: "Personal Training", before: "Not set", after: "18%" },
        ]);
        expect(activityLine(event(old))?.where).toEqual({
            label: "Personal Training",
            href: "/services/svc1",
        });
    });

    it("says the same as the row written today for the same change", () => {
        const today = {
            targetType: "service",
            targetId: "svc1",
            metadata: {
                kind: "SERVICE",
                name: "Personal Training",
                currency: "INR",
                source: "rates",
                changes: [{ field: "gstRate", before: null, after: "18" }],
            },
        };
        expect(said(today)).toBe(said(old));
        expect(activityLine(event(today))?.where).toEqual(
            activityLine(event(old))?.where,
        );
    });
});
