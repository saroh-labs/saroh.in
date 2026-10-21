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

    it("counts an invoice's ledger by the money-in rule, net of its issued credit notes, never its status", () => {
        const sql = spentInvoiceRowsSql("org").sql;
        // The money-in rule (DEC-173): payments that count, on paper that
        // isn't an order's, a credit note or a hold.
        expect(sql).toContain(`FROM "InvoicePayment" p`);
        expect(sql).toContain(`p."removedAt" IS NULL`);
        expect(sql).toContain(`p."bankStatus" <> 'BOUNCED'`);
        expect(sql).toContain(`i."orderId" IS NULL`);
        expect(sql).toContain(`i.kind <> 'CREDIT_NOTE'`);
        expect(sql).toContain(`cn."relatedInvoiceId" = i.id`);
        expect(sql).toContain(`cn.kind = 'CREDIT_NOTE'`);
        expect(sql).toContain(`cn.status NOT IN ('DRAFT', 'VOID')`);
        // PAID is "the ledger covers the total": a part payment counts, and
        // a bounced cheque on a paid bill takes out only the cheque.
        expect(sql).not.toMatch(/i\.status\s*=/);
    });

    it("never reads an invoice's status for who paid or what they spent", () => {
        for (const sql of [
            spentRowsSql("org").sql,
            peopleCte({ organizationId: "org", sensitiveToo: true }).sql,
        ]) {
            expect(sql).not.toMatch(/i\.status\s*=\s*'PAID'/);
        }
    });

    it("scopes every part, the refunds and credit notes included, to the business", () => {
        const both = spentRowsSql("org", ["c1"]);
        expect(both.sql).toContain("UNION ALL");
        expect(both.values.filter((v) => v === "org")).toHaveLength(6);
        expect(both.values).toContainEqual(["c1"]);
    });

    it("lists someone added on the list by hand before they have paid (DEC-056)", () => {
        const cte = peopleCte({ organizationId: "org", sensitiveToo: true });
        expect(cte.values).toContain(ADDED_AS_CUSTOMER);
        expect(cte.sql).toContain("OR people.added_by_hand");
    });
});
