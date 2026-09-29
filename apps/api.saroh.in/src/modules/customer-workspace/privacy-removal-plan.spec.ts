import {
    REMOVAL_RULES,
    REMOVED_BODY,
    REMOVED_NAME,
    REVIEWER_NAME,
    removalRefusals,
} from "./privacy-removal-plan";

/**
 * A privacy removal's rules, pure (DEC-042, C11): what each relation to a
 * contact becomes, the refusals and the words the records keep.
 */

describe("removalRefusals (default 25)", () => {
    it("lets a removal go ahead with nothing open or live", () => {
        expect(removalRefusals({ openOrders: 0, livePlans: [] })).toEqual([]);
    });

    it("names one open order", () => {
        expect(removalRefusals({ openOrders: 1, livePlans: [] })).toEqual([
            {
                reason: "open-order",
                message: "Finish or cancel their open order first",
            },
        ]);
    });

    it("counts several open orders", () => {
        expect(
            removalRefusals({ openOrders: 3, livePlans: [] })[0]?.message,
        ).toBe("Finish or cancel their 3 open orders first");
    });

    it("names each live plan once, orders first", () => {
        expect(
            removalRefusals({
                openOrders: 1,
                livePlans: ["Weekly", "Monthly", "Weekly"],
            }).map((r) => r.message),
        ).toEqual([
            "Finish or cancel their open order first",
            "Cancel their Monthly subscription first",
            "Cancel their Weekly subscription first",
        ]);
    });
});

describe("REMOVAL_RULES", () => {
    it("leaves the CRM's leads and form entries as they are (DEC-041)", () => {
        expect(REMOVAL_RULES["Lead.contactId"]?.kind).toBe("kept-crm");
        expect(REMOVAL_RULES["Submission.contactId"]?.kind).toBe("kept-crm");
    });

    it("keeps issued invoices as printed", () => {
        expect(REMOVAL_RULES["Invoice.contactId"]?.kind).toBe(
            "kept-as-printed",
        );
    });

    it("deletes the message thread with its messages (A13)", () => {
        expect(REMOVAL_RULES["CustomerThread.contactId"]?.kind).toBe(
            "delete-thread",
        );
    });

    it("cancels autopay at the provider (D20)", () => {
        expect(REMOVAL_RULES["PaymentMandate.contactId"]?.kind).toBe(
            "cancel-mandates",
        );
    });

    it("gives every rule a reason", () => {
        for (const [key, rule] of Object.entries(REMOVAL_RULES)) {
            expect([key, rule.note.length > 10]).toEqual([key, true]);
        }
    });
});

describe("what the records say afterwards", () => {
    it("uses the design's words", () => {
        expect(REMOVED_NAME).toBe("Removed customer");
        expect(REMOVED_BODY).toBe("Removed");
        expect(REVIEWER_NAME).toBe("A customer");
    });
});
