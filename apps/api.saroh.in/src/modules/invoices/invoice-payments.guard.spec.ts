import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every hand route that moves money on an invoice runs its guards (code
 * review, 20 Oct): a cheque cleared on a credited invoice sent a "paid"
 * receipt (#5), and Record payment ran while autopay was charging (#8),
 * because one route of four skipped the check the others made.
 *
 * This reads `invoice-payments.service.ts` and fails a route that changes
 * a payment without `assertMoneyCanMove` (the invoice ISSUED or PAID), or
 * a record without the autopay check. A new route is added to the list.
 */

const SOURCE = readFileSync(
    join(__dirname, "invoice-payments.service.ts"),
    "utf8",
);

/** A method's body: from `async name(` to the next method at its depth. */
function methodBody(name: string): string {
    const start = SOURCE.indexOf(`    async ${name}(`);
    if (start < 0) throw new Error(`No method ${name}`);
    const rest = SOURCE.slice(start + 1);
    const next = rest.search(/\n {4}(?:async |private |\/\*\*|\/\/ —)/);
    return next < 0 ? rest : rest.slice(0, next);
}

describe("the ledger's hand routes run their guards", () => {
    it.each(["remove", "cleared", "bounced"])(
        "%s refuses a credited or void invoice",
        (name) => {
            expect(methodBody(name)).toContain("this.assertMoneyCanMove(");
        },
    );

    it("record waits while autopay is charging the invoice", () => {
        const body = methodBody("record");
        expect(body).toContain("chargeUnderWayOn(");
        expect(body).toContain("autopayChargeInProgress()");
    });

    it("record dedupes on the sheet's key, never on matching fields", () => {
        const body = methodBody("record");
        expect(body).toContain("keyedPayment(");
        expect(SOURCE).not.toMatch(/REPEAT_WINDOW|repeatOf\(/);
    });
});
