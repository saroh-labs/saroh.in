import { getTemplate, starterTemplate } from "@saroh/templates";

/**
 * Which template a site was made from (industry templates, KTD-7): set on
 * the Site at creation (`site-create.ts`) and never rewritten by an edit.
 * `styleId` is the template's style (colourway) chosen with it, null when
 * none was.
 */
export interface SiteTemplateRecord {
    id: string;
    version: number;
    styleId: string | null;
}

/** The Site's columns that hold the record. */
export interface SiteTemplateColumns {
    templateId: string | null;
    templateVersion: number | null;
    templateStyleId?: string | null;
}

/**
 * The record as the site read shows it, or null when it is unknown: a site
 * made before templates were recorded. Unknown is never guessed.
 */
export function siteTemplate(
    site: SiteTemplateColumns,
): SiteTemplateRecord | null {
    if (!site.templateId || typeof site.templateVersion !== "number") {
        return null;
    }
    return {
        id: site.templateId,
        version: site.templateVersion,
        styleId: site.templateStyleId ?? null,
    };
}

/**
 * The template stamp a Publication of this site carries (its
 * `templateId`/`templateVersion` are required): the site's own template,
 * else — for a site made before it was recorded — the starter, which is
 * what every publish stamped until then.
 */
export function publicationTemplate(site: SiteTemplateColumns): {
    id: string;
    version: number;
} {
    const own = siteTemplate(site);
    if (own) return { id: own.id, version: own.version };
    return { id: starterTemplate.id, version: starterTemplate.version };
}

/**
 * The footer line the site's template started it with, for the pre-publish
 * check (round 2): the manifest's own line for the template and version the
 * site records. Null for a site with no record — never guessed — or a
 * template that writes no line.
 */
export function templateFooterLine(site: SiteTemplateColumns): string | null {
    const own = siteTemplate(site);
    if (!own) return null;
    const line = getTemplate(own.id, own.version)?.footer?.line?.trim();
    return line === undefined || line === "" ? null : line;
}
