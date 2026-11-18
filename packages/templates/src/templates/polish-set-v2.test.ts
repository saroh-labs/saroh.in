import {
    contrastRatio,
    inPageNavigation,
    parsePalette,
} from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext, TemplateManifest } from "../manifest";
import { templateStylePreset } from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import { bakeryTemplateV1 } from "./bakery";
import {
    BAKERY_ORDER_PATH,
    BAKERY_PICKUP_WORDS,
    bakeryTemplate,
} from "./bakery-v2";
import { blogsTemplateV1 } from "./blogs";
import { blogsTemplate } from "./blogs-v2";
import { ceramicsTemplateV1 } from "./ceramics";
import { ceramicsTemplate } from "./ceramics-v2";
import { pranaShowcase } from "./prana";
import { studioTemplateV1 } from "./studio";
import { STUDIO_PROJECT_PATH, studioTemplate } from "./studio-v2";

/**
 * The polish set redesigned to its boards (site templates plan U9, KD10):
 * bakery, ceramics ("Store"), studio and blogs as a version 2 each, for
 * new sites only, and the Prana showcase's Classic.
 */

const SET: [TemplateManifest, TemplateManifest][] = [
    [bakeryTemplateV1, bakeryTemplate],
    [ceramicsTemplateV1, ceramicsTemplate],
    [studioTemplateV1, studioTemplate],
    [blogsTemplateV1, blogsTemplate],
];

/** A business with everything the template uses switched on. */
function full(t: TemplateManifest): TemplateContext {
    return {
        organizationName: "Asha's Corner",
        modules: ["WEBSITE", ...(t.uses ?? [])],
        contactEmail: "owner@example.com",
    };
}

function home(t: TemplateManifest, ctx: TemplateContext) {
    const page = instantiateTemplate(t, ctx).pages.find((p) => p.isHome);
    if (!page) throw new Error(`${t.id} has no home`);
    return page;
}

/** The hero's content, the first section of the page. */
function hero(t: TemplateManifest, ctx: TemplateContext) {
    const first = home(t, ctx).sections[0];
    expect(first.type).toBe("hero");
    return first.content as Record<string, unknown>;
}

/** The hero's buttons that ask for something (not a quiet link). */
function mainActions(content: Record<string, unknown>) {
    const cta = content.cta as { label: string; style?: string } | undefined;
    return cta && cta.style !== "link" ? [cta] : [];
}

describe.each(SET)("$id@2 (U9)", (v1, v2) => {
    it("is what a new site starts from; version 1 stays for the sites made from it", () => {
        expect(v2.id).toBe(v1.id);
        expect(v1.version).toBe(1);
        expect(v2.version).toBe(2);
        expect(getTemplate(v1.id)).toBe(v2);
        expect(getTemplate(v1.id, 1)).toBe(v1);
        expect(listTemplates()).toContain(v2);
        expect(listTemplates()).not.toContain(v1);
    });

    it("keeps its sample business, name and gallery facts", () => {
        for (const key of ["name", "slug", "kinds", "shape", "sample"]) {
            expect(v2[key as keyof TemplateManifest]).toEqual(
                v1[key as keyof TemplateManifest],
            );
        }
    });

    it("instantiates for a full business and a bare name", () => {
        for (const ctx of [full(v2), { organizationName: "Crumb <&> Co" }]) {
            expect(() => instantiateTemplate(v2, ctx)).not.toThrow();
        }
    });

    it("draws every colourway at 4.5:1 body text", () => {
        expect(v2.styles?.length).toBeGreaterThanOrEqual(2);
        for (const preset of v2.styles ?? []) {
            const palette = preset.style.palette;
            expect(parsePalette(palette), preset.id).toMatchObject({
                ok: true,
            });
            if (!palette) throw new Error(preset.id);
            for (const text of [palette.body, palette.muted]) {
                expect(
                    contrastRatio(text ?? palette.fg, palette.bg),
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("has at most one main action in its first screen", () => {
        expect(mainActions(hero(v2, full(v2))).length).toBeLessThanOrEqual(1);
    });

    it("never says Made to measure in Rohtak, nor a real-looking phone or address", () => {
        const text = JSON.stringify(instantiateTemplate(v2, full(v2)));
        expect(text).not.toMatch(/Rohtak/);
        expect(text).not.toMatch(/\+91 ?[1-9]/);
    });
});

describe("bakery@2: pickup first", () => {
    it("answers when to order and where to collect in the first screen, with one Order action", () => {
        const content = hero(bakeryTemplate, full(bakeryTemplate));
        expect(content).toMatchObject({
            variant: "answer",
            panel: { kind: "pickup", ...BAKERY_PICKUP_WORDS },
            answerRow: true,
        });
        expect(content).not.toHaveProperty("imageBrief");
        // The header's action on a selling site is "Order" (site-blocks
        // `sitePrimaryAction`); the hero's one button says the same.
        expect(mainActions(content)).toEqual([
            expect.objectContaining({
                label: "Order for pickup",
                href: BAKERY_ORDER_PATH,
                phoneLabel: "Order",
            }),
        ]);
    });

    it("without Products: the pickup answer and the answer row, no order button or page", () => {
        const ctx = { organizationName: "Rye & Co.", modules: ["WEBSITE"] };
        expect(mainActions(hero(bakeryTemplate, ctx))).toEqual([]);
        expect(
            instantiateTemplate(bakeryTemplate, ctx).pages.map((p) => p.path),
        ).toEqual(["/"]);
    });

    it("reads in the board's order, the bread with a stepper", () => {
        const page = home(bakeryTemplate, full(bakeryTemplate));
        expect(page.sections.map((s) => s.type)).toEqual([
            "hero",
            "productGrid",
            "hours",
            "richText",
            "journal",
        ]);
        expect(page.sections[1].content).toMatchObject({
            anchor: "today",
            addInPlace: true,
        });
        expect(inPageNavigation(page.sections).map((i) => i.label)).toEqual([
            "Today's bread",
            "Visit",
            "Journal",
        ]);
    });

    it("lays down /order: the bread as a list with steppers, then the pickup facts on a band", () => {
        const order = instantiateTemplate(
            bakeryTemplate,
            full(bakeryTemplate),
        ).pages.find((p) => p.path === BAKERY_ORDER_PATH);
        expect(order?.sections.map((s) => s.type)).toEqual([
            "hero",
            "productGrid",
            "features",
        ]);
        expect(order?.sections[1].content).toMatchObject({
            layout: "list",
            addInPlace: true,
        });
        expect(order?.sections[2].content).toMatchObject({ variant: "band" });
    });

    it("Cardamom replaces Porcelain for new sites; Porcelain stays on version 1", () => {
        expect(bakeryTemplate.styles?.map((s) => s.id)).toEqual([
            "crust",
            "cardamom",
        ]);
        expect(templateStylePreset(bakeryTemplate, "porcelain")).toBeNull();
        expect(templateStylePreset(bakeryTemplateV1, "porcelain")?.id).toBe(
            "porcelain",
        );
        // Crust is unchanged.
        expect(bakeryTemplate.styles?.[0]).toBe(bakeryTemplateV1.styles?.[0]);
    });
});

describe("ceramics@2: the maker first", () => {
    it("names who makes the work in the first screen, with one Shop action", () => {
        const content = hero(ceramicsTemplate, full(ceramicsTemplate));
        expect(content).toMatchObject({
            variant: "split",
            byline: { name: "Your name" },
        });
        expect(mainActions(content)).toEqual([
            expect.objectContaining({ label: "Shop the collection" }),
        ]);
    });

    it("says how pieces are sent, packed and returned, and drops the orphaned photos", () => {
        const page = home(ceramicsTemplate, full(ceramicsTemplate));
        expect(page.sections.map((s) => s.type)).toEqual([
            "hero",
            "productGrid",
            "features",
            "features",
            "richText",
        ]);
        expect(page.sections[3].content).toMatchObject({
            anchor: "delivery",
            variant: "band",
        });
        const titles = (
            page.sections[3].content as { items: { title: string }[] }
        ).items.map((i) => i.title);
        expect(titles).toEqual([
            "Packed for the courier",
            "If it arrives broken",
            "Returns",
            "Care",
        ]);
        expect(page.sections[4].content).toMatchObject({ anchor: "studio" });
    });
});

describe("studio@2: what it does, and for whom", () => {
    it("opens on the studio's line with one Start a project action", () => {
        const content = hero(studioTemplate, full(studioTemplate));
        expect(content).toMatchObject({ variant: "centered" });
        expect(mainActions(content)).toEqual([
            expect.objectContaining({
                label: "Start a project",
                href: "/#contact",
            }),
        ]);
    });

    it("fills the rhythm with five projects, words under each photo, the lead opening its page", () => {
        const page = home(studioTemplate, full(studioTemplate));
        const work = page.sections[1].content as {
            items: { link?: string }[];
            captionPlacement: string;
        };
        expect(work.items).toHaveLength(5);
        expect(work.captionPlacement).toBe("below");
        expect(work.items[0].link).toBe(STUDIO_PROJECT_PATH);
        const project = instantiateTemplate(
            studioTemplate,
            full(studioTemplate),
        ).pages.find((p) => p.path === STUDIO_PROJECT_PATH);
        expect(project?.sections.map((s) => s.type)).toEqual([
            "hero",
            "richText",
            "richText",
            "cta",
        ]);
    });
});

describe("blogs@2: one list, colourways that differ", () => {
    it("lists every piece once: the lead, then Earlier writing by year", () => {
        const page = home(blogsTemplate, full(blogsTemplate));
        const journals = page.sections
            .filter((s) => s.type === "journal")
            .map((s) => (s.content as { variant: string }).variant);
        expect(journals).toEqual(["lead", "archive"]);
    });

    it("Indigo sets the lead on a tint and ends on ink; Red keeps a plain page", () => {
        const [red, indigo] = blogsTemplate.styles ?? [];
        expect(red.style.palette?.surface).toBe(red.style.palette?.bg);
        expect(indigo.style.palette?.surface).not.toBe(
            indigo.style.palette?.bg,
        );
        expect(indigo.style.palette?.footerBg).toBe(indigo.style.palette?.fg);
    });
});

describe("prana Classic (U9)", () => {
    it("answers Open now, Directions and Call under the buttons, with legible quiet text", () => {
        const page = instantiateTemplate(pranaShowcase, {
            organizationName: "Prana Yoga",
        }).pages[0];
        expect(page.sections[0].content).toMatchObject({ answerRow: true });
        const palette = pranaShowcase.styles?.[0].style.palette;
        expect(parsePalette(palette)).toMatchObject({ ok: true });
        if (!palette?.muted) throw new Error("no quiet text");
        expect(contrastRatio(palette.muted, palette.bg)).toBeGreaterThan(4.5);
    });
});
