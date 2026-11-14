/**
 * A conversation's title from its first question (14 Nov): one line, cut
 * on a word near 60 characters. Sealing it is `turn.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({}));

import { conversationTitle } from "./turn-store";

describe("conversationTitle", () => {
    it("is a short question as asked, on one line", () => {
        expect(conversationTitle("  Top products\n this month? ")).toBe(
            "Top products this month?",
        );
    });

    it("cuts a long question on a word boundary, with an ellipsis", () => {
        const title = conversationTitle(
            "Which customers have not paid their bills from last month, and how much does each of them owe?",
        );
        expect(title).toBe(
            "Which customers have not paid their bills from last month…",
        );
        expect(title.length).toBeLessThanOrEqual(61);
    });

    it("cuts one very long word at the limit", () => {
        expect(conversationTitle("x".repeat(80))).toBe(`${"x".repeat(60)}…`);
    });
});
