import { describe, expect, it } from "vitest";

import type { RefundAnswers } from "./logic";
import { list, policy, policyText, policyTitle, updatedLine } from "./logic";

// The boards' sample: Gulmohar Handlooms, Jaipur, 7-day returns.
const GULMOHAR: RefundAnswers = {
    name: "Gulmohar Handlooms",
    sell: "products",
    days: "7",
    unused: true,
    back: "refund",
    within: "7",
    ship: "customer",
    unhappy: "redo",
    not: "Sale items, altered blouses, innerwear",
    wa: "9999999999",
    email: "returns@example.com",
};

describe("refund policy", () => {
    it("writes the boards' policy to the letter", () => {
        expect(policyTitle(GULMOHAR)).toBe(
            "Returns and refunds, Gulmohar Handlooms",
        );
        expect(policy(GULMOHAR)).toEqual([
            {
                head: "Returns.",
                text: "You can return an item within 7 days of it reaching you, if it is unused and has its tags on.",
            },
            {
                head: "What we can't take back.",
                text: "Sale items, altered blouses and innerwear.",
            },
            {
                head: "How to ask.",
                text: "Message us on WhatsApp at +91 99999 99999 or email returns@example.com with your order number. We'll tell you where to send it.",
            },
            {
                head: "Your refund.",
                text: "Once the item reaches us and we've checked it, we refund it to the way you paid, within 7 working days. Your bank or UPI app may take a few more days to show it.",
            },
            {
                head: "Sending it back.",
                text: "You pay to send it back. If the item arrived damaged or isn't what you ordered, we pay, and we may ask for a photo first.",
            },
        ]);
    });

    it("with no returns, still says what happens to a damaged or wrong item", () => {
        const heads = policy({ ...GULMOHAR, days: "0" }).map((p) => p.head);
        expect(heads).toEqual([
            "No returns.",
            "Damaged or wrong item.",
            "How to tell us.",
        ]);
    });

    it("for a service, writes the services words", () => {
        const p = policy({ ...GULMOHAR, sell: "services", name: "Rye Studio" });
        expect(
            policyTitle({ ...GULMOHAR, sell: "services", name: "Rye Studio" }),
        ).toBe("Refunds, Rye Studio");
        expect(p[0]).toEqual({
            head: "If you're not happy.",
            text: "Tell us within 3 days of your appointment and we'll put it right at no charge.",
        });
        expect(p[2]).toEqual({
            head: "How to tell us.",
            text: "Message us on WhatsApp at +91 99999 99999 or email returns@example.com.",
        });
    });

    it("marks the gap when there's no way to ask", () => {
        const p = policy({ ...GULMOHAR, wa: "", email: "" });
        expect(p[2]?.text).toBe("[your WhatsApp or email]");
    });

    it("joins a list in plain words", () => {
        expect(list("Sale items")).toBe("Sale items.");
        expect(list("")).toBe("");
    });

    it("copies as plain text with the date", () => {
        const d = updatedLine(new Date(2026, 9, 26));
        expect(d).toBe("Last updated 26 October 2026");
        expect(policyText(GULMOHAR, d)).toMatch(
            /^Returns and refunds, Gulmohar Handlooms\n\nLast updated 26 October 2026\n\nReturns\. You can return/,
        );
    });
});
