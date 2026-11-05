import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HELP, HELP_GROUPS, helpArticle } from "@/content/help";
import { SITE_COOKIES, SITE_STORAGE } from "@/content/legal";
import { site } from "@/site.config";

import { pageOf } from "./site-map";

const root = join(__dirname, "..");
const source = (dir: string) =>
    readdirSync(join(root, dir))
        .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
        .map((f) => readFileSync(join(root, dir, f), "utf8"))
        .join("\n");

describe("help articles", () => {
    it("have a page in the site map, and related articles that exist", () => {
        for (const a of HELP) {
            expect(pageOf(`/help/${a.slug}`).h1).toBe(a.task);
            for (const r of a.related) {
                expect(helpArticle(r), `${a.slug} → ${r}`).toBeTruthy();
                expect(r).not.toBe(a.slug);
            }
        }
    });

    it("go to the app or to a page on this site", () => {
        for (const a of HELP) {
            if (a.next.inApp) {
                expect(a.next.href.startsWith(site.appUrl)).toBe(true);
            } else {
                expect(pageOf(a.next.href).path).toBe(a.next.href);
            }
        }
    });

    it("carry no draft marks, and cover what /help says they do", () => {
        expect(JSON.stringify(HELP)).not.toContain("[confirm");
        for (const group of HELP_GROUPS) {
            expect(
                HELP.filter((a) => a.group === group).length,
                group,
            ).toBeGreaterThan(0);
        }
    });
});

describe("the cookies page", () => {
    it("names every cookie the Worker sets", () => {
        const set = source("worker").match(/saroh_[a-z_]+/g) ?? [];
        const listed = SITE_COOKIES.map(([name]) => name as string);
        expect(new Set(set)).toEqual(new Set(listed));
    });

    it("names every key the free tools keep in the browser", () => {
        const keys =
            (source("lib/tools") + source("components/tools")).match(
                /saroh\.tech\.[a-z-]+/g,
            ) ?? [];
        const listed = SITE_STORAGE.map(([name]) => name as string);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            expect(
                listed.some((l) => l.startsWith(key)),
                key,
            ).toBe(true);
        }
    });
});
