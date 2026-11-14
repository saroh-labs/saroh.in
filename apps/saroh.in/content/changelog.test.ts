import { RELEASE_SWITCHES } from "@saroh/marketing/feature-switches";
import { describe, expect, it } from "vitest";

import { CHANGELOG_ENTRIES, WAITING_ENTRIES } from "./changelog";
import type { PublishContext } from "./resources";
import { isLive, liveBySlug } from "./resources";

/**
 * Changelog entries follow their feature's switch (plan 2026-11-13-002,
 * U11): an entry written ahead carries no day, and a dated one that waits
 * for a switch shows only while it is on.
 */
const ctx = (off: string[], preview = false): PublishContext => ({
    now: new Date("2026-12-01T00:00:00Z"),
    preview,
    routes: null,
    off,
});

describe("entries waiting for their release", () => {
    it("carry no day: no date for unreleased work is in the repo", () => {
        for (const e of WAITING_ENTRIES) {
            expect(Object.keys(e)).not.toContain("publishOn");
        }
    });

    it("each wait for a known switch", () => {
        const keys = Object.keys(RELEASE_SWITCHES);
        expect(WAITING_ENTRIES.map((e) => e.waitsFor)).toEqual([
            "ai-apps",
            "social",
            "developers",
            "ask-ai",
        ]);
        for (const e of WAITING_ENTRIES) expect(keys).toContain(e.waitsFor);
    });

    it("never share a slug with a dated entry", () => {
        const slugs = [...CHANGELOG_ENTRIES, ...WAITING_ENTRIES].map(
            (e) => e.slug,
        );
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("never claim Saroh posts for you, or name a price or plan", () => {
        for (const e of WAITING_ENTRIES) {
            const words = JSON.stringify(e);
            expect(words).not.toMatch(
                /posts? (it )?for you|automatically post|auto-?post/i,
            );
            expect(words).not.toMatch(/₹|\bFree plan\b|\bGrow\b|\bPro\b/);
        }
    });
});

describe("a dated entry that waits for a switch", () => {
    const entry = {
        slug: "ask-ai",
        publishOn: "2026-11-20",
        waitsFor: "ask-ai",
    };

    it("is hidden while its switch is off, past its day and on a preview", () => {
        expect(isLive(entry, ctx(["ask-ai"]))).toBe(false);
        expect(isLive(entry, ctx(["ask-ai"], true))).toBe(false);
        expect(liveBySlug([entry], "ask-ai", ctx(["ask-ai"]))).toBeNull();
    });

    it("shows once its switch is on and its day has come", () => {
        expect(isLive(entry, ctx([]))).toBe(true);
        expect(liveBySlug([entry], "ask-ai", ctx(["social"]))).toBe(entry);
        const before = { ...ctx([]), now: new Date("2026-11-18T00:00:00Z") };
        expect(isLive(entry, before)).toBe(false);
    });

    it("an entry without one keeps the date rule only", () => {
        const plain = { publishOn: "2026-11-20" };
        expect(isLive(plain, ctx(["ask-ai", "social"]))).toBe(true);
    });
});
