import { sentenceList } from "@saroh/marketing/sentence-list";
import type {
    GallerySite,
    GalleryTemplate,
} from "@saroh/marketing/templates/gallery";
import {
    galleryTemplate as sharedGalleryTemplate,
    galleryTemplates as sharedGalleryTemplates,
    relatedTemplates as sharedRelated,
} from "@saroh/marketing/templates/gallery";

/**
 * saroh.tech's website templates gallery (owner, 16 Nov 2026): saroh.in's
 * `/templates`, at `/website-templates` because `/templates` here is the
 * document templates. Built from the same manifests a new site is made from
 * (`@saroh/marketing/templates/gallery`). No captured renders: saroh.in's
 * show rupee prices, so every page here is drawn from the template's data,
 * which names no price. Shown, and linked, only while `NEXT_PUBLIC_TEMPLATES`
 * is on, as saroh.in's is (DEC-135).
 */

export const WEBSITE_TEMPLATES_PATH = "/website-templates";

const SITE: GallerySite = { base: WEBSITE_TEMPLATES_PATH };

export function galleryTemplates(): GalleryTemplate[] {
    return sharedGalleryTemplates(SITE);
}

export function galleryTemplate(slug: string): GalleryTemplate | undefined {
    return sharedGalleryTemplate(SITE, slug);
}

export function relatedTemplates(t: GalleryTemplate): GalleryTemplate[] {
    return sharedRelated(t, galleryTemplates());
}

const WORDS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
];

/** "Nine", "nine": a small count as a word, else its digits. */
function numberWord(n: number, capital = false): string {
    const w = WORDS[n] ?? String(n);
    return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

export const websiteTemplatesPage = {
    name: "Website templates",
    title: "Pick a site that looks like your business.",
    description:
        "Website templates for a bakery, a salon, a gym, a clinic, a shop, a dietitian, a writer, a studio and a developer, each with its own type and colours, built on your products, bookings and posts in Saroh.",
    intro(templates: readonly GalleryTemplate[]): string {
        const n = templates.length;
        return n === 1
            ? "One template, with its own type and colours."
            : `${numberWord(n, true)} templates, each made for a kind of business, each with its own type and colours. Your products, bookings and posts are already wired in.`;
    },
    allChip: "All",
    preview: "Preview",
    sampleNote:
        "Every business shown is a sample, made up to show the template.",
    band: {
        title: "Pick one, and start from it.",
        body: "Start free, and pick your template when you set up your website.",
    },
} as const;

export const websiteTemplateDetail = {
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
                        : `${numberWord(titles.length, true)} pages`,
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
    band: (name: string) => `Start with ${name}.`,
} as const;
