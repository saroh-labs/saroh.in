import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "./instantiate";
import type { TemplateContext } from "./manifest";
import {
    isOwnerNote,
    OWNER_NOTES,
    templatePlaceholderIn,
    templatePlaceholderInAny,
    templateStockPhraseIn,
} from "./placeholders";
import { personalTemplateV1 } from "./templates/personal";
import {
    HERO_PROMPT,
    starterTemplateV1,
    starterTemplateV2,
    starterTemplateV3,
} from "./templates/starter";

const nameOnly: TemplateContext = { organizationName: "Asha Rao" };

/** Every string a visitor would read in a template's output. */
function visitorStrings(value: unknown, key = ""): string[] {
    if (typeof value === "string") {
        return ["imageBrief", "src", "alt", "href"].includes(key)
            ? []
            : [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap((v) => visitorStrings(v, key));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => visitorStrings(v, k));
    }
    return [];
}

describe("a template's note to the owner", () => {
    it("is starter@3's hero line, whatever its case, spacing or full stop", () => {
        expect(OWNER_NOTES).toContain(HERO_PROMPT);
        expect(isOwnerNote(HERO_PROMPT)).toBe(true);
        expect(isOwnerNote("  say what you do and where,  in one line ")).toBe(
            true,
        );
    });

    it("is not a sentence the owner wrote that only contains the words", () => {
        expect(
            isOwnerNote(
                "We say what you do and where, in one line, on your sign.",
            ),
        ).toBe(false);
        expect(isOwnerNote("Haircuts and colour in Indiranagar")).toBe(false);
        expect(isOwnerNote(undefined)).toBe(false);
    });

    it("is named by the pre-publish matcher", () => {
        expect(templatePlaceholderIn(HERO_PROMPT)).toBe(HERO_PROMPT);
    });
});

describe("the first starters' stock sentences", () => {
    it.each([
        ["starter@1", starterTemplateV1],
        ["starter@2", starterTemplateV2],
        ["starter@3", starterTemplateV3],
    ])("%s still carries one in every text block it made", (_v, template) => {
        const texts = instantiateTemplate(template, nameOnly)
            .pages.flatMap((p) => p.sections)
            .filter((s) => s.type === "richText")
            .map((s) => (s.content as { value: string }).value);
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
            expect(templatePlaceholderInAny([text])).not.toBeNull();
        }
    });

    it("is found inside a longer paragraph, with the business's name woven in", () => {
        expect(
            templateStockPhraseIn(
                "It starts with a conversation: what you need, when you need it and what good looks like. From there, Rye & Co. keeps you posted until it's done.",
            ),
        ).not.toBeNull();
        // A curly apostrophe, as an editor may have rewritten it.
        expect(
            templateStockPhraseIn(
                "Have a look around to see the work, how it’s done and who it’s for.",
            ),
        ).not.toBeNull();
    });

    it("is not an owner's own sentence on the same subject", () => {
        expect(
            templateStockPhraseIn(
                "Every job starts with a conversation about what you need.",
            ),
        ).toBeNull();
        expect(templatePlaceholderIn("We're glad you're here.")).toBeNull();
    });

    it("catches the greeting the first starters put under the headline", () => {
        for (const template of [starterTemplateV1, starterTemplateV2]) {
            const hero = instantiateTemplate(template, nameOnly).pages[0]
                ?.sections[0]?.content as { subheading: string };
            expect(templatePlaceholderIn(hero.subheading)).not.toBeNull();
        }
    });
});

describe("the Personal template's placeholder lines", () => {
    it("are every one named, so none is published unnoticed", () => {
        const { pages } = instantiateTemplate(personalTemplateV1, nameOnly);
        const written = pages
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "features" || s.type === "richText")
            .flatMap((s) => {
                const c = s.content as {
                    items?: { body?: string }[];
                    value?: string;
                };
                return [
                    ...(c.items ?? []).map((i) => i.body ?? ""),
                    ...(c.value ? [c.value] : []),
                ];
            });
        expect(written.length).toBeGreaterThan(4);
        for (const text of written) {
            expect(templatePlaceholderInAny([text])).not.toBeNull();
        }
        // The second paragraph of About is one the first list missed.
        expect(
            templatePlaceholderIn(
                "Then say what someone can expect when they get in touch.",
            ),
        ).not.toBeNull();
        expect(
            templatePlaceholderIn(
                "Another thing you do. Remove this one if you only offer one.",
            ),
        ).not.toBeNull();
    });

    it("leave an owner's ordinary sentences alone", () => {
        for (const text of visitorStrings([
            "Another way to reach us is by phone.",
            "Then we get to work.",
            "Asha Rao has cut hair in Indiranagar since 2014.",
        ])) {
            expect(templatePlaceholderIn(text)).toBeNull();
        }
    });
});
