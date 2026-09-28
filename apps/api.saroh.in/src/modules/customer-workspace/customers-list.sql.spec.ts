import {
    chipSql,
    likeEscape,
    matchesSql,
    notRetired,
    orderBySql,
    peopleCte,
    searchSql,
    spentRowsSql,
    unlinkedCte,
} from "./customers-list.sql";

/** The Customers list's SQL (C3), as text and bound values. Pure. */

describe("customers list SQL", () => {
    it("searches the name, the email shown and, with three digits or more, the phone's digits", () => {
        const q = searchSql("  98450 ");
        expect(q.sql).toContain(
            'concat_ws(\' \', m."firstName", m."lastName")',
        );
        expect(q.sql).toContain("m.shown_email");
        expect(q.sql).toContain("regexp_replace(COALESCE(m.phone, '')");
        expect(q.values).toEqual(["%98450%", "%98450%", "%98450%"]);

        const name = searchSql("Asha");
        expect(name.sql).not.toContain("regexp_replace");
        expect(name.values).toEqual(["%asha%", "%asha%"]);

        // Two digits are not a phone.
        expect(searchSql("Flat 12").sql).not.toContain("regexp_replace");
    });

    it("treats a typed % or _ as itself, never a wildcard", () => {
        expect(likeEscape("50%_off\\")).toBe("50\\%\\_off\\\\");
        expect(searchSql("100%").values[0]).toBe("%100\\%%");
    });

    it("matches everyone on an empty search", () => {
        expect(searchSql(undefined).sql).toBe("TRUE");
        expect(searchSql("   ").sql).toBe("TRUE");
        expect(matchesSql(undefined).sql).toBe("TRUE");
    });

    it("narrows to a storefront only when one is asked for", () => {
        expect(matchesSql(undefined, "store_1").sql).toContain("m.at_store");
        expect(
            peopleCte({
                organizationId: "org",
                storeId: "store_1",
                sensitiveToo: true,
            }).values,
        ).toContain("store_1");
        expect(
            peopleCte({ organizationId: "org", sensitiveToo: true }).sql,
        ).toContain("FALSE AS at_store");
    });

    it("counts invoices towards Returning only for a viewer who reads invoices", () => {
        expect(chipSql("returning", true).sql).toContain("m.paid_invoices");
        expect(chipSql("returning", false).sql).not.toContain("paid_invoices");
        expect(chipSql("all", false).sql).toBe("TRUE");
        expect(chipSql("attention", false).sql).toBe("m.attention");
    });

    it("leaves sensitive Needs attention out of the chip for a viewer who may not see it", () => {
        expect(
            peopleCte({ organizationId: "org", sensitiveToo: false }).sql,
        ).toContain("NOT a.sensitive");
        expect(
            peopleCte({ organizationId: "org", sensitiveToo: true }).sql,
        ).not.toContain("NOT a.sensitive");
    });

    it("ends every sort on the id, and puts people with no orders or spend last", () => {
        for (const sort of ["last", "spent", "name"] as const) {
            expect(orderBySql(sort).sql).toMatch(/m\.id ASC$/);
        }
        expect(orderBySql("last").sql).toContain(
            "m.last_order_at DESC NULLS LAST",
        );
        expect(orderBySql("spent").sql).toContain("m.spent DESC NULLS LAST");
    });

    it("never lists a merge's tombstone, by mergedIntoId, or a removed contact, by its placeholder", () => {
        const sql = notRetired("c");
        expect(sql.sql).toContain(`c."mergedIntoId" IS NULL`);
        expect(sql.sql).toContain(`c."email"`);
        expect(sql.values).toEqual(["removed+%@removed.invalid"]);
    });

    it("counts a paid order and paid invoices that are not an order's own, never a credit note", () => {
        const sql = spentRowsSql("org").sql;
        expect(sql).toContain(`o."paymentStatus" = 'PAID'`);
        expect(sql).toContain(`i."orderId" IS NULL`);
        expect(sql).toContain(`i.kind <> 'CREDIT_NOTE'`);
        const some = spentRowsSql("org", ["c1", "c2"]);
        expect(some.values).toContainEqual(["c1", "c2"]);
    });

    it("scopes the unlinked store customers to the business and, when asked, a storefront", () => {
        const placeholders = ["%@account.invalid", "%@removed.invalid"];
        expect(unlinkedCte("org").values).toEqual(["org", placeholders, "org"]);
        expect(unlinkedCte("org", "store_1").values).toEqual([
            "org",
            "store_1",
            placeholders,
            "org",
        ]);
        // Driven from the business's orders, never every store customer
        // (review C-2).
        expect(unlinkedCte("org").sql).toMatch(
            /FROM "Order" o[\s\S]*GROUP BY o\."customerId"[\s\S]*FROM paid\s+JOIN "Customer" cu/,
        );
    });
});
