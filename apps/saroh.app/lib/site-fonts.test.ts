import { existsSync } from "node:fs";

import type { SiteFontFace } from "@saroh/site-blocks";
import {
    findFontPair,
    FONT_PAIRS,
    fontFaceKey,
    fontPairFaceKeys,
    fontPairStacks,
} from "@saroh/site-blocks";
import { describe, expect, it, vi } from "vitest";

import { SITE_FACES } from "./site-fonts";

interface Src {
    path: string;
    weight: string;
    style?: string;
}
interface Call {
    options: {
        src: string | Src[];
        weight?: string;
        display: string;
        preload: boolean;
        adjustFontFallback: string | false;
        declarations: { prop: string; value: string }[];
    };
    family: string;
}

/** Every `localFont` call this module makes, with its literal options. */
const calls = vi.hoisted(() => [] as Call[]);

// Hoisted above the import: next/font only runs inside Next's compiler; here
// the loader records its options and answers with a family per call, and a
// metric fallback only when it computes one, as it does in a build.
vi.mock("next/font/local", () => ({
    default: (options: Call["options"]) => {
        const name = `f${calls.length + 1}`;
        const family =
            options.adjustFontFallback === false
                ? `'${name}'`
                : `'${name}', '${name} Fallback'`;
        calls.push({ options, family });
        return { className: `c_${name}`, style: { fontFamily: family } };
    },
}));

const LATIN_EXT_RANGE = /U\+20AD-20C0/; // where ₹ (U+20B9) is

/** The two calls behind the face filed under `key`: latin, latin-ext. */
function callsFor(key: string): [Call, Call] {
    const [latin, ext] = SITE_FACES[key].split(", ");
    const a = calls.find((c) => c.family.startsWith(latin + ","));
    const b = calls.find((c) => c.family === ext);
    if (!a || !b) throw new Error(`no loader registered ${key}`);
    return [a, b];
}

const range = (c: Call) =>
    c.options.declarations.find((d) => d.prop === "unicode-range")?.value;

/** A call's files as `{ path, weight, style }`. */
function files(c: Call): Src[] {
    const { src, weight } = c.options;
    return typeof src === "string"
        ? [{ path: src, weight: weight ?? "" }]
        : src;
}

/** What a face's files must cover: its weights' span, and its styles. */
function expectedFiles(face: SiteFontFace, full: string) {
    const span =
        face.weights.length === 0
            ? full
            : `${Math.min(...face.weights)} ${Math.max(...face.weights)}`;
    return { span, styles: [...(face.styles ?? ["normal"])] };
}

describe("the renderer's faces (KTD-2)", () => {
    it("loads every face the font pairs name", () => {
        for (const key of FONT_PAIRS.flatMap((p) => fontPairFaceKeys(p))) {
            expect(SITE_FACES).toHaveProperty([key]);
        }
    });

    it("loads nothing the list does not name", () => {
        const named = new Set(FONT_PAIRS.flatMap((p) => fontPairFaceKeys(p)));
        for (const key of Object.keys(SITE_FACES)) {
            expect(named.has(key)).toBe(true);
        }
        // Two calls per face, latin and latin-ext: nothing left unused.
        expect(calls).toHaveLength(Object.keys(SITE_FACES).length * 2);
    });

    it("names a face's latin family, then its latin-ext one, then the fallback", () => {
        for (const key of Object.keys(SITE_FACES)) {
            const [latin, ext] = callsFor(key);
            const [l, fallback] = latin.family.split(", ");
            expect(SITE_FACES[key]).toBe(`${l}, ${ext.family}, ${fallback}`);
        }
    });

    it("maps a pair's key to the loaded families", () => {
        const stacks = fontPairStacks("geist", SITE_FACES);
        expect(stacks?.heading.startsWith(SITE_FACES.Geist)).toBe(true);
        // Geist for the body too (U9): the design's mono is an accent,
        // never the paragraphs' face.
        expect(stacks?.body.startsWith(SITE_FACES.Geist)).toBe(true);
        // Its mono role is JetBrains Mono, for machine facts only.
        expect(stacks?.mono?.startsWith(SITE_FACES["JetBrains Mono"])).toBe(
            true,
        );
    });

    it("preloads nothing, so no page fetches a face it is not set in", () => {
        // next/font preloads per layout file, not per request: one face
        // preloaded here would be preloaded on every site.
        for (const call of calls) {
            expect(call.options.preload, call.family).toBe(false);
            expect(call.options.display, call.family).toBe("swap");
        }
    });

    it("splits each face at Google's ranges, the fallback metrics on the latin call", () => {
        for (const key of Object.keys(SITE_FACES)) {
            const [latin, ext] = callsFor(key);
            expect(range(latin), key).toMatch(/^U\+0000-00FF,/);
            expect(range(ext), key).toMatch(LATIN_EXT_RANGE);
            // The fallback metrics that keep text still while it swaps.
            expect(latin.options.adjustFontFallback, key).toMatch(
                /^(Arial|Times New Roman)$/,
            );
            expect(ext.options.adjustFontFallback, key).toBe(false);
            // The same faces, cut at the other range.
            expect(
                files(ext).map((f) => ({
                    ...f,
                    path: f.path.replace("-latin-ext.", "-latin."),
                })),
                key,
            ).toEqual(files(latin));
        }
    });

    it("serves files that are in the repo, each with its licence beside it", () => {
        for (const call of calls) {
            for (const { path } of files(call)) {
                const url = new URL(path, import.meta.url);
                expect(existsSync(url), path).toBe(true);
                expect(existsSync(new URL("OFL.txt", url)), path).toBe(true);
                // One shared set of merchant files, never Saroh's own.
                expect(path).toMatch(/\/packages\/site-blocks\/fonts\//);
            }
        }
    });
});

/**
 * Each look's files (DEC-172, U3): two families, only the weights its type
 * sets. The weights are pinned here as literals, beside the list's own test,
 * so a change to either is a change someone made on purpose.
 */
describe("the looks' faces", () => {
    const LOOK_FILES = {
        folio: {
            heading: {
                files: ["Newsreader-opsz-wght", "Newsreader-Italic-opsz-wght"],
                weight: "200 800",
                styles: ["normal", "italic"],
            },
            body: {
                files: ["HankenGrotesk-400-600"],
                weight: "400 600",
                styles: ["normal"],
            },
        },
        quiet: {
            heading: {
                files: [
                    "CormorantGaramond-300-500",
                    "CormorantGaramond-Italic-300-500",
                ],
                weight: "300 500",
                styles: ["normal", "italic"],
            },
            body: {
                files: ["Jost-400-500"],
                weight: "400 500",
                styles: ["normal"],
            },
        },
        live: {
            heading: {
                files: ["BricolageGrotesque-wdth-wght"],
                weight: "200 800",
                styles: ["normal"],
            },
            body: {
                files: ["Figtree-400-700"],
                weight: "400 700",
                styles: ["normal"],
            },
        },
    } as const;

    it.each(Object.keys(LOOK_FILES) as (keyof typeof LOOK_FILES)[])(
        "%s loads exactly its two families, with the weights it sets",
        (look) => {
            const pair = findFontPair(look);
            expect(pair?.look).toBe(true);
            expect(pair?.mono).toBeUndefined();
            const keys = pair ? fontPairFaceKeys(pair) : [];
            expect(keys).toEqual([`${look}:heading`, `${look}:body`]);

            for (const role of ["heading", "body"] as const) {
                const want = LOOK_FILES[look][role];
                const [latin] = callsFor(`${look}:${role}`);
                const got = files(latin);
                expect(got.map((f) => f.path.split("/").pop())).toEqual(
                    want.files.map((f) => `${f}-latin.woff2`),
                );
                expect(got.map((f) => f.weight)).toEqual(
                    want.files.map(() => want.weight),
                );
                expect(got.map((f) => f.style ?? "normal")).toEqual(
                    want.styles,
                );
                // And the list says the same, so the editor and the
                // renderer can't disagree with it.
                if (pair) {
                    const { span, styles } = expectedFiles(
                        pair[role],
                        want.weight,
                    );
                    expect(want.weight).toBe(span);
                    expect([...want.styles]).toEqual(styles);
                }
            }
        },
    );

    it("lets Live's headings narrow: its faces declare the width range", () => {
        for (const call of callsFor("live:heading")) {
            expect(call.options.declarations).toContainEqual({
                prop: "font-stretch",
                value: "75% 100%",
            });
        }
    });

    it.each(["folio", "quiet", "live"])(
        "%s is set in its own loaded faces",
        (look) => {
            const stacks = fontPairStacks(look, SITE_FACES);
            expect(
                stacks?.heading.startsWith(SITE_FACES[`${look}:heading`]),
            ).toBe(true);
            expect(stacks?.body.startsWith(SITE_FACES[`${look}:body`])).toBe(
                true,
            );
            expect(stacks?.mono).toBeUndefined();
        },
    );

    it("keeps Folio's trimmed Newsreader apart from the newsreader pair's", () => {
        expect(SITE_FACES["folio:heading"]).not.toBe(SITE_FACES.Newsreader);
        const stacks = fontPairStacks("newsreader", SITE_FACES);
        expect(stacks?.heading.startsWith(SITE_FACES.Newsreader)).toBe(true);
    });
});

/**
 * A Classic site (no look) loads what it did before looks: each first
 * pair's face, upright, its full variable range (Plex Mono's two weights).
 */
describe("Classic sites are unchanged", () => {
    const BEFORE_LOOKS: Record<string, string[]> = {
        Fraunces: ["100 900"],
        "Inter Tight": ["100 900"],
        Newsreader: ["200 800"],
        "IBM Plex Sans": ["100 700"],
        "IBM Plex Mono": ["400", "500"],
        "Archivo Narrow": ["400 700"],
        Archivo: ["100 900"],
        "Source Serif 4": ["200 900"],
        Inter: ["100 900"],
        Geist: ["100 900"],
        "JetBrains Mono": ["100 800"],
    };

    it("loads the first pairs' faces at the weights they always had", () => {
        for (const [key, weights] of Object.entries(BEFORE_LOOKS)) {
            const [latin] = callsFor(key);
            expect(
                files(latin).map((f) => f.weight),
                key,
            ).toEqual(weights);
            expect(
                files(latin).every((f) => !f.style || f.style === "normal"),
            ).toBe(true);
        }
    });

    it("files every first pair's face under its family name, as before", () => {
        for (const pair of FONT_PAIRS.filter((p) => !("look" in p))) {
            for (const face of [pair.heading, pair.body]) {
                expect(fontFaceKey(face)).toBe(face.family);
            }
        }
    });

    it("sets the system pair in no loaded face", () => {
        const stacks = fontPairStacks("system", SITE_FACES);
        for (const family of Object.values(SITE_FACES)) {
            expect(stacks?.heading).not.toContain(family);
            expect(stacks?.body).not.toContain(family);
        }
    });
});
