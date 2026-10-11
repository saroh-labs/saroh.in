import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PERSONAL_FIELDS } from "../customer-workspace/personal-data";
import { REMOVAL_RULES } from "../customer-workspace/privacy-removal-plan";
import {
    ERASE_STEPS,
    KEEPING_RULE_KINDS,
    KEPT_FIELD_DECISIONS,
    KEPT_RELATION_DECISIONS,
    RETENTION_ERASED,
    RETENTION_KEPT,
} from "./retention-erase-plan";

/**
 * What the retention eraser removes and keeps (DEC-122), held to the
 * privacy removal's two registries: whatever a single removal *keeps* must
 * be decided again for a business that is gone — erased, or kept and why —
 * so a new "kept" field can't silently outlive a deleted business.
 */
describe("the retention erase plan (DEC-122)", () => {
    it("decides every personal field a privacy removal keeps", () => {
        const kept = Object.entries(PERSONAL_FIELDS)
            .filter(([, field]) => field.rule === "kept")
            .map(([key]) => key)
            .sort();
        expect(Object.keys(KEPT_FIELD_DECISIONS).sort()).toEqual(kept);
    });

    it("decides every relation to a contact a privacy removal keeps", () => {
        const kept = Object.entries(REMOVAL_RULES)
            .filter(([, rule]) => KEEPING_RULE_KINDS.includes(rule.kind))
            .map(([key]) => key)
            .sort();
        expect(Object.keys(KEPT_RELATION_DECISIONS).sort()).toEqual(kept);
    });

    it("says why, for every decision", () => {
        for (const decision of [
            ...Object.values(KEPT_FIELD_DECISIONS),
            ...Object.values(KEPT_RELATION_DECISIONS),
        ]) {
            expect(["erased", "kept"]).toContain(decision.at180Days);
            expect(decision.why.length).toBeGreaterThan(10);
        }
    });

    it("never erases what tax law needs (ADR-008)", () => {
        const erased = Object.entries({
            ...KEPT_FIELD_DECISIONS,
            ...KEPT_RELATION_DECISIONS,
        })
            .filter(([, d]) => d.at180Days === "erased")
            .map(([key]) => key);
        expect(erased.filter((key) => key.startsWith("Invoice."))).toEqual([]);
        expect(erased).not.toContain("Order.deliveryState");
        // What it does erase of what a removal keeps: a walk-in's name and
        // phone, and the CRM a removal leaves to the business.
        expect(erased.sort()).toEqual(
            [
                "Activity.body",
                "CustomerAccount.unlinkedFromContactId",
                "Lead.contactId",
                "Order.walkInName",
                "Order.walkInPhone",
                "Submission.contactId",
            ].sort(),
        );
    });

    it("writes what it says for the fields it erases", () => {
        // The code, without its comments (which name what is kept).
        const writes = readFileSync(
            join(__dirname, "retention-erase-writes.ts"),
            "utf8",
        )
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
        // Each erased field is named in the business-wide pass.
        for (const field of ["walkInName: null", "walkInPhone: null"]) {
            expect(writes).toContain(field);
        }
        expect(writes).toContain("tx.activity.updateMany");
        expect(writes).toContain("tx.submission.updateMany");
        expect(writes).toContain("tx.lead.updateMany");
        // And the fields kept for tax are never written.
        for (const kept of [
            "deliveryState",
            "billToName",
            "billToEmail",
            "billToAddress",
            "tx.invoice.",
            "tx.creditNote.",
            "tx.payment.",
            "tx.refund.",
            "tx.auditEvent.",
            "tx.adminAuditEvent.",
            "tx.orderItem.",
        ]) {
            expect(`${kept}: ${writes.includes(kept)}`).toBe(`${kept}: false`);
        }
        // An order is only ever updated, never deleted.
        expect(writes).not.toMatch(/tx\.order\.delete/);
        expect(writes).not.toMatch(/tx\.booking\.delete/);
    });

    it("lists what goes and what stays in words, for the decision and the console", () => {
        expect(RETENTION_ERASED.length).toBeGreaterThanOrEqual(10);
        expect(RETENTION_KEPT.map((k) => k.what).join(" ")).toMatch(
            /Invoices and credit notes/,
        );
        expect(RETENTION_KEPT.map((k) => k.what).join(" ")).toMatch(
            /audit trails/,
        );
        expect(ERASE_STEPS).toEqual([
            "media",
            "waitlist",
            "contacts",
            "customers",
            "records",
            "analytics",
        ]);
    });
});
