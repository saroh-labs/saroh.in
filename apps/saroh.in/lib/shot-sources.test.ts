import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { shots } from "@/content/shots";
import { CAPTURED } from "@/content/shots.captured";

import {
    SHOT_WIDTHS,
    shotSources,
    sizedShotSrc,
    sizedWidths,
} from "./shot-sources";

const PUBLIC = path.join(__dirname, "../public");
/** Every captured shot with sized copies: the pages' and Help's steps'. */
const CAPTURES = [
    ...Object.entries(shots).map(([key, shot]) => ({ key, dir: "v2", shot })),
    ...Object.entries(CAPTURED)
        .filter(([, shot]) => shot.src.startsWith("/shots/help/"))
        .map(([key, shot]) => ({ key, dir: "help", shot })),
];
const SIZED_DIRS = ["v2", "help"].map((dir) =>
    path.join(PUBLIC, "shots", dir, "sized"),
);
const REBUILD = "run `pnpm --filter web shots:sizes`";

/**
 * A page's screenshot is served as files (12 Oct 2026): the capture and its
 * smaller copies in a `srcset`, none through `/_next/image`, which on
 * Cloudflare re-encoded the largest thing on the page on every request.
 */
describe("shotSources", () => {
    it("names every smaller copy and the capture itself, smallest first", () => {
        expect(
            shotSources({ src: "/shots/v2/s-home.webp", width: 2880 }),
        ).toEqual({
            src: "/shots/v2/s-home.webp",
            srcSet: [
                "/shots/v2/sized/s-home-640.webp 640w",
                "/shots/v2/sized/s-home-960.webp 960w",
                "/shots/v2/sized/s-home-1280.webp 1280w",
                "/shots/v2/sized/s-home-1920.webp 1920w",
                "/shots/v2/s-home.webp 2880w",
            ].join(", "),
        });
    });

    it("offers no copy as wide as the capture or wider", () => {
        expect(sizedWidths(1280)).toEqual([640, 960]);
        expect(sizedWidths(640)).toEqual([]);
        expect(
            shotSources({ src: "/shots/v2/small.webp", width: 600 }),
        ).toEqual({ src: "/shots/v2/small.webp" });
    });

    it("gives a Help step's shot its copies in shots/help/sized", () => {
        expect(
            shotSources({ src: "/shots/help/help-x-1.webp", width: 1000 }),
        ).toEqual({
            src: "/shots/help/help-x-1.webp",
            srcSet: [
                "/shots/help/sized/help-x-1-640.webp 640w",
                "/shots/help/sized/help-x-1-960.webp 960w",
                "/shots/help/help-x-1.webp 1000w",
            ].join(", "),
        });
    });

    it("serves any other image as it is", () => {
        expect(
            shotSources({ src: "/templates/salon/cover.webp", width: 2048 }),
        ).toEqual({ src: "/templates/salon/cover.webp" });
    });

    it("never points at the image optimizer", () => {
        for (const shot of Object.values(shots)) {
            if (!shot.src) continue;
            const { src, srcSet } = shotSources({
                src: shot.src,
                width: shot.width,
            });
            expect(`${src} ${srcSet}`).not.toContain("/_next/image");
        }
    });
});

describe("the sized copies on disk", () => {
    const expected = new Set<string>();
    for (const { key, dir, shot } of CAPTURES) {
        if (!shot.src) continue;
        for (const w of sizedWidths(shot.width)) {
            expected.add(sizedShotSrc(key, w, dir));
        }
    }

    it("has widths to build", () => {
        expect(SHOT_WIDTHS.length).toBeGreaterThan(0);
        expect([...SHOT_WIDTHS]).toEqual(
            [...SHOT_WIDTHS].sort((a, b) => a - b),
        );
        expect(expected.size).toBeGreaterThan(0);
    });

    it(`has a file for every address a page can name (else ${REBUILD})`, () => {
        const missing = Array.from(expected).filter(
            (src) => !fs.existsSync(path.join(PUBLIC, src)),
        );
        expect(missing, REBUILD).toEqual([]);
    });

    it(`has no copy left behind by a shot that is gone (else ${REBUILD})`, () => {
        const extra = SIZED_DIRS.flatMap((dir) =>
            fs
                .readdirSync(dir)
                .map(
                    (name) => `/${path.relative(PUBLIC, path.join(dir, name))}`,
                ),
        ).filter((src) => !expected.has(src));
        expect(extra, REBUILD).toEqual([]);
    });

    it("each copy is lighter than its capture", () => {
        for (const { key, dir, shot } of CAPTURES) {
            if (!shot.src) continue;
            const full = fs.statSync(path.join(PUBLIC, shot.src)).size;
            for (const w of sizedWidths(shot.width)) {
                const copy = fs.statSync(
                    path.join(PUBLIC, sizedShotSrc(key, w, dir)),
                ).size;
                expect(copy, `${key} at ${w}`).toBeLessThan(full);
            }
        }
    });
});
