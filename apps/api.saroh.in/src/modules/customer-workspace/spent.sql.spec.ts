import { ADDED_AS_CUSTOMER, peopleCte } from "./customers-list.sql";
import {
    spentInvoiceRowsSql,
    spentOrderRowsSql,
    spentRowsSql,
} from "./spent.sql";

/**
 * Spent's rule as SQL (C14): net of refunds and credit notes, never below
 * zero. The figures themselves run in `customers-list.db.spec.ts`.
 */
describe("spent.sql", () => {
    it("takes an order's refunds off it, but not an edit's, a failed one or one on a payment that never succeeded", () => {
        const sql = spentOrderRowsSql("org").sql;
        expect(sql).toContain(`o."paymentStatus" = 'PAID'`);
        expect(sql).toContain(`FROM "PaymentRefund" pr`);
        expect(sql).toContain(`pr.status <> 'FAILED'`);
        expect(sql).toContain(`NOT pr."forEdit"`);
        expect(sql).toContain(`pi.status = 'SUCCEEDED'`);
        // A treatment's payment at booking belongs to its order (E9).
        expect(sql).toContain(`bi.source = 'BOOKING'`);
        expect(sql).toContain("GREATEST(o.total - ");
    });

    it("takes an invoice's issued credit notes off it, never a draft or void one", () => {
        const sql = spentInvoiceRowsSql("org").sql;
        expect(sql).toContain(`cn."relatedInvoiceId" = i.id`);
        expect(sql).toContain(`cn.kind = 'CREDIT_NOTE'`);
        expect(sql).toContain(`cn.status NOT IN ('DRAFT', 'VOID')`);
        expect(sql).toContain("GREATEST(i.total - ");
    });

    it("scopes every part, the refunds and credit notes included, to the business", () => {
        const both = spentRowsSql("org", ["c1"]);
        expect(both.sql).toContain("UNION ALL");
        expect(both.values.filter((v) => v === "org")).toHaveLength(5);
        expect(both.values).toContainEqual(["c1"]);
    });

    it("lists someone added on the list by hand before they have paid (DEC-056)", () => {
        const cte = peopleCte({ organizationId: "org", sensitiveToo: true });
        expect(cte.values).toContain(ADDED_AS_CUSTOMER);
        expect(cte.sql).toContain("OR people.added_by_hand");
    });
});
