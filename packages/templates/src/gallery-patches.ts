import type { InstantiatedTemplate } from "./instantiate";
import { BAKERY_GALLERY_SAMPLE, BAKERY_TEMPLATE_ID } from "./templates/bakery";
import { BLOGS_GALLERY_SAMPLE, BLOGS_TEMPLATE_ID } from "./templates/blogs";
import {
    CERAMICS_GALLERY_SAMPLE,
    CERAMICS_TEMPLATE_ID,
} from "./templates/ceramics";
import { CLINIC_GALLERY_SAMPLE, CLINIC_TEMPLATE_ID } from "./templates/clinic";
import {
    DEVELOPER_GALLERY_SAMPLE,
    DEVELOPER_TEMPLATE_ID,
} from "./templates/developer";
import {
    DIETICIAN_GALLERY_SAMPLE,
    DIETICIAN_TEMPLATE_ID,
} from "./templates/dietician";
import { GYM_GALLERY_SAMPLE, GYM_TEMPLATE_ID } from "./templates/gym";
import { SALON_GALLERY_SAMPLE, SALON_TEMPLATE_ID } from "./templates/salon";
import { STUDIO_GALLERY_SAMPLE, STUDIO_TEMPLATE_ID } from "./templates/studio";

/**
 * Laying a gallery template's sample words over its placeholders (KTD-6,
 * DEC-182): the design's words for the few places a template leaves the
 * owner a placeholder, from each template's own `*_GALLERY_SAMPLE`.
 *
 * Three readers, never `instantiateTemplate`:
 *
 * - the gallery's renders (`@saroh/site-blocks/showcase`, drawn by
 *   `apps/saroh.app`'s `/template-renders`);
 * - a look's Preview in the editor (DEC-182), which draws the look's
 *   showcase template (`LOOK_SHOWCASE_TEMPLATE`) the same way;
 * - "Use this look with its starter content" (DEC-182), the one path that
 *   lays them on a merchant's DRAFT, by the owner's explicit choice. The
 *   pre-publish check names every one still there (`gallerySampleIn`).
 *
 * A site made from a template never gets them: it keeps the placeholders
 * (`gallery-samples.test.ts`).
 */

/**
 * A change to one section's content: the design's sample words where the
 * template leaves the owner a placeholder.
 */
export interface GallerySectionPatch {
    /** The page's path, `/` for home. */
    page: string;
    type: string;
    /** Which of the page's sections of that type, from 0. */
    nth?: number;
    patch: (content: Record<string, unknown>) => Record<string, unknown>;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const paragraphs = (texts: readonly string[]) =>
    texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("");

/**
 * A text block's words with the sample's paragraphs in place of the
 * template's: its heading kept, its facts' labels kept with the sample's
 * values in order, and a "To write back" line (the business's own email)
 * kept where the template made one.
 */
function prose(
    value: unknown,
    texts: readonly string[],
    facts?: readonly string[],
): string {
    const html = typeof value === "string" ? value : "";
    const heading = /^<h2>[\s\S]*?<\/h2>/.exec(html)?.[0] ?? "";
    const writeBack = /<p>To write back:[\s\S]*?<\/p>/.exec(html)?.[0] ?? "";
    let list = /<dl>[\s\S]*?<\/dl>/.exec(html)?.[0] ?? "";
    if (facts) {
        let i = 0;
        list = list.replace(/<dd>[\s\S]*?<\/dd>/g, (dd) => {
            const fact = facts.at(i++);
            return fact === undefined ? dd : `<dd>${escapeHtml(fact)}</dd>`;
        });
    }
    return heading + paragraphs(texts) + writeBack + list;
}

/** A list's items with the sample's fields merged over each, by position. */
function mergeItems(items: unknown, samples: readonly object[]): unknown {
    if (!Array.isArray(items)) return items;
    return items.map((item: unknown, i) => ({
        ...(item as object),
        ...samples[i],
    }));
}

/** A Person block's team (the first, then `people`) as the sample's. */
function team(
    content: Record<string, unknown>,
    sample: readonly object[],
): Record<string, unknown> {
    const [first, ...rest] = sample;
    return {
        ...content,
        ...first,
        people: mergeItems(content.people ?? [], rest),
    };
}

/**
 * The case study in the design's words: its title and line, then each of
 * the template's part labels with the sample's paragraphs under it.
 */
function caseStudy(value: unknown): string {
    const html = typeof value === "string" ? value : "";
    const sample = DEVELOPER_GALLERY_SAMPLE.caseStudy;
    const labels = html.match(/<h3>[\s\S]*?<\/h3>/g) ?? [];
    return (
        `<h2>${escapeHtml(sample.title)}</h2>` +
        `<p><em>${escapeHtml(sample.meta)}</em></p>` +
        labels
            .map((label, i) => label + paragraphs(sample.parts[i] ?? []))
            .join("")
    );
}

const BAKERY_PATCHES: readonly GallerySectionPatch[] = [
    {
        page: "/",
        type: "richText",
        patch: (content) => ({
            ...content,
            value: prose(content.value, [
                ...BAKERY_GALLERY_SAMPLE.story.paragraphs,
                BAKERY_GALLERY_SAMPLE.story.sign,
            ]),
        }),
    },
];

const CERAMICS_PATCHES: readonly GallerySectionPatch[] = [
    {
        page: "/",
        type: "features",
        patch: (content) => ({
            ...content,
            items: mergeItems(
                content.items,
                CERAMICS_GALLERY_SAMPLE.material.map((body) => ({ body })),
            ),
        }),
    },
    {
        page: "/",
        type: "richText",
        patch: (content) => ({
            ...content,
            value: prose(
                content.value,
                CERAMICS_GALLERY_SAMPLE.studio.paragraphs,
                CERAMICS_GALLERY_SAMPLE.studio.facts,
            ),
        }),
    },
];

const GYM_PATCHES: readonly GallerySectionPatch[] = [
    // The design's four coaches (KTD-6), on Home and on Trainers.
    ...["/", "/trainers"].map((page) => ({
        page,
        type: "person",
        patch: (content: Record<string, unknown>) =>
            team(content, GYM_GALLERY_SAMPLE.coaches),
    })),
    // The first visit, as the design says it, on Home and Membership.
    ...["/", "/membership"].map((page) => ({
        page,
        type: "features",
        patch: (content: Record<string, unknown>) => ({
            ...content,
            items: mergeItems(
                content.items,
                GYM_GALLERY_SAMPLE.firstVisit.map((body) => ({ body })),
            ),
        }),
    })),
];

const DIETICIAN_PATCHES: readonly GallerySectionPatch[] = [
    {
        // The template's own gallery sample (KTD-6), note and all.
        page: "/",
        type: "person",
        patch: (content) => ({
            ...content,
            role: DIETICIAN_GALLERY_SAMPLE.role,
            credentials: [...DIETICIAN_GALLERY_SAMPLE.credentials],
            bio: DIETICIAN_GALLERY_SAMPLE.bio,
        }),
    },
    {
        // The facts row under her: the first features block, `facts`.
        page: "/",
        type: "features",
        patch: (content) =>
            content.variant === "facts"
                ? {
                      ...content,
                      items: DIETICIAN_GALLERY_SAMPLE.facts.map((f) => ({
                          ...f,
                      })),
                  }
                : content,
    },
];

const BLOGS_PATCHES: readonly GallerySectionPatch[] = [
    {
        page: "/",
        type: "richText",
        patch: (content) => ({
            ...content,
            value: prose(content.value, BLOGS_GALLERY_SAMPLE.about.paragraphs),
        }),
    },
];

const STUDIO_PATCHES: readonly GallerySectionPatch[] = [
    {
        // The design's five projects: name and meta over each photo,
        // which stays its brief. The design has no line under them.
        page: "/",
        type: "projects",
        patch: (content) => ({
            ...content,
            items: Array.isArray(content.items)
                ? content.items.map((item: unknown, i) => {
                      const sample = STUDIO_GALLERY_SAMPLE.projects.at(i);
                      if (!sample) return item;
                      const { summary: _drop, ...rest } = item as {
                          summary?: unknown;
                      };
                      return { ...rest, ...sample };
                  })
                : content.items,
        }),
    },
    {
        page: "/",
        type: "richText",
        patch: (content) => ({
            ...content,
            value: prose(
                content.value,
                STUDIO_GALLERY_SAMPLE.studio.paragraphs,
                STUDIO_GALLERY_SAMPLE.studio.facts,
            ),
        }),
    },
    {
        // The studio's address beside its email (the design's rows).
        page: "/",
        type: "contact",
        patch: (content) => ({
            ...content,
            address: STUDIO_GALLERY_SAMPLE.address,
        }),
    },
];

const DEVELOPER_PATCHES: readonly GallerySectionPatch[] = [
    {
        page: "/",
        type: "richText",
        nth: 0,
        patch: (content) => ({
            ...content,
            value: prose(
                content.value,
                DEVELOPER_GALLERY_SAMPLE.intro.paragraphs,
                DEVELOPER_GALLERY_SAMPLE.intro.facts,
            ),
        }),
    },
    {
        // The design's five engagements: more rows than the template's
        // three placeholders, as the design lists them.
        page: "/",
        type: "projects",
        patch: (content) => ({
            ...content,
            items: DEVELOPER_GALLERY_SAMPLE.work.map((w) => ({ ...w })),
        }),
    },
    {
        page: "/",
        type: "richText",
        nth: 1,
        patch: (content) => ({
            ...content,
            value: caseStudy(content.value),
            callout: {
                ...(content.callout as object),
                text: DEVELOPER_GALLERY_SAMPLE.caseStudy.result,
            },
        }),
    },
    {
        page: "/",
        type: "features",
        patch: (content) => ({
            ...content,
            items: mergeItems(
                content.items,
                DEVELOPER_GALLERY_SAMPLE.rates.items,
            ),
            note: DEVELOPER_GALLERY_SAMPLE.rates.note,
        }),
    },
    {
        page: "/",
        type: "richText",
        nth: 2,
        patch: (content) => ({
            ...content,
            callout: { ...DEVELOPER_GALLERY_SAMPLE.availability },
        }),
    },
];

const SALON_PATCHES: readonly GallerySectionPatch[] = [
    {
        // The gallery's sample stylists (KTD-6), photo briefs kept.
        page: "/",
        type: "person",
        patch: (content) => team(content, SALON_GALLERY_SAMPLE.stylists),
    },
    {
        page: "/",
        type: "features",
        patch: (content) => ({
            ...content,
            items: Array.isArray(content.items)
                ? content.items.map((item: unknown, i) => ({
                      ...(item as object),
                      body: SALON_GALLERY_SAMPLE.before[i],
                  }))
                : content.items,
        }),
    },
];

const CLINIC_PATCHES: readonly GallerySectionPatch[] = [
    {
        // The showcase's two dentists (KTD-6), photo briefs kept.
        page: "/",
        type: "person",
        patch: (content) => team(content, CLINIC_GALLERY_SAMPLE.doctors),
    },
];

/** Every gallery template's patches, by template id. */
export const GALLERY_PATCHES: Readonly<
    Record<string, readonly GallerySectionPatch[]>
> = {
    [BAKERY_TEMPLATE_ID]: BAKERY_PATCHES,
    [CERAMICS_TEMPLATE_ID]: CERAMICS_PATCHES,
    [GYM_TEMPLATE_ID]: GYM_PATCHES,
    [DIETICIAN_TEMPLATE_ID]: DIETICIAN_PATCHES,
    [BLOGS_TEMPLATE_ID]: BLOGS_PATCHES,
    [STUDIO_TEMPLATE_ID]: STUDIO_PATCHES,
    [DEVELOPER_TEMPLATE_ID]: DEVELOPER_PATCHES,
    [SALON_TEMPLATE_ID]: SALON_PATCHES,
    [CLINIC_TEMPLATE_ID]: CLINIC_PATCHES,
};

/** Which of a page's sections of its type the one at `index` is, from 0. */
function nthOfType(sections: readonly { type: string }[], index: number) {
    const type = sections[index]?.type;
    return sections.slice(0, index).filter((s) => s.type === type).length;
}

/**
 * One section's content with its template's sample words laid over it:
 * every patch for its page, type and position applied in order. The
 * content as given when the template has none for it.
 */
export function withGallerySample(
    templateId: string,
    page: string,
    sections: readonly { type: string }[],
    index: number,
    content: Record<string, unknown>,
): Record<string, unknown> {
    const type = sections[index]?.type;
    const nth = nthOfType(sections, index);
    let out = content;
    for (const p of GALLERY_PATCHES[templateId] ?? []) {
        if (p.page === page && p.type === type && (p.nth ?? 0) === nth) {
            out = p.patch(out);
        }
    }
    return out;
}

/**
 * A template's pages, as `instantiateTemplate` made them, with its sample
 * words laid over every section a patch names. Pure: a new structure, the
 * given one untouched.
 */
export function withGallerySamples(
    templateId: string,
    built: InstantiatedTemplate,
): InstantiatedTemplate {
    return {
        pages: built.pages.map((page) => ({
            ...page,
            sections: page.sections.map((section, i) => ({
                ...section,
                content: withGallerySample(
                    templateId,
                    page.path,
                    page.sections,
                    i,
                    { ...(section.content as Record<string, unknown>) },
                ),
            })),
        })),
    };
}
