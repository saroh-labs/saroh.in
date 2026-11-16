import type {
    GallerySite,
    GalleryTemplate,
} from "@saroh/marketing/templates/gallery";
import {
    galleryTemplate as sharedGalleryTemplate,
    galleryTemplates as sharedGalleryTemplates,
    relatedTemplates as sharedRelated,
} from "@saroh/marketing/templates/gallery";

import { EARLY_ACCESS_DAY } from "@/content/early-access";
import { TEMPLATE_SHOTS } from "@/content/template-shots";
import { sentenceList } from "@/lib/format/list";
import { numberWord } from "@/lib/format/number-words";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for its
 * pages (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-11-14";

export {
    GALLERY_KINDS,
    galleryChips,
    isGalleryTemplate,
    USES_WORDS,
} from "@saroh/marketing/templates/gallery";
export type {
    GalleryTemplate,
    PreviewColours,
    PreviewPage,
    PreviewSection,
} from "@saroh/marketing/templates/gallery";

/**
 * The Templates gallery (Resources plan U6, industry templates plan U13):
 * `/templates` and `/templates/[slug]`, its data shared with saroh.tech
 * (`@saroh/marketing/templates/gallery`), built from `@saroh/templates` — the
 * same manifests a new site is created from — so the gallery can only show
 * a template a merchant can actually pick (KTD-6, R2).
 *
 * A template is in the gallery when its manifest carries the gallery's
 * metadata: the kinds of business it is for, a shape, a sample business
 * and at least one colourway (`isGalleryTemplate`). The general templates
 * (starter, personal, writing, the first portfolio) carry none and are not
 * shown. Salon and Clinic joined on their own when they were built (U11).
 *
 * What is written here, not read from the manifest: the gallery's name
 * where the design renames one (Studio is "Portfolio"; Ceramics is already
 * "Store"), each template's one-line idea, and the colours a card is drawn
 * in until U14's 2× renders replace the drawing (`template-shots.ts`).
 * No price, plan or limit is ever written here (the repo is public).
 */

export const TEMPLATES_PATH = "/templates";

export function templateHref(slug: string): string {
    return `${TEMPLATES_PATH}/${slug}`;
}

/** saroh.in's gallery: at `/templates`, with its captured renders. */
const SITE: GallerySite = { base: TEMPLATES_PATH, shots: TEMPLATE_SHOTS };

/** The gallery's templates, in the design's order (`@saroh/marketing`). */
export function galleryTemplates(): GalleryTemplate[] {
    return sharedGalleryTemplates(SITE);
}

export function galleryTemplate(slug: string): GalleryTemplate | undefined {
    return sharedGalleryTemplate(SITE, slug);
}

/** "Also built around one thing": at most three, sharing a kind first. */
export function relatedTemplates(
    template: GalleryTemplate,
    templates: readonly GalleryTemplate[] = galleryTemplates(),
): GalleryTemplate[] {
    return sharedRelated(template, templates);
}

/** The day early access opens, in India (`content/early-access.ts`). */
export { EARLY_ACCESS_DAY };
/** As the copy writes it. */
const EARLY_ACCESS_SHORT = "17 Oct";

/**
 * The gallery's words. Each count and list is derived from the templates
 * shown, and the pre-launch lines change on early access's day: the pages
 * publish on that day (`content/resources.ts`), so a preview shows the
 * pre-launch wording and the live site the day's.
 */
export const templatesPage = {
    title: "Pick a site that looks like your business.",
    seo: {
        title: "Website templates for small businesses · Saroh",
        socialTitle: "Pick a site that looks like your business.",
        description:
            "Website templates for a bakery, a salon, a gym, a clinic, a shop, a dietician, a writer, a studio and a developer, each with its own type and colours, built on your products, bookings and posts in Saroh.",
    },
    intro(templates: readonly GalleryTemplate[]): string {
        const n = templates.length;
        const each =
            n === 1
                ? "One template, with its own type and colours."
                : `${numberWord(n, { capital: true })} templates, each made for a kind of business, each with its own type and colours.`;
        const has = (type: string) =>
            templates.some((t) =>
                t.pages.some((p) => p.sections.some((s) => s.type === type)),
            );
        const wired = [
            has("booking") || templates.some((t) => t.uses.includes("Bookings"))
                ? "bookings"
                : null,
            has("productGrid") ? "products" : null,
            has("plans") ? "memberships" : null,
        ].filter((w): w is string => w !== null);
        if (wired.length === 0) return each;
        const list = sentenceList(wired);
        return `${each} ${list.charAt(0).toUpperCase()}${list.slice(1)} are already wired in.`;
    },
    allChip: "All",
    preview: "Preview",
    sampleNote:
        "Every business shown is a sample, made up to show the template.",
    band: {
        before: `Pick one now. It's ready for you on ${EARLY_ACCESS_SHORT}.`,
        after: "Pick one, and start from it.",
        body: "Start free, and pick your template when you set up your website.",
    },
} as const;

export const templateDetail = {
    crumb: "Website templates",
    saveNote: (name: string) =>
        `Start free, and pick ${name} when you set up your website.`,
    switcher: "Pages",
    desktop: "Desktop",
    phone: "Phone",
    notes: {
        pages(t: GalleryTemplate): { title: string; body: string } {
            const titles = t.pages.map((p) => p.title);
            return {
                title:
                    titles.length === 1
                        ? "One page"
                        : `${numberWord(titles.length, { capital: true })} pages`,
                body:
                    titles.length === 1
                        ? "Everything on one page, in the order a visitor asks for it."
                        : `${sentenceList(titles)}.`,
            };
        },
        uses(t: GalleryTemplate): { title: string; body: string } {
            return {
                title: "Runs on what you add",
                body: t.uses.length
                    ? `${sentenceList(t.uses)} come from what you add in Saroh, so the site changes when they do. Until you add one, its section stays off the page.`
                    : "Everything on it is yours to write, and nothing on it waits for data.",
            };
        },
        look(t: GalleryTemplate): { title: string; body: string } {
            return {
                title: "Its own look",
                body: `Set in ${t.type}, in ${t.colourways.length === 1 ? "one colourway" : `${numberWord(t.colourways.length)} colourways`}: ${sentenceList(t.colourways)}. Nothing in it is Saroh's.`,
            };
        },
    },
    facts: {
        pages: "Pages",
        uses: "Uses",
        type: "Type",
        colours: "Colours",
    },
    related: "Also built around one thing",
    band: {
        before: (name: string) =>
            `Start with ${name}. It's ready for you on ${EARLY_ACCESS_SHORT}.`,
        after: (name: string) => `Start with ${name}.`,
    },
} as const;

/** Whether early access has opened at `now` (midnight in India). */
export function earlyAccessOpen(now: Date): boolean {
    return (
        now.getTime() >=
        new Date(`${EARLY_ACCESS_DAY}T00:00:00+05:30`).getTime()
    );
}
