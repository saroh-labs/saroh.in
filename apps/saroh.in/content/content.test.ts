import { describe, expect, it } from "vitest";

import { faqs, HOME_FAQ, solutionFaq } from "./faq";
import { features } from "./features";
import { CTA_BAND, FREE_PLAN_LINE, home } from "./home";
import { shots } from "./shots";
import { segmentViews, solutions } from "./solutions";
import type { ShotRef } from "./types";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "./types";
import { contentErrors } from "./validate";

/**
 * The Marketing Site V2 content model (plan U18): every page the templates
 * will render has its words, every screenshot it names is in the manifest,
 * and every cross-link lands on a page that exists.
 */
const shotKeys = new Set(Object.keys(shots));
const featureSlugs = new Set<string>(FEATURE_SLUGS);
const solutionSlugs = new Set<string>(SOLUTION_SLUGS);

const real = { features, solutions, shots, faqs };

describe("contentErrors", () => {
    it("finds nothing wrong with the real content", () => {
        expect(contentErrors(real)).toEqual([]);
    });

    it("fails a Works with card that names a missing page", () => {
        const broken = {
            ...features,
            orders: {
                ...features.orders,
                worksWith: ["warehouse" as never, ...features.orders.worksWith],
            },
        };
        expect(contentErrors({ ...real, features: broken })).toEqual([
            "feature orders: works with missing warehouse",
        ]);
    });

    it("fails a Used by chip that names a missing page", () => {
        const broken = {
            ...features,
            billing: { ...features.billing, usedBy: ["salons" as never] },
        };
        expect(contentErrors({ ...real, features: broken })).toEqual([
            "feature billing: used by missing salons",
        ]);
    });

    it("fails a step whose shot is not in the manifest", () => {
        const { "p-editor": _gone, ...fewer } = shots;
        expect(contentErrors({ ...real, shots: fewer })).toEqual([
            "feature products: shot p-editor not in shots.ts",
        ]);
    });

    it("fails a feature with no headline, sub or steps", () => {
        const broken = {
            ...features,
            insights: {
                ...features.insights,
                headline: "",
                sub: " ",
                steps: [],
            },
        };
        expect(contentErrors({ ...real, features: broken })).toEqual([
            "feature insights: no headline",
            "feature insights: no sub",
            "feature insights: no steps",
        ]);
    });
});

describe("feature pages", () => {
    it("has exactly the eight slugs, keyed by their own slug", () => {
        expect(Object.keys(features).sort()).toEqual([...FEATURE_SLUGS].sort());
        for (const [key, f] of Object.entries(features)) {
            expect(f.slug).toBe(key);
        }
    });

    it.each(FEATURE_SLUGS)("%s has a headline, a sub and steps", (slug) => {
        const f = features[slug];
        expect(f.name.trim()).not.toBe("");
        expect(f.headline.trim()).not.toBe("");
        expect(f.sub.trim()).not.toBe("");
        expect(f.howTitle.trim()).not.toBe("");
        expect(f.closer.trim()).not.toBe("");
        expect(f.steps.length).toBeGreaterThan(0);
        expect(f.points.length).toBeGreaterThan(0);
        for (const step of f.steps) {
            expect(step.title.trim()).not.toBe("");
            expect(step.body.trim()).not.toBe("");
            expect(shots[step.shot].alt.trim()).not.toBe("");
        }
    });

    it.each(FEATURE_SLUGS)("%s names only shots in the manifest", (slug) => {
        const f = features[slug];
        for (const ref of [f.hero, ...f.steps]) {
            expect(shotKeys, `${slug}: ${ref.shot}`).toContain(ref.shot);
        }
    });

    it.each(FEATURE_SLUGS)(
        "%s: Works with and Used by point at pages that exist",
        (slug) => {
            const f = features[slug];
            expect(f.worksWith.length).toBeGreaterThan(0);
            for (const other of f.worksWith) {
                expect(featureSlugs, `${slug} works with ${other}`).toContain(
                    other,
                );
                expect(other).not.toBe(slug);
            }
            expect(f.usedBy.length).toBeGreaterThan(0);
            for (const s of f.usedBy) {
                expect(solutionSlugs, `${slug} used by ${s}`).toContain(s);
            }
        },
    );

    it("billing keeps the design's three steps and six points", () => {
        expect(features.billing.headline).toBe(
            "Invoices you don't have to write.",
        );
        expect(features.billing.steps).toHaveLength(3);
        expect(features.billing.points).toHaveLength(6);
    });
});

describe("solution pages", () => {
    it.each(SOLUTION_SLUGS)(
        "%s has a headline, a sub, segments and shots in the manifest",
        (slug) => {
            const s = solutions[slug];
            expect(s.slug).toBe(slug);
            expect(s.headline.trim()).not.toBe("");
            expect(s.sub.trim()).not.toBe("");
            expect(s.heroNote.trim()).not.toBe("");
            expect(s.segments.length).toBeGreaterThan(0);
            for (const ref of [s.hero, ...s.segments]) {
                expect(shotKeys, `${slug}: ${ref.shot}`).toContain(ref.shot);
            }
            for (const seg of s.segments) {
                expect(featureSlugs, `${slug}: ${seg.feature}`).toContain(
                    seg.feature,
                );
            }
            expect(faqs[s.faq], `${slug}: ${s.faq}`).toBeDefined();
        },
    );

    it("gyms has three Bookings segments in a row", () => {
        const areas = solutions.gyms.segments.map((s) => s.feature);
        expect(areas.filter((a) => a === "bookings")).toHaveLength(3);
    });

    it("only the first segment of each area says See {feature}", () => {
        const views = segmentViews(
            solutions.gyms.segments,
            (f) => features[f].name,
        );
        const bookings = views.filter((v) => v.feature === "bookings");
        expect(bookings.map((v) => v.seeLink)).toEqual([true, false, false]);
        expect(bookings.map((v) => v.label)).toEqual([
            "Bookings · Your booking page",
            "Bookings · Your week",
            "Bookings · Class packs and courses",
        ]);
        expect(views[0]).toMatchObject({
            label: "Dashboard",
            featureName: "Dashboard",
            seeLink: true,
        });
        for (const slug of SOLUTION_SLUGS) {
            const linked = segmentViews(
                solutions[slug].segments,
                (f) => features[f].name,
            ).filter((v) => v.seeLink);
            expect(new Set(linked.map((v) => v.feature)).size).toBe(
                linked.length,
            );
        }
    });
});

describe("questions", () => {
    it("Home asks the design's questions, without the Hindi one", () => {
        expect(HOME_FAQ).toHaveLength(5);
        for (const id of HOME_FAQ) expect(faqs[id]).toBeDefined();
    });

    it("no question claims a second language (DEC-075, D13)", () => {
        expect(JSON.stringify(faqs)).not.toMatch(/Hindi|हिंदी/);
        expect(home.chips.join(" ")).not.toMatch(/Hindi|हिंदी/);
    });

    it("a solution page asks Start free first, then its own", () => {
        const ids = solutionFaq(solutions.clinics.faq);
        expect(ids.slice(0, 2)).toEqual([
            "start-free",
            "clinics-medical-notes",
        ]);
    });
});

/**
 * Captions say what the image shows (claims ledger §9): a step, a segment or
 * a hero reads the manifest's alt, never the design's own caption.
 */
describe("captions", () => {
    const refs: ShotRef[] = [
        home.hero,
        ...Object.values(features).flatMap((f) => [f.hero, ...f.steps]),
        ...Object.values(solutions).flatMap((s) => [s.hero, ...s.segments]),
    ];

    it("no page carries its own alt for a shot", () => {
        for (const ref of refs) expect(ref.alt, ref.shot).toBeUndefined();
    });

    it("a caption that names a demo business says it is a demo (D14)", () => {
        for (const [key, shot] of Object.entries(shots)) {
            for (const name of ["Rye & Co.", "Pulse Fitness", "Kavi Dental"]) {
                if (shot.alt.includes(name)) {
                    expect(shot.alt, key).toMatch(
                        new RegExp(`${name.replace(".", "\\.")} \\(demo `),
                    );
                }
            }
        }
    });

    it("every who line and hero note names a demo", () => {
        for (const f of Object.values(features)) {
            for (const step of f.steps) {
                expect(step.who, `${f.slug}: ${step.title}`).toMatch(/\(demo /);
            }
        }
        for (const s of Object.values(solutions)) {
            expect(s.heroNote, s.slug).toMatch(/, a demo /);
        }
    });
});

describe("the shot manifest", () => {
    it("every entry has alt text and a size", () => {
        for (const [key, shot] of Object.entries(shots)) {
            expect(shot.alt.trim(), key).not.toBe("");
            expect(shot.width, key).toBeGreaterThan(0);
            expect(shot.height, key).toBeGreaterThan(0);
        }
    });
});

/**
 * The repo is public: no prices and no plan limits in content (MKT brief).
 * Until Pricing is published, no page names a plan's price, limits or
 * contents (Gate W).
 */
describe("no prices or plan limits", () => {
    const everything = JSON.stringify({
        features,
        solutions,
        faqs,
        FREE_PLAN_LINE,
        home,
        CTA_BAND,
    });

    it("has no rupee sign", () => {
        expect(everything).not.toMatch(/\u20B9|Rs\.?\s?\d|INR/);
    });

    it("puts no number beside a plan name", () => {
        expect(everything).not.toMatch(
            /\b(Free|Grow|Pro)\b[^."]{0,40}\d|\d[^."]{0,20}\b(Free|Grow|Pro)\b/,
        );
    });
});
