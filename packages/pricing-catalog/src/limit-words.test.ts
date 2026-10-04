import { describe, expect, it } from "vitest";

import { LIMIT_WORDS, limitWordsFor } from "./limit-words";
import { MODULE_MAP } from "./module-map";

describe("limit words", () => {
    it("has words for every limit key the module map counts", () => {
        for (const entry of Object.values(MODULE_MAP)) {
            if (entry.limitKey)
                expect(LIMIT_WORDS[entry.limitKey]).toBeTruthy();
        }
    });

    it("finds a row's words by its catalogue id", () => {
        expect(limitWordsFor("members")?.paused).toBe(
            "New invites are paused. Everyone already on the team keeps access.",
        );
        expect(limitWordsFor("orders")?.monthly).toBe(true);
    });

    it("has none for a switch or an unknown row", () => {
        expect(limitWordsFor("invoicing")).toBeNull();
        expect(limitWordsFor("toString")).toBeNull();
    });
});
