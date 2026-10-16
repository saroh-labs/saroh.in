import { describe, expect, it } from "vitest";

import type { DsPost } from "./diary-shop-types";
import { MOTION_POSTS } from "./physio-posts";
import { NOOR_POSTS } from "./salon-posts";

/**
 * The journals the owner asked for: 24–30 posts a site, at least eight in
 * each of Help, News and Articles, each the length its kind should be, each
 * with a picture inside its body, every slug once.
 */
const LENGTHS: Record<DsPost["category"], [number, number]> = {
    help: [150, 400],
    news: [100, 300],
    articles: [400, 800],
};

const words = (html: string) =>
    html
        .replace(/<figure>[\s\S]*?<\/figure>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;

describe.each([
    ["Noor Salon & Bridal", NOOR_POSTS],
    ["Motion Physio", MOTION_POSTS],
])("%s's journal", (_name, posts) => {
    it("has 24–30 posts, 8+ per category, unique slugs", () => {
        expect(posts.length).toBeGreaterThanOrEqual(24);
        expect(posts.length).toBeLessThanOrEqual(30);
        for (const c of ["help", "news", "articles"] as const) {
            expect(
                posts.filter((p) => p.category === c).length,
            ).toBeGreaterThanOrEqual(8);
        }
        expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
    });

    it.each(posts.map((p) => [p.slug, p] as const))(
        "%s reads right",
        (_slug, p) => {
            const [lo, hi] = LENGTHS[p.category];
            const n = words(p.body);
            expect(n, `${p.slug}: ${n} words`).toBeGreaterThanOrEqual(lo);
            expect(n, `${p.slug}: ${n} words`).toBeLessThanOrEqual(hi);
            expect(p.body).toMatch(
                /<figure><img src="https:\/\/images\.unsplash\.com\//,
            );
            expect(p.body).not.toContain(p.image.url);
            expect(p.daysAgo).toBeGreaterThanOrEqual(2);
            expect(p.daysAgo).toBeLessThanOrEqual(185);
            expect(p.body.toLowerCase()).not.toContain("saroh");
        },
    );
});
