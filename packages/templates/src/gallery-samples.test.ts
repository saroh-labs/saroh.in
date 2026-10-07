import { describe, expect, it } from "vitest";

import { GALLERY_SAMPLES } from "./gallery-samples";
import { instantiateTemplate } from "./instantiate";
import type { TemplateContext, TemplateManifest } from "./manifest";
import { listTemplates } from "./registry";

/**
 * The gallery's sample words (KTD-6) stay in the gallery. Every template the
 * gallery shows has its design's words for the render, and a merchant's site
 * made from it — whatever the business has switched on — carries none of
 * them: it keeps the placeholders the owner replaces.
 */

/** A template the gallery shows: the render route's own rule. */
const gallery = listTemplates().filter(
    (t) => (t.kinds?.length ?? 0) > 0 && t.sample !== undefined,
);

/** Every string inside a value, however deep. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/**
 * A merchant's business, as fully set up as the API could pass it: every
 * module the template uses on, a tagline, an email and services — so every
 * conditional section is laid down and could carry a sample if one leaked.
 */
function merchant(t: TemplateManifest): TemplateContext {
    return {
        organizationName: "Asha's Corner",
        modules: ["WEBSITE", ...(t.uses ?? [])],
        tagline: "A line the owner wrote",
        contactEmail: "owner@example.com",
        serviceIds: ["svc-1", "svc-2"],
    };
}

/**
 * The sample's distinctive words: every piece of text long enough to be
 * the sample's own (a name, a sentence, a figure), not a word any site
 * might use ("Strength", "2019").
 */
function sampleWords(sample: unknown): string[] {
    return [...new Set(strings(sample))].filter((s) => s.trim().length >= 8);
}

/** A text's pieces: the runs between tags, and between line breaks. */
function runsOf(text: string): string[] {
    return text
        .split(/<[^>]*>|\n/)
        .map((r) => r.trim())
        .filter(Boolean);
}

describe("gallery samples (KTD-6)", () => {
    it("gives every gallery template its design's words, footer line and all", () => {
        expect(gallery.length).toBe(9);
        for (const t of gallery) {
            expect(Object.hasOwn(GALLERY_SAMPLES, t.id), t.id).toBe(true);
            const sample = GALLERY_SAMPLES[t.id];
            expect(sample.footer.trim(), t.id).not.toBe("");
            // The sample's line is not the owner's placeholder line.
            expect(sample.footer, t.id).not.toBe(t.footer?.line);
        }
    });

    it("names only gallery templates", () => {
        const ids = gallery.map((t) => t.id).sort();
        expect(Object.keys(GALLERY_SAMPLES).sort()).toEqual(ids);
    });

    it.each(gallery.map((t) => [t.id, t] as const))(
        "lays none of %s's sample words on a merchant's site",
        (_id, t) => {
            const words = sampleWords(GALLERY_SAMPLES[t.id]);
            expect(words.length).toBeGreaterThan(0);
            for (const ctx of [
                merchant(t),
                { organizationName: "Asha's Corner" },
            ]) {
                const built = instantiateTemplate(t, ctx);
                const texts = [
                    ...built.pages.flatMap((p) =>
                        p.sections.flatMap((s) => strings(s.content)),
                    ),
                    t.footer?.line ?? "",
                ];
                const site = texts.join("\n");
                const runs = new Set(texts.flatMap(runsOf));
                for (const word of words) {
                    // A sentence anywhere; a short value (a name, a figure)
                    // as a piece of text of its own, so a placeholder's
                    // "for example, Registered dietician · Pune" is not it.
                    if (word.length >= 40) {
                        expect(site, `${t.id}: "${word}"`).not.toContain(word);
                    } else {
                        expect(runs.has(word), `${t.id}: "${word}"`).toBe(
                            false,
                        );
                    }
                }
            }
        },
    );
});
