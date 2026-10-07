import { describe, expect, it } from "vitest";

import { limitNotice } from "./limit-notice";
import { countedWhat, LIMIT_WORDS, limitWordsFor } from "./limit-words";
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
            "New invites are paused. Everyone already on the team keeps access, and view-only people can still be invited.",
        );
        expect(limitWordsFor("orders")?.monthly).toBe(true);
    });

    it("says nothing is blocked for the soft allowances", () => {
        expect(limitWordsFor("storage")?.paused).toMatch(/^Nothing is blocked/);
        expect(limitWordsFor("visits")?.paused).toMatch(/^Nothing is blocked/);
        expect(limitWordsFor("visits")?.monthly).toBe(true);
        expect(limitWordsFor("locations")?.what).toBe("places customers visit");
    });

    it("has none for a switch or an unknown row", () => {
        expect(limitWordsFor("invoicing")).toBeNull();
        expect(limitWordsFor("toString")).toBeNull();
    });

    it("leads Saroh's emails with connecting the business's own, monthly", () => {
        const words = limitWordsFor("saroh-emails");
        expect(words?.monthly).toBe(true);
        expect(words?.action).toMatchObject({
            label: "Connect your email",
            href: "/settings/providers",
        });
        // Only Saroh's emails name their own way out.
        for (const [key, w] of Object.entries(LIMIT_WORDS)) {
            if (key !== "sarohEmailsPerMonth") expect(w.action).toBeUndefined();
        }
    });
});

describe("one of a thing (UX-041)", () => {
    it('every limit says one of itself, never "1 websites"', () => {
        for (const words of Object.values(LIMIT_WORDS)) {
            expect(words.one).toBeTruthy();
            expect(countedWhat(words.what, 1)).toBe(words.one);
            expect(countedWhat(words.what, 2)).toBe(words.what);
        }
        expect(countedWhat("websites", 1)).toBe("website");
        expect(countedWhat("team members", 1)).toBe("team member");
        expect(countedWhat("something else", 1)).toBe("something else");
    });

    it("the shared notice counts one as one", () => {
        const n = limitNotice(
            { inc: true, limit: 1, plan: "Plan A", upgradeTo: "Plan B" },
            1,
            "websites",
            "You can't add another website.",
        );
        expect(n.on && n.title).toBe("You've reached your 1 website on Plan A");
    });
});
