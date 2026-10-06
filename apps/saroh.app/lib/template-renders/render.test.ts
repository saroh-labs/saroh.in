import {
    CLINIC_GALLERY_SAMPLE,
    DIETICIAN_GALLERY_SAMPLE,
    SALON_GALLERY_SAMPLE,
} from "@saroh/templates";
import { describe, expect, it } from "vitest";

import { briefImage, wrapBrief } from "./brief-image";
import {
    drawBriefs,
    galleryTemplates,
    pageFileName,
    sampleContext,
    templateRender,
    templateRenderIndex,
} from "./render";

/**
 * The template renders (U14): every gallery template, page and colourway
 * builds; every bound block on them has its data from the sample business,
 * so nothing is read from the API; every photograph is drawn as its brief.
 */

const index = templateRenderIndex();
const cases = index.flatMap((t) =>
    (t.styles.length > 0 ? t.styles.map((s) => s.id) : [undefined]).flatMap(
        (style) => t.pages.map((p) => [t.id, style, p.path] as const),
    ),
);

/** Which feed or fixture each bound block draws from. */
function dataFor(
    render: NonNullable<ReturnType<typeof templateRender>>,
    type: string,
    i: number,
): unknown {
    switch (type) {
        case "productGrid":
            return render.productGrids[i]?.products.length;
        case "journal":
            return render.journal?.posts.length;
        case "plans":
            return render.plans?.plans.length;
        case "packs":
            return render.packs?.packs.length;
        case "servicesList":
            return render.fixtures.services?.length;
        case "visitUs":
        case "hours":
            return render.fixtures.visit?.hours?.length;
        case "timetable":
            return render.fixtures.timetable?.sessions.length;
        case "hero": {
            // On today beside the headline reads today's free times; the
            // full-bleed hero's open line reads the place.
            const hero = render.sections[i]?.content as {
                onToday?: boolean;
                variant?: string;
            };
            if (!hero.onToday) return "static";
            return hero.variant === "fullBleed"
                ? render.fixtures.visit?.hours?.length
                : render.fixtures.today?.items.length;
        }
        default:
            return "static";
    }
}

describe("templateRenderIndex", () => {
    it("lists the gallery's templates, each with its pages and colourways", () => {
        expect(index.map((t) => t.id)).toEqual(
            galleryTemplates().map((t) => t.id),
        );
        expect(index.length).toBeGreaterThan(0);
        for (const t of index) {
            expect(t.pages[0]?.path).toBe("/");
            expect(t.pages[0]?.file).toBe("home");
            expect(t.styles.length).toBeGreaterThan(0);
        }
    });

    it("is the same on every call", () => {
        expect(templateRenderIndex()).toEqual(index);
    });
});

describe("templateRender", () => {
    it.each(cases)(
        "%s/%s %s draws every bound block from fixtures",
        (id, style, path) => {
            const render = templateRender(id, style, path);
            expect(render).not.toBeNull();
            if (!render) return;
            expect(render.sections.length).toBeGreaterThan(0);
            expect(render.styleVariables["--site-bg"]).toBeTruthy();
            render.sections.forEach((s, i) => {
                const data = dataFor(render, s.type, i);
                expect(
                    data,
                    `${id} ${path}: ${s.type} has no fixture`,
                ).toBeTruthy();
            });
            // No slot is left a bare brief: each is drawn as one.
            const json = JSON.stringify(render.sections);
            for (const s of render.sections) {
                const c = s.content as { imageBrief?: string; image?: unknown };
                if (c.imageBrief && s.type !== "gallery") {
                    expect(c.image).toBeTruthy();
                }
            }
            expect(json).not.toMatch(/https?:\/\/(?!schema)/);
        },
    );

    it("draws the colourway asked for, the first by default", () => {
        const many = index.find((t) => t.styles.length > 1);
        if (!many) throw new Error("no template with two colourways");
        const first = many.styles.at(0);
        const second = many.styles.at(1);
        if (!first || !second) throw new Error("no colourways");
        expect(templateRender(many.id, undefined, "/")?.styleId).toBe(first.id);
        expect(templateRender(many.id, second.id, "/")?.styleId).toBe(
            second.id,
        );
        expect(
            templateRender(many.id, second.id, "/")?.styleVariables,
        ).not.toEqual(templateRender(many.id, first.id, "/")?.styleVariables);
    });

    it("is null for what it cannot draw", () => {
        expect(templateRender("no-such-template", undefined, "/")).toBeNull();
        // The starter is not a gallery template.
        expect(templateRender("starter", undefined, "/")).toBeNull();
        expect(templateRender("bakery", "no-such-colourway", "/")).toBeNull();
        expect(templateRender("bakery", undefined, "/no-such-page")).toBeNull();
    });

    it("fills the dietician's practitioner from the template's gallery sample", () => {
        const render = templateRender("dietician", undefined, "/");
        const person = render?.sections.find((s) => s.type === "person")
            ?.content as { credentials?: string[]; bio?: string };
        expect(person.credentials).toEqual([
            ...DIETICIAN_GALLERY_SAMPLE.credentials,
        ]);
        expect(person.bio).toBe(DIETICIAN_GALLERY_SAMPLE.bio);
        // Its consultation is the sample business's own service, listed.
        expect(render?.sections.some((s) => s.type === "servicesList")).toBe(
            true,
        );
    });

    it.each([
        ["salon", SALON_GALLERY_SAMPLE.stylists],
        ["clinic", CLINIC_GALLERY_SAMPLE.doctors],
    ] as const)(
        "fills the %s's people from its gallery sample, briefs kept",
        (id, sample) => {
            const render = templateRender(id, undefined, "/");
            const person = render?.sections.find((s) => s.type === "person")
                ?.content as {
                name: string;
                image?: unknown;
                people: { name: string; image?: unknown }[];
            };
            expect([person.name, ...person.people.map((p) => p.name)]).toEqual(
                sample.map((p) => p.name),
            );
            expect(person.image).toBeTruthy();
            for (const p of person.people) expect(p.image).toBeTruthy();
            // Free today names the same people the section does.
            for (const item of render?.fixtures.today?.items ?? []) {
                expect(sample.map((p) => p.name)).toContain(item.staffName);
            }
        },
    );

    it("never gives a sample an email off its own saroh.app address", () => {
        for (const t of galleryTemplates()) {
            const email = sampleContext(t).contactEmail;
            if (email) expect(email).toMatch(/@[a-z0-9-]+\.saroh\.app$/);
        }
    });
});

describe("drawBriefs", () => {
    const colours = { ground: "hsl(0, 0%, 90%)", ink: "hsl(0, 0%, 30%)" };

    it("draws a slot's brief as its image, nested slots too", () => {
        const out = drawBriefs(
            {
                imageBrief: "A loaf",
                items: [{ title: "A", imageBrief: "A mug" }, { title: "B" }],
            },
            colours,
            "projects",
        ) as {
            image: { src: string; alt: string };
            items: { image?: { alt: string } }[];
        };
        expect(out.image.src).toMatch(/^data:image\/svg\+xml/);
        expect(out.image.alt).toBe("A loaf");
        expect(out.items[0]?.image?.alt).toBe("A mug");
        expect(out.items[1]?.image).toBeUndefined();
    });

    it("leaves a real photo alone, and fills an empty gallery", () => {
        const photo = { src: "/p.jpg", alt: "p" };
        expect(
            (
                drawBriefs(
                    { imageBrief: "x", image: photo },
                    colours,
                    "hero",
                ) as {
                    image: unknown;
                }
            ).image,
        ).toEqual(photo);
        expect(
            (
                drawBriefs(
                    { imageBrief: "x", images: [] },
                    colours,
                    "gallery",
                ) as {
                    images: unknown[];
                }
            ).images,
        ).toHaveLength(1);
    });
});

describe("briefImage", () => {
    it("says the brief, escaped, and nothing is fetched", () => {
        const svg = decodeURIComponent(
            briefImage("Bread & <butter>", {
                ground: "#fff",
                ink: "#000",
            }).split(",")[1] ?? "",
        );
        expect(svg).toContain("Bread &amp; &lt;butter&gt;");
        expect(svg).not.toMatch(/href=/);
    });

    it("wraps at spaces", () => {
        expect(wrapBrief("one two three four", 9)).toEqual([
            "one two",
            "three",
            "four",
        ]);
    });
});

describe("pageFileName", () => {
    it("names a page for its file", () => {
        expect(pageFileName("/")).toBe("home");
        expect(pageFileName("/timetable")).toBe("timetable");
        expect(pageFileName("/a/b/")).toBe("a-b");
    });
});
