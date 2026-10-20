import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
import type { LookTokens } from "./looks";
import {
    defaultLookForTemplate,
    isLookId,
    LOOK_IDS,
    LOOKS,
    parseLook,
    TEMPLATE_LOOKS,
} from "./looks";
import type { SectionType } from "./section-contract";
import { parseTypeScale } from "./type-scale";
import { resolveVariant } from "./variants";

const TOKEN_KEYS: (keyof LookTokens)[] = [
    "radius",
    "radiusSmall",
    "radiusPhoto",
    "pageMargin",
    "sectionPadding",
    "measure",
];

describe("every look is complete", () => {
    it.each(LOOK_IDS)("%s defines every token", (id) => {
        const look = LOOKS[id];
        expect(look.id).toBe(id);
        for (const key of TOKEN_KEYS) {
            expect(look.tokens[key], key).toBeDefined();
        }
        for (const length of [
            look.tokens.pageMargin,
            look.tokens.sectionPadding,
        ]) {
            expect(length.phone).toBeGreaterThan(0);
            expect(length.desk).toBeGreaterThanOrEqual(length.phone);
        }
        expect(look.fontPair).toBe(id);
        expect(["panel", "page", "sheets"]).toContain(look.booking);
        expect(look.name.length).toBeGreaterThan(1);
        expect(look.suits.length).toBeGreaterThan(10);
    });

    it.each(LOOK_IDS)("%s's type scale is within the bounds", (id) => {
        expect(parseTypeScale(LOOKS[id].type).ok).toBe(true);
    });

    it.each(LOOK_IDS)(
        "%s moves within 200 ms, rising 8px or less (KD5)",
        (id) => {
            const { motion } = LOOKS[id];
            expect(motion.ceiling).toBeLessThanOrEqual(200);
            for (const d of [motion.fast, motion.base, motion.slow]) {
                expect(d).toBeLessThanOrEqual(motion.ceiling);
            }
            expect(motion.rise).toBeLessThanOrEqual(8);
        },
    );

    it.each(LOOK_IDS)(
        "%s defaults only to variants the blocks have today",
        (id) => {
            for (const [type, variant] of Object.entries(
                LOOKS[id].defaultVariants,
            )) {
                const ids = BLOCK_META[type as SectionType].variants.map(
                    (v) => v.id,
                );
                expect(ids, `${id}: ${type}`).toContain(variant);
            }
        },
    );

    it("frames booking as DEC-172 says: Quiet a page, Folio a panel, Live sheets", () => {
        expect(LOOKS.quiet.booking).toBe("page");
        expect(LOOKS.folio.booking).toBe("panel");
        expect(LOOKS.live.booking).toBe("sheets");
    });
});

describe("parseLook", () => {
    it.each(LOOK_IDS)("accepts %s", (id) => {
        expect(parseLook(id)).toEqual({ ok: true, look: id });
    });

    it("reads absent and null as Classic", () => {
        expect(parseLook(undefined)).toEqual({ ok: true, look: undefined });
        expect(parseLook(null)).toEqual({ ok: true, look: undefined });
    });

    it.each(["corner", "classic", "Quiet", "", 3, {}, ["quiet"]])(
        "refuses %j",
        (value) => {
            expect(parseLook(value).ok).toBe(false);
            expect(isLookId(value)).toBe(false);
        },
    );
});

describe("the industry default (R10)", () => {
    it.each([
        ["salon", "quiet"],
        ["clinic", "quiet"],
        ["dietician", "quiet"],
        ["studio", "quiet"],
        ["bakery", "quiet"],
        ["ceramics", "quiet"],
        ["starter", "quiet"],
        ["gym", "live"],
        ["yoga", "folio"],
        ["classes", "folio"],
    ])("%s starts %s", (template, look) => {
        expect(defaultLookForTemplate(template)).toBe(look);
    });

    it("starts anything else Quiet", () => {
        expect(defaultLookForTemplate("portfolio")).toBe("quiet");
        expect(defaultLookForTemplate("not-a-template")).toBe("quiet");
        expect(defaultLookForTemplate(null)).toBe("quiet");
        expect(defaultLookForTemplate(undefined)).toBe("quiet");
        // Not the object's own keys.
        expect(defaultLookForTemplate("constructor")).toBe("quiet");
        expect(defaultLookForTemplate("__proto__")).toBe("quiet");
    });

    it("maps only to looks this build has", () => {
        for (const look of Object.values(TEMPLATE_LOOKS)) {
            expect(isLookId(look)).toBe(true);
        }
    });
});

describe("resolveVariant with a look (KD2)", () => {
    const photo = { src: "https://media.example.com/a.jpg", alt: "" };

    it("lets a section's own variant beat the look", () => {
        expect(
            resolveVariant(
                "hero",
                { variant: "centered", image: photo },
                "folio",
            ),
        ).toBe("centered");
        expect(resolveVariant("journal", { variant: "lead" }, "folio")).toBe(
            "lead",
        );
    });

    it("lets the look beat the legacy resolver", () => {
        // Classic: a hero with a photo is split.
        expect(resolveVariant("hero", { image: photo })).toBe("split");
        expect(resolveVariant("hero", { image: photo }, "quiet")).toBe(
            "centered",
        );
        expect(resolveVariant("journal", {}, "folio")).toBe("archive");
        expect(resolveVariant("timetable", {}, "quiet")).toBe("list");
    });

    it("gives a Folio hero with no photo its no-photo layout", () => {
        expect(resolveVariant("hero", { heading: "Hatha yoga" }, "folio")).toBe(
            "centered",
        );
        expect(resolveVariant("hero", { image: { src: " " } }, "folio")).toBe(
            "centered",
        );
        expect(resolveVariant("hero", { image: photo }, "folio")).toBe("split");
    });

    it("keeps the legacy rule where the look sets nothing", () => {
        expect(resolveVariant("gallery", { layout: "masonry" }, "quiet")).toBe(
            "masonry",
        );
        expect(resolveVariant("hero", { image: photo }, "live")).toBe("split");
    });

    it("leaves Classic exactly as it was", () => {
        for (const type of Object.keys(BLOCK_META) as SectionType[]) {
            const fixtures = Object.values(
                BLOCK_META[type].fixtures as Record<string, unknown>,
            );
            for (const content of [...fixtures, {}, null]) {
                const stripped =
                    content && typeof content === "object"
                        ? { ...content, variant: undefined }
                        : content;
                expect(resolveVariant(type, stripped, undefined)).toBe(
                    resolveVariant(type, stripped),
                );
            }
        }
    });
});
