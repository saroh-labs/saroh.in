import type { TemplateKind, TemplateShape } from "@saroh/templates";
import { listTemplates } from "@saroh/templates";

import { templateColourways } from "./site-style-offer";

/**
 * The template catalogue, as `/sites/new`'s picker and the public showcase
 * read it (industry templates plan, U12): what each template is, who it is
 * for, what it is built around, which modules its sections need and the
 * colourways it starts in.
 *
 * Product claims only. Page TITLES, never sections: the instantiated content
 * stays behind the create route, and nothing here is about an Organization,
 * so the unauthenticated `GET /public/sites/templates` may return it whole.
 * Both routes return this one shape, so the picker and the gallery cannot
 * drift apart.
 */
export interface CatalogueColourway {
    /** The preset's id, the create DTO's `styleId`. */
    id: string;
    name: string;
    /** Three HSL triples, page · text · accent, as the page resolves them. */
    chips: string[];
}

export interface CatalogueTemplate {
    id: string;
    version: number;
    name: string;
    description?: string;
    /** The gallery's URL segment; the id when the template names none. */
    slug: string;
    /** The waitlist kinds it is offered to first; empty: anyone. */
    kinds: TemplateKind[];
    /** What the site is built around; null when the template says nothing. */
    shape: TemplateShape | null;
    /** Module keys its sections read real data from. */
    uses: string[];
    /** Its colourways, the default first; empty: the default look. */
    colourways: CatalogueColourway[];
    /** Its pages' titles, in order. */
    pages: string[];
}

/** The latest version of every registered template, in the picker's order. */
export function templateCatalogue(): CatalogueTemplate[] {
    return listTemplates().map((template) => ({
        id: template.id,
        version: template.version,
        name: template.name,
        description: template.description,
        slug: template.slug ?? template.id,
        kinds: [...(template.kinds ?? [])],
        shape: template.shape ?? null,
        uses: [...(template.uses ?? [])],
        // A colourway that would not save is left out, as Website › Style
        // leaves it out: the picker never offers what create would refuse.
        colourways: templateColourways(template).map(({ id, name, chips }) => ({
            id,
            name,
            chips,
        })),
        pages: template.pages.map((page) => page.title),
    }));
}
