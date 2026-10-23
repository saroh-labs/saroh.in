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

/** Every `next/font` call this module makes, with its literal options. */
const calls = vi.hoisted(
    () =>
        [] as {
            loader: string;
            options: Record<string, unknown>;
            family: string;
        }[],
);

// Hoisted above the import: next/font only runs inside Next's compiler; here
// each loader records its options and answers with a hashed-looking family,
// one per call, as it does in a build.
vi.mock("next/font/google", () => {
    const loader = (name: string) => (options: Record<string, unknown>) => {
        const n = calls.length + 1;
        const family = `'__${name}_x${n}', '__${name}_Fallback_x${n}'`;
        calls.push({ loader: name, options, family });
        return {
            className: `__className_${name}_x${n}`,
            style: { fontFamily: family },
        };
    };
    const names = [
        "Archivo",
        "Archivo_Narrow",
        "Bricolage_Grotesque",
        "Cormorant_Garamond",
        "Figtree",
        "Fraunces",
        "Geist",
        "Hanken_Grotesk",
        "IBM_Plex_Mono",
        "IBM_Plex_Sans",
        "Inter",
        "Inter_Tight",
        "JetBrains_Mono",
        "Jost",
        "Newsreader",
        "Source_Serif_4",
    ];
    return Object.fromEntries(names.map((n) => [n, loader(n)]));
});

/** The call that registered the family filed under `key`. */
function callFor(key: string) {
    const call = calls.find((c) => c.family === SITE_FACES[key]);
    if (!call) throw new Error(`no loader registered ${key}`);
    return call;
}

/** The loaded family filed under `key`, or the test fails here. */
function loaded(key: string): string {
    if (!(key in SITE_FACES)) throw new Error(`nothing loaded for ${key}`);
    return SITE_FACES[key];
}

/** The options a face's list entry says its loader takes. */
function expectedOptions(face: SiteFontFace) {
    return {
        subsets: [...(face.subsets ?? ["latin"])],
        ...(face.axes
            ? { axes: [...face.axes] }
            : { weight: face.weights.map(String) }),
        ...(face.styles ? { style: [...face.styles] } : {}),
        display: "swap",
        preload: false,
    };
}

describe("the renderer's faces (KTD-2)", () => {
    it("loads every face the font pairs name", () => {
        // Mono faces included: a pair's third role loads like the others.
        for (const key of FONT_PAIRS.flatMap((p) => fontPairFaceKeys(p))) {
            expect(SITE_FACES).toHaveProperty([key]);
        }
    });

    it("loads nothing the list does not name", () => {
        const named = new Set(FONT_PAIRS.flatMap((p) => fontPairFaceKeys(p)));
        for (const key of Object.keys(SITE_FACES)) {
            expect(named.has(key)).toBe(true);
        }
        // One call per face: nothing is loaded and left unused.
        expect(calls).toHaveLength(Object.keys(SITE_FACES).length);
    });

    it("maps a pair's key to the loaded families", () => {
        const stacks = fontPairStacks("geist", SITE_FACES);
        expect(stacks?.heading).toMatch(/^'__Geist_x\d+', '__Geist_Fallback_/);
        // Geist for the body too (U9): the design's mono is an accent,
        // never the paragraphs' face.
        expect(stacks?.body).toMatch(/^'__Geist_x\d+', /);
        // Its mono role is JetBrains Mono, for machine facts only.
        expect(stacks?.mono).toMatch(/^'__JetBrains_Mono_x\d+', /);
    });

    it("preloads nothing, so no page fetches a face it is not set in", () => {
        // next/font preloads per layout file, not per request: one face
        // preloaded here would be preloaded on every site.
        for (const call of calls) {
            expect(call.options.preload, call.loader).toBe(false);
            expect(call.options.display, call.loader).toBe("swap");
            // The fallback metrics that keep text still while it swaps.
            expect(call.options.adjustFontFallback, call.loader).not.toBe(
                false,
            );
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
                loader: "Newsreader",
                options: {
                    subsets: ["latin", "latin-ext"],
                    axes: ["opsz"],
                    style: ["normal", "italic"],
                    display: "swap",
                    preload: false,
                },
            },
            body: {
                loader: "Hanken_Grotesk",
                options: {
                    subsets: ["latin"],
                    weight: ["400", "500", "600"],
                    display: "swap",
                    preload: false,
                },
            },
        },
        quiet: {
            heading: {
                loader: "Cormorant_Garamond",
                options: {
                    subsets: ["latin", "latin-ext"],
                    weight: ["300", "400", "500"],
                    style: ["normal", "italic"],
                    display: "swap",
                    preload: false,
                },
            },
            body: {
                loader: "Jost",
                options: {
                    subsets: ["latin"],
                    weight: ["400", "500"],
                    display: "swap",
                    preload: false,
                },
            },
        },
        live: {
            heading: {
                loader: "Bricolage_Grotesque",
                options: {
                    subsets: ["latin", "latin-ext"],
                    axes: ["wdth"],
                    display: "swap",
                    preload: false,
                },
            },
            body: {
                loader: "Figtree",
                options: {
                    subsets: ["latin", "latin-ext"],
                    weight: ["400", "500", "600", "700"],
                    display: "swap",
                    preload: false,
                },
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
                const call = callFor(`${look}:${role}`);
                expect(call.loader).toBe(LOOK_FILES[look][role].loader);
                expect(call.options).toEqual(LOOK_FILES[look][role].options);
                // And the list says the same, so the editor and the
                // renderer can't disagree with it.
                if (pair)
                    expect(call.options).toEqual(expectedOptions(pair[role]));
            }
        },
    );

    it.each(["folio", "quiet", "live"])(
        "%s is set in its own loaded faces",
        (look) => {
            const stacks = fontPairStacks(look, SITE_FACES);
            expect(stacks?.heading.startsWith(loaded(`${look}:heading`))).toBe(
                true,
            );
            expect(stacks?.body.startsWith(loaded(`${look}:body`))).toBe(true);
            expect(stacks?.mono).toBeUndefined();
        },
    );

    it("keeps Folio's trimmed Newsreader apart from the newsreader pair's", () => {
        expect(SITE_FACES["folio:heading"]).not.toBe(SITE_FACES.Newsreader);
        const stacks = fontPairStacks("newsreader", SITE_FACES);
        expect(stacks?.heading.startsWith(loaded("Newsreader"))).toBe(true);
    });
});

/**
 * A Classic site (no look) loads exactly what it did before looks: the same
 * eleven calls with the same options, and nothing for the system pair.
 */
describe("Classic sites are unchanged", () => {
    const BEFORE_LOOKS: [string, Record<string, unknown>][] = [
        ["Fraunces", { subsets: ["latin"], display: "swap", preload: false }],
        [
            "Inter_Tight",
            { subsets: ["latin"], display: "swap", preload: false },
        ],
        ["Newsreader", { subsets: ["latin"], display: "swap", preload: false }],
        [
            "IBM_Plex_Sans",
            { subsets: ["latin"], display: "swap", preload: false },
        ],
        [
            "IBM_Plex_Mono",
            {
                subsets: ["latin"],
                weight: ["400", "500"],
                display: "swap",
                preload: false,
            },
        ],
        [
            "Archivo_Narrow",
            { subsets: ["latin"], display: "swap", preload: false },
        ],
        ["Archivo", { subsets: ["latin"], display: "swap", preload: false }],
        [
            "Source_Serif_4",
            { subsets: ["latin"], display: "swap", preload: false },
        ],
        ["Inter", { subsets: ["latin"], display: "swap", preload: false }],
        ["Geist", { subsets: ["latin"], display: "swap", preload: false }],
        [
            "JetBrains_Mono",
            { subsets: ["latin"], display: "swap", preload: false },
        ],
    ];

    it("calls the first pairs' loaders exactly as before", () => {
        const lookFamilies = new Set(
            FONT_PAIRS.filter((p) => "look" in p)
                .flatMap((p) => fontPairFaceKeys(p))
                .map((k) => SITE_FACES[k]),
        );
        const classic = calls
            .filter((c) => !lookFamilies.has(c.family))
            .map((c) => [c.loader, c.options]);
        expect(classic).toEqual(BEFORE_LOOKS);
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
