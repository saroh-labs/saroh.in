import { TEMPLATE_KINDS, getTemplate, listTemplates } from "@saroh/templates";
import { describe, expect, it } from "vitest";

import {
    GALLERY_KINDS,
    USES_WORDS,
    countWord,
    galleryChips,
    galleryTemplate,
    galleryTemplates,
    isGalleryTemplate,
    listWords,
    relatedTemplates,
    templateDetail,
    templatesPage,
} from "./templates";
import { WAITLIST_KINDS } from "./waitlist";

/**
 * The Templates gallery's content (industry templates plan U13, Resources
 * plan U6): only templates a merchant can pick, from `@saroh/templates`
 * itself; chips only for kinds that have one; every count derived; and no
 * price, plan or limit anywhere (the repo is public, the "Plan" fact is cut).
 */
const templates = galleryTemplates();

/** A gallery template that must exist. */
function must(slug: string) {
    const t = galleryTemplate(slug);
    if (!t) throw new Error(`no gallery template ${slug}`);
    return t;
}

describe("which templates the gallery shows (KTD-6)", () => {
    it("shows the nine industry templates, in the design's order", () => {
        expect(templates.map((t) => t.slug)).toEqual([
            "bakery",
            "salon",
            "gym",
            "clinic",
            "store",
            "dietician",
            "blogs",
            "studio",
            "developer",
        ]);
    });

    it("never shows a general template (starter, personal, writing, the first portfolio)", () => {
        const ids = templates.map((t) => t.id);
        for (const id of ["starter", "personal", "writing", "portfolio"]) {
            expect(ids).not.toContain(id);
        }
    });

    it("takes exactly the registry's templates that carry gallery metadata", () => {
        expect(templates.map((t) => t.id).sort()).toEqual(
            listTemplates()
                .filter(isGalleryTemplate)
                .map((t) => t.id)
                .sort(),
        );
    });

    it("every slug is a real template's, so 'Save' names one that exists", () => {
        for (const t of templates) {
            const manifest = getTemplate(t.id);
            expect(manifest).toBeDefined();
            expect(manifest?.slug ?? manifest?.id).toBe(t.slug);
            expect(galleryTemplate(t.slug)).toBe(t);
        }
        expect(galleryTemplate("no-such-template")).toBeUndefined();
        expect(galleryTemplate("starter")).toBeUndefined();
    });

    it("uses the gallery's names: Ceramics is Store and Studio is Portfolio", () => {
        expect(galleryTemplate("store")?.name).toBe("Store");
        expect(galleryTemplate("studio")?.name).toBe("Portfolio");
        expect(templates.filter((t) => t.name === "Portfolio")).toHaveLength(1);
    });
});

describe("kinds and chips", () => {
    it("speaks the waitlist's taxonomy (one vocabulary)", () => {
        expect([...TEMPLATE_KINDS]).toEqual(WAITLIST_KINDS.map((k) => k.id));
        for (const k of GALLERY_KINDS) {
            expect(WAITLIST_KINDS.map((w) => w.id)).toContain(k.id);
        }
    });

    it("draws a chip only for a kind with a template", () => {
        const chips = galleryChips(templates).map((c) => c.label);
        expect(chips).toEqual([
            "Salons",
            "Gyms & studios",
            "Clinics",
            "Dieticians & coaches",
            "Bakeries & food",
            "Shops",
            "Creators",
        ]);
        expect(galleryChips(templates.filter((t) => t.slug === "gym"))).toEqual(
            [{ id: "gym", label: "Gyms & studios" }],
        );
    });

    it("gives every card a kind line", () => {
        for (const t of templates) expect(t.kindLabel).not.toBe("");
        expect(galleryTemplate("dietician")?.kinds).toEqual([
            "coach",
            "clinic",
        ]);
    });
});

describe("what the pages say", () => {
    it("derives the count, and claims only blocks the templates lay down", () => {
        expect(templatesPage.intro(templates)).toBe(
            "Nine templates, each made for a kind of business, each with its own type and colours. Bookings, products and memberships are already wired in.",
        );
        const blogs = templates.filter((t) => t.slug === "blogs");
        expect(templatesPage.intro(blogs)).toBe(
            "One template, with its own type and colours.",
        );
        expect(
            templatesPage.intro(templates.filter((t) => t.slug === "bakery")),
        ).toContain("Products are already wired in.");
    });

    it("names what each runs on in words, never a module key", () => {
        for (const t of templates) {
            for (const word of t.uses) expect(word).not.toMatch(/^[A-Z_]+$/);
        }
        expect(galleryTemplate("gym")?.uses).toEqual([
            "Bookings",
            "Payments",
            "Class packs",
        ]);
        expect(galleryTemplate("blogs")?.uses).toEqual(["Posts"]);
        expect(Object.keys(USES_WORDS)).not.toContain("WEBSITE");
    });

    it("lists a template's pages and colourways from its manifest", () => {
        const gym = must("gym");
        expect(gym.pages.map((p) => p.title)).toEqual([
            "Home",
            "Timetable",
            "Membership",
            "Trainers",
        ]);
        expect(templateDetail.notes.pages(gym).title).toBe("Four pages");
        expect(gym.colourways).toEqual(["Acid", "Ice"]);
        expect(templateDetail.notes.look(gym).body).toBe(
            "Set in Archivo Narrow and Archivo, in two colourways: Acid and Ice. Nothing in it is Saroh's.",
        );
        expect(templateDetail.notes.pages(must("bakery")).title).toBe(
            "One page",
        );
    });

    it("draws every template in its design's colours and its own type", () => {
        for (const t of templates) {
            expect(t.colours.paper).toMatch(/^#[0-9A-F]{6}$/i);
            expect(t.fonts.heading).not.toBe("inherit");
            expect(t.sample.host).toMatch(/\./);
            expect(t.pages[0]?.sections.length).toBeGreaterThan(0);
        }
        // Gym's near-black and acid, as designed.
        expect(galleryTemplate("gym")?.colours).toMatchObject({
            paper: "#0B0B0A",
            accent: "#D7FF3E",
        });
    });

    it("has no plan, price or limit anywhere (public repo; the Plan fact is cut)", () => {
        expect(Object.values(templateDetail.facts)).toEqual([
            "Pages",
            "Uses",
            "Type",
            "Colours",
        ]);
        const words = JSON.stringify([
            templates.map(({ pages: _pages, ...t }) => t),
            templatesPage.intro(templates),
            templatesPage.band,
            templatesPage.seo,
            templates.map((t) => [
                templateDetail.notes.pages(t),
                templateDetail.notes.uses(t),
                templateDetail.notes.look(t),
                templateDetail.band.before(t.name),
                templateDetail.saveNote.before(t.name),
            ]),
        ]);
        expect(words).not.toMatch(/₹|Rs\.?\s?\d|\bINR\b|per month|\/mo\b/i);
        expect(words).not.toMatch(/\b(Free|Grow|Pro) plan\b/);
        expect(words).not.toMatch(/"Plan"/);
    });
});

describe("related templates", () => {
    it("are others sharing a kind, then a shape, at most three", () => {
        for (const t of templates) {
            const related = relatedTemplates(t, templates);
            expect(related.length).toBeLessThanOrEqual(3);
            expect(related.map((r) => r.slug)).not.toContain(t.slug);
        }
        expect(
            relatedTemplates(must("dietician"), templates).map((r) => r.slug),
        ).toEqual(["clinic", "blogs", "salon"]);
        // The clinic's own kind first (the dietician), then other services.
        expect(
            relatedTemplates(must("clinic"), templates).map((r) => r.slug),
        ).toEqual(["dietician", "salon", "gym"]);
    });
});

describe("words", () => {
    it("counts and lists", () => {
        expect(countWord(7)).toBe("Seven");
        expect(countWord(13)).toBe("13");
        expect(listWords(["A"])).toBe("A");
        expect(listWords(["A", "B", "C"])).toBe("A, B and C");
    });
});
