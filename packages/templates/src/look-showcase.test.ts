import { LOOK_IDS } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { GALLERY_PATCHES, withGallerySamples } from "./gallery-patches";
import { GALLERY_SAMPLES } from "./gallery-samples";
import { instantiateTemplate } from "./instantiate";
import {
    LOOK_SHOWCASE_TEMPLATE,
    lookShowcaseTemplate,
    starterCopyPlan,
    withLookShowcase,
} from "./look-showcase";
import type { TemplateContext, TemplateManifest } from "./manifest";
import { listTemplates } from "./registry";
import { gallerySampleIn } from "./sample-words";
import { SALON_GALLERY_SAMPLE } from "./templates/salon";

/** Every string inside a value, however deep. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** A business with everything the template uses switched on. */
function business(t: TemplateManifest): TemplateContext {
    return {
        organizationName: "Asha's Corner",
        modules: ["WEBSITE", ...(t.uses ?? [])],
        tagline: "A line the owner wrote",
        contactEmail: "owner@example.com",
        serviceIds: ["svc-1", "svc-2"],
    };
}

describe("LOOK_SHOWCASE_TEMPLATE (DEC-182)", () => {
    it("gives every look and Classic a template with gallery samples", () => {
        for (const look of [...LOOK_IDS, "classic" as const]) {
            const id = LOOK_SHOWCASE_TEMPLATE[look];
            expect(id, look).toBeTruthy();
            expect(Object.hasOwn(GALLERY_SAMPLES, id), `${look}: ${id}`).toBe(
                true,
            );
            expect(
                (GALLERY_PATCHES[id] ?? []).length,
                `${look}: ${id}`,
            ).toBeGreaterThan(0);
            expect(
                lookShowcaseTemplate(look === "classic" ? null : look).id,
            ).toBe(id);
        }
    });

    it("is the owner's mapping: Quiet Salon, Live Gym, Folio Studio, Classic Bakery", () => {
        expect(LOOK_SHOWCASE_TEMPLATE).toEqual({
            quiet: "salon",
            live: "gym",
            folio: "studio",
            classic: "bakery",
        });
    });
});

describe("the starter content copy path (DEC-182)", () => {
    it.each(Object.entries(LOOK_SHOWCASE_TEMPLATE))(
        "lays %s's showcase sample words on the copied pages, and the check finds them",
        (_look, id) => {
            const template = lookShowcaseTemplate(
                _look === "classic" ? null : (_look as never),
            );
            expect(template.id).toBe(id);
            const built = instantiateTemplate(template, business(template));
            const copied = withGallerySamples(id, built);

            // Some sample words are on the copy that the made site lacks.
            const made = new Set(
                built.pages.flatMap((p) =>
                    p.sections.flatMap((s) => strings(s.content)),
                ),
            );
            const added = copied.pages.flatMap((p) =>
                p.sections.flatMap((s) =>
                    strings(s.content).filter((t) => !made.has(t)),
                ),
            );
            expect(added.length).toBeGreaterThan(0);

            // The pre-publish check's matcher names a block on the copy…
            const named = copied.pages.flatMap((p) =>
                p.sections.flatMap((s) => {
                    const found = gallerySampleIn(strings(s.content));
                    return found ? [found] : [];
                }),
            );
            expect(named.length).toBeGreaterThan(0);
            expect(named.every((f) => f.templateId === id)).toBe(true);
            // …and none on the site as made.
            for (const p of built.pages) {
                for (const s of p.sections) {
                    expect(
                        gallerySampleIn(strings(s.content)),
                        `${id}${p.path} ${s.type}`,
                    ).toBeNull();
                }
            }
        },
    );

    it("leaves the given pages untouched", () => {
        const template = lookShowcaseTemplate("quiet");
        const built = instantiateTemplate(template, business(template));
        const before = JSON.stringify(built);
        withGallerySamples(template.id, built);
        expect(JSON.stringify(built)).toBe(before);
    });

    it("puts the Salon's stylists on its home page", () => {
        const template = lookShowcaseTemplate("quiet");
        const copied = withGallerySamples(
            template.id,
            instantiateTemplate(template, business(template)),
        );
        const home = copied.pages.find((p) => p.isHome);
        const text = strings(home?.sections.map((s) => s.content));
        for (const stylist of SALON_GALLERY_SAMPLE.stylists) {
            expect(text).toContain(stylist.name);
        }
    });
});

describe("gallerySampleIn", () => {
    it("names a long sample piece on its own, inside markup", () => {
        expect(
            gallerySampleIn([
                `<h2>Before you come</h2><p>${SALON_GALLERY_SAMPLE.before[1]}</p>`,
            ]),
        ).toEqual({
            words: SALON_GALLERY_SAMPLE.before[1],
            templateId: "salon",
        });
    });

    it("names short pieces only two at a time", () => {
        expect(gallerySampleIn(["Meher"])).toBeNull();
        expect(gallerySampleIn(["Meher", "Rohit"])).toEqual({
            words: "Meher",
            templateId: "salon",
        });
    });

    it("never matches inside an owner's own sentence", () => {
        expect(
            gallerySampleIn([
                `Our team: ${SALON_GALLERY_SAMPLE.before[2]} Call us first.`,
            ]),
        ).toBeNull();
    });

    it("finds nothing on any gallery template's site as made", () => {
        const gallery = listTemplates().filter(
            (t) => (t.kinds?.length ?? 0) > 0 && t.sample !== undefined,
        );
        for (const t of gallery) {
            for (const ctx of [business(t), { organizationName: "Asha's" }]) {
                for (const p of instantiateTemplate(t, ctx).pages) {
                    for (const s of p.sections) {
                        expect(
                            gallerySampleIn(strings(s.content)),
                            `${t.id}${p.path} ${s.type}`,
                        ).toBeNull();
                    }
                }
            }
        }
    });
});

describe("starterCopyPlan", () => {
    const site = [
        { id: "home", path: "/", title: "Welcome", isHome: true },
        { id: "about", path: "/about", title: "About us", isHome: false },
        {
            id: "train",
            path: "/trainers",
            title: "Our coaches",
            isHome: false,
            kind: "FREE",
        },
        {
            id: "prices",
            path: "/membership",
            title: "Prices",
            isHome: false,
            kind: "PRICES",
        },
    ];

    it("replaces home by role and a free page by address, makes the rest, skips a module page", () => {
        const plan = starterCopyPlan(
            [
                { path: "/", title: "Home", isHome: true },
                { path: "/timetable", title: "Timetable", isHome: false },
                { path: "/membership", title: "Membership", isHome: false },
                { path: "/trainers", title: "Trainers", isHome: false },
            ],
            site,
        );
        expect(plan.replace).toEqual([
            { pageId: "home", title: "Welcome", from: "/" },
            { pageId: "train", title: "Our coaches", from: "/trainers" },
        ]);
        expect(plan.create).toEqual([
            { path: "/timetable", title: "Timetable" },
        ]);
        expect(plan.skipped).toEqual([
            { path: "/membership", title: "Membership" },
        ]);
    });

    it("never touches a page the template doesn't have", () => {
        const plan = starterCopyPlan(
            [{ path: "/", title: "Home", isHome: true }],
            site,
        );
        expect(plan.replace.map((r) => r.pageId)).toEqual(["home"]);
    });
});

describe("withLookShowcase (DEC-172 amendment, 22 Oct)", () => {
    const gym = lookShowcaseTemplate("live");
    const made = instantiateTemplate(gym, {
        organizationName: "Iron & Oak",
        modules: ["WEBSITE", ...(gym.uses ?? [])],
    });

    it("gives Live's showcase home a visible hero, in sample words the check lists", () => {
        const home = withLookShowcase("live", made).pages.find((p) => p.isHome);
        const hero = home?.sections.find((s) => s.type === "hero");
        const content = hero?.content as Record<string, unknown>;
        expect(content.variant).toBeUndefined();
        expect(content.titleVisible).toBeUndefined();
        expect(gallerySampleIn([String(content.heading)])).not.toBeNull();
    });

    it("leaves every other look's pages as they are", () => {
        expect(withLookShowcase("quiet", made)).toBe(made);
        expect(withLookShowcase(null, made)).toBe(made);
    });
});
