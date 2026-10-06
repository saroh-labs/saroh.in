import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { TemplateManifest } from "@saroh/templates";
import { getTemplate, samePalette, sameTypeScale } from "@saroh/templates";

import type { SiteStyle, StyleColourway } from "./site-style";
import { parseSiteStyle, siteStyleVariables } from "./site-style";

/**
 * Which template looks a site may carry (DEC-090).
 *
 * A template may bring exact colours and a type scale that Website › Style's
 * curated rows cannot express. The merchant still chooses only from curated
 * choices: the template's colourways are added to them as named options, and
 * a palette or type scale that is not one of those is refused. So a merchant
 * cannot type a hex colour into the API any more than into the panel, and
 * every exact colour that reaches a page was drawn and contrast-checked by
 * whoever wrote the template.
 */

type TemplateLooks = Pick<TemplateManifest, "id" | "version" | "styles">;

/**
 * A template's colourways as choices. A colourway that fails the style rules
 * is a template bug (its unit's spec catches it first) and is left out rather
 * than offered: a choice that cannot be saved is worse than one fewer.
 */
export function templateColourways(
    template: TemplateLooks | null | undefined,
): StyleColourway[] {
    return (template?.styles ?? []).flatMap((preset) => {
        let style: SiteStyle;
        try {
            style = parseSiteStyle(preset.style);
        } catch {
            return [];
        }
        const vars = siteStyleVariables(style);
        return [
            {
                id: preset.id,
                name: preset.name,
                style,
                chips: [
                    vars["--site-bg"],
                    vars["--site-fg"],
                    vars["--site-accent"],
                ].filter((v): v is string => typeof v === "string"),
            },
        ];
    });
}

/** The recorded template of a site, if it is one this build has. */
export function recordedTemplate(site: {
    templateId: string | null;
    templateVersion: number | null;
}): TemplateManifest | undefined {
    if (!site.templateId || typeof site.templateVersion !== "number") {
        return undefined;
    }
    return getTemplate(site.templateId, site.templateVersion);
}

function storedStyle(stored: unknown): SiteStyle | undefined {
    try {
        return parseSiteStyle(stored);
    } catch {
        return undefined;
    }
}

/**
 * Refuse a palette or type scale the site was not offered.
 *
 * Allowed: none at all; the one the site already has (a colourway retuned
 * since it was chosen must not stop a merchant saving their spacing); or one
 * of its recorded template's colourways'. Anything else is a 400 on the
 * field, whatever its colours: being legible is necessary, not sufficient.
 */
export function assertTemplateLookOffered(
    next: SiteStyle,
    {
        stored,
        template,
    }: { stored: unknown; template: TemplateLooks | null | undefined },
): void {
    if (!next.palette && !next.type) return;
    const current = storedStyle(stored);
    const offered = [
        ...(current ? [current] : []),
        ...templateColourways(template).map((c) => c.style),
    ];
    if (next.palette) {
        const palette = next.palette;
        const ok = offered.some(
            (s) => s.palette !== undefined && samePalette(s.palette, palette),
        );
        if (!ok) {
            throw new BadRequestException({
                message: "Choose one of your template's colourways",
                details: { field: "palette" },
            });
        }
    }
    if (next.type) {
        const ok = offered.some(
            (s) => s.type !== undefined && sameTypeScale(s.type, next.type),
        );
        if (!ok) {
            throw new BadRequestException({
                message: "The type scale comes with your template's colourways",
                details: { field: "type" },
            });
        }
    }
}

/**
 * {@link assertTemplateLookOffered} for a site by id: reads what it holds and
 * which template made it. Only when the style carries a template look, so a
 * save without one costs no read.
 */
export async function assertSiteLookOffered(
    organizationId: string,
    siteId: string,
    next: SiteStyle,
): Promise<void> {
    if (!next.palette && !next.type) return;
    const site = await prisma.site.findFirst({
        where: { id: siteId, organizationId, deletedAt: null },
        select: { style: true, templateId: true, templateVersion: true },
    });
    assertTemplateLookOffered(next, {
        stored: site?.style,
        template: site ? recordedTemplate(site) : undefined,
    });
}
