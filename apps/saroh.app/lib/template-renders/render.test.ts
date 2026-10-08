import { openState } from "@saroh/site-blocks";
import {
    CLINIC_GALLERY_SAMPLE,
    DEVELOPER_GALLERY_SAMPLE,
    DIETICIAN_GALLERY_SAMPLE,
    GALLERY_SAMPLES,
    instantiateTemplate,
    SALON_GALLERY_SAMPLE,
    templatePlaceholderIn,
} from "@saroh/templates";
import { describe, expect, it } from "vitest";

import { briefImage, wrapBrief } from "./brief-image";
import { FIXTURE_DAY, FIXTURE_NOW, FIXTURE_TIME_ZONE } from "./fixtures";
import {
    drawBriefs,
    galleryTemplates,
    pageFileName,
    sampleContext,
    sampleEmail,
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

    it("is drawn at one fixed weekday morning, open, whatever the clock says", () => {
        const now = new Date(FIXTURE_NOW);
        // A Tuesday, 10:30 in India, on the day Free today is for.
        expect(
            new Intl.DateTimeFormat("en-GB", {
                timeZone: FIXTURE_TIME_ZONE,
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            }).format(now),
        ).toBe("Tue 10:30");
        expect(
            new Intl.DateTimeFormat("en-CA", {
                timeZone: FIXTURE_TIME_ZONE,
            }).format(now),
        ).toBe(FIXTURE_DAY);
        for (const t of galleryTemplates()) {
            const render = templateRender(t.id, undefined, "/");
            expect(render?.fixtures.now).toBe(FIXTURE_NOW);
            const { visit, today } = render?.fixtures ?? {};
            // Every sample with hours is open then, so the open line and
            // Free today never disagree.
            for (const hours of [visit?.hours, today?.hours]) {
                if (!hours) continue;
                expect(
                    openState(hours, now, FIXTURE_TIME_ZONE)?.open,
                    t.id,
                ).toBe(true);
            }
            if (today) expect(today.date, t.id).toBe(FIXTURE_DAY);
            // A timetable's seven days start today, as the live read's do.
            const timetable = render?.fixtures.timetable;
            if (timetable) expect(timetable.days[0], t.id).toBe(FIXTURE_DAY);
        }
    });

    it("gives every sample an email named for it at example.com", () => {
        for (const t of galleryTemplates()) {
            expect(sampleContext(t).contactEmail, t.id).toMatch(
                /^[a-z0-9-]+@example\.com$/,
            );
        }
        expect(sampleEmail("kesarsalon.saroh.app")).toBe(
            "kesarsalon@example.com",
        );
    });
});

/**
 * The words a visitor reads in a render: every section's text and the
 * footer's line, an HTML value read as its runs of text between tags, each
 * line its own. Photo briefs, image addresses, links and ids are not read.
 */
const NOT_READ = new Set([
    "imageBrief",
    "image",
    "images",
    "src",
    "alt",
    "href",
    "link",
    "anchor",
    "variant",
    "serviceIds",
]);

function visitorRuns(value: unknown, key = ""): string[] {
    if (NOT_READ.has(key)) return [];
    if (typeof value === "string") {
        return value
            .split(/<[^>]*>|\n/)
            .map((r) => r.trim())
            .filter(Boolean);
    }
    if (Array.isArray(value)) return value.flatMap((v) => visitorRuns(v, key));
    if (typeof value === "object" && value !== null) {
        // An enquiry field's `name` is its key, not words; a person's is.
        const field = "type" in value && "label" in value;
        return Object.entries(value).flatMap(([k, v]) =>
            field && k === "name" ? [] : visitorRuns(v, k),
        );
    }
    return [];
}

/**
 * Stricter than the pre-publish check, for the gallery only: anything that
 * still speaks to the owner ("Your role", "What you made · the year",
 * "Year") — a render shows a business, not a form to fill in. The few
 * lines below speak to the visitor, as any site's would.
 */
const OWNER_WORDS = [
    /^your\b/i,
    /^what (you|they) (made|coach)\b/i,
    /^years?$/i,
    /^the stack\b/i,
    /^replace\b/i,
];
const VISITOR_LINES = new Set([
    "Your name",
    "Your first visit",
    "Say what you are building and when you need it.",
]);

describe("the gallery's sample business (KTD-6)", () => {
    it.each(cases)(
        "%s/%s %s has no placeholder words left",
        (id, style, path) => {
            const render = templateRender(id, style, path);
            const runs = [
                ...(render?.sections ?? []).flatMap((s) =>
                    visitorRuns(s.content),
                ),
                ...visitorRuns(render?.footer?.value ?? ""),
            ];
            expect(runs.length).toBeGreaterThan(0);
            for (const run of runs) {
                if (VISITOR_LINES.has(run)) continue;
                // The pre-publish check's own matcher (`@saroh/templates`).
                expect(templatePlaceholderIn(run), `${id} ${path}`).toBeNull();
                for (const re of OWNER_WORDS) {
                    expect(run, `${id} ${path}`).not.toMatch(re);
                }
            }
        },
    );

    it("would catch the placeholders a merchant's site starts with", () => {
        // The same scan over the template as a merchant gets it finds them,
        // so the test above is not passing on a scan that reads nothing.
        for (const t of galleryTemplates()) {
            const built = instantiateTemplate(t, sampleContext(t));
            const runs = [
                ...built.pages.flatMap((p) =>
                    p.sections.flatMap((s) => visitorRuns(s.content)),
                ),
                ...visitorRuns(t.footer?.line ?? ""),
            ].filter((r) => !VISITOR_LINES.has(r));
            const found = runs.filter(
                (r) =>
                    templatePlaceholderIn(r) !== null ||
                    OWNER_WORDS.some((re) => re.test(r)),
            );
            expect(found.length, t.id).toBeGreaterThan(0);
        }
    });

    it("ends every page on the sample's footer line, never the owner's", () => {
        for (const t of index) {
            for (const p of t.pages) {
                const footer = templateRender(t.id, undefined, p.path)?.footer;
                expect(footer?.value, `${t.id} ${p.path}`).toBe(
                    GALLERY_SAMPLES[t.id].footer,
                );
            }
        }
    });

    it("lists the developer's five engagements, year, role and stack each", () => {
        const render = templateRender("developer", undefined, "/");
        const work = render?.sections.find((s) => s.type === "projects")
            ?.content as { items: Record<string, unknown>[] };
        expect(work.items).toEqual(
            DEVELOPER_GALLERY_SAMPLE.work.map((w) => ({ ...w })),
        );
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

    it("shapes a full-bleed hero's brief as the band, its words high up", () => {
        const out = drawBriefs(
            { variant: "fullBleed", imageBrief: "Loaves cooling" },
            colours,
            "hero",
        ) as { image: { src: string; width: number; height: number } };
        // The band's shape on a computer, so nothing is cropped off its top
        // and the brief sits below the header drawn over it.
        expect([out.image.width, out.image.height]).toEqual([1600, 840]);
        const svg = decodeURIComponent(out.image.src.split(",")[1] ?? "");
        const label = /<text x="\d+" y="(\d+)"[^>]*>PHOTOGRAPH/.exec(svg);
        expect(Number(label?.[1])).toBeGreaterThan(840 * 0.12);
        expect(Number(label?.[1])).toBeLessThan(840 * 0.25);
    });

    it("keeps a plate's brief above the name set over its foot", () => {
        const render = templateRender("ceramics", undefined, "/");
        const grid = render?.productGrids.find(Boolean);
        const url = grid?.products[0]?.image?.url ?? "";
        const svg = decodeURIComponent(url.split(",")[1] ?? "");
        const lines = (svg.match(/<text x="\d+" y="\d+"/g) ?? []).map((m) =>
            Number(/y="(\d+)"/.exec(m)?.[1]),
        );
        expect(lines.length).toBeGreaterThan(1);
        // Every line in the top half of the square.
        expect(Math.max(...lines)).toBeLessThan(500);
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
