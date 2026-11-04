import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ShotKey } from "@saroh/marketing/content-types";
import { describe, expect, it } from "vitest";

import { features } from "@/content/features";
import { home } from "@/content/home";
import {
    GLOBAL_SHOTS,
    PENDING_SHOTS,
    SHOT_WIDTHS,
    shotView,
} from "@/content/shots";
import { solutions } from "@/content/solutions";

const pub = join(__dirname, "../public");

/** Every key a page names, and the page. */
function keysUsed(): Map<ShotKey, string> {
    const used = new Map<ShotKey, string>([[home.hero.shot, "home"]]);
    for (const f of Object.values(features)) {
        used.set(f.hero.shot, f.slug);
        for (const s of f.steps) used.set(s.shot, f.slug);
    }
    for (const s of Object.values(solutions)) {
        if (s.hero) used.set(s.hero.shot, s.slug);
        for (const seg of s.segments) {
            if (seg.shot) used.set(seg.shot, s.slug);
        }
    }
    return used;
}

/** What's missing for a shot's image at every width, as public paths. */
function missingFiles(
    key: string,
    width = Infinity,
    exists = existsSync,
): string[] {
    return [
        `/shots/v2/${key}.webp`,
        ...SHOT_WIDTHS.filter((w) => w < width).map(
            (w) => `/shots/v2/sized/${key}-${w}.webp`,
        ),
    ].filter((file) => !exists(join(pub, file)));
}

describe("saroh.tech's screenshots", () => {
    it("has images at all widths for every key a page names", () => {
        for (const [key, page] of keysUsed()) {
            if (key in PENDING_SHOTS) continue;
            expect(GLOBAL_SHOTS[key], `${page} names ${key}`).toBeDefined();
            expect(
                missingFiles(key, GLOBAL_SHOTS[key]?.width),
                `${page}: ${key}`,
            ).toEqual([]);
        }
    });

    it("fails on a missing image", () => {
        expect(missingFiles("no-such-shot")).toHaveLength(5);
        expect(missingFiles("s-home", 2880, () => false)).toContain(
            "/shots/v2/s-home.webp",
        );
    });

    it("lists a key as pending only while it has no image", () => {
        for (const key of Object.keys(PENDING_SHOTS) as ShotKey[]) {
            expect(GLOBAL_SHOTS[key], key).toBeUndefined();
            expect(shotView(key)).toBeUndefined();
        }
    });

    it("draws no frame for a key with no shot", () => {
        expect(shotView(undefined)).toBeUndefined();
        expect(shotView("r-subdetail")).toBeUndefined();
    });

    it("names only this site's demo businesses and never shows a plan's working screens", () => {
        for (const shot of Object.values(GLOBAL_SHOTS)) {
            expect(shot.alt).not.toMatch(
                /Rye & Co|Kavi|Pulse Fitness|Northwind|GST|₹/,
            );
        }
        expect(GLOBAL_SHOTS["g-subs"]).toBeUndefined();
    });

    it("never says team or plan in an alt: one person, nothing to buy", () => {
        for (const [key, shot] of Object.entries(GLOBAL_SHOTS)) {
            expect(shot.alt, key).not.toMatch(/\bteams?\b|\bplans?\b/i);
        }
    });

    it("names the shot's real business on every feature page", () => {
        const owner = (key: ShotKey) =>
            key.startsWith("d-")
                ? "Wrenfield Dental"
                : key.startsWith("g-")
                  ? "Ironvale Fitness"
                  : key.startsWith("l-")
                    ? "Larkspur & Vane"
                    : "Thistlewick Bakery";
        for (const f of Object.values(features)) {
            for (const s of f.steps) {
                expect(s.who, `${f.slug}: ${s.shot}`).toContain(owner(s.shot));
            }
        }
    });
});
