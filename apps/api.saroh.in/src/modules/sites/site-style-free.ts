import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { FreeStyles } from "@saroh/pricing-catalog";
import { freeStylesOf } from "@saroh/pricing-catalog";
import type { LookId, TemplateManifest } from "@saroh/templates";
import { DEFAULT_FONT_PAIR, LOOK_IDS, samePalette } from "@saroh/templates";

import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { planMeter } from "../billing/metering.service";
import { snapshotLook } from "./site-looks";
import type { SiteStyle } from "./site-style";
import { parseSiteStyle } from "./site-style";
import { recordedTemplate, templateColourways } from "./site-style-offer";

/**
 * Free and paid looks, typefaces and colourways (DEC-177).
 *
 * Each look, font pair and colourway is free or paid. Free ones work for
 * every business; paid ones need the plan's `themes` row ("Themes, fonts
 * and templates"). WHICH are free is the live catalogue's `freeStyles`
 * (`@saroh/pricing-catalog`), ticked in admin › Plans and modules, so a
 * change is a published version, never a release. The live catalogue, not
 * the business's own version: a free list reaches every business the
 * moment it is published.
 *
 * Whatever the catalogue says, a site is always allowed:
 *
 * - the visitor's system font (`DEFAULT_FONT_PAIR`);
 * - its own template's typefaces, and the colourway it was made in, so
 *   nobody loses what they started with;
 * - Classic (no look), and anything the site already has: the draft's look,
 *   pair or palette, and the live site's look.
 *
 * Colour swatches and the sliders are the merchant's own choices, never a
 * look, pair or colourway, so they are never paid.
 */

const logger = new Logger("SiteStyleFree");
const catalogue = new CatalogueAccessService();

/** What a site may choose for nothing, by kind: ids as the editor holds them. */
export interface SiteFreeStyles {
    looks: LookId[];
    fontPairs: string[];
    /** The site's template's colourways, by their own id (`kesar`). */
    colourways: string[];
}

/** What the editor's Style panel needs to mark and refuse a paid choice. */
export interface SiteStyleAccess {
    free: SiteFreeStyles;
    /** The plan includes `themes`: every choice is open to it. */
    paidIncluded: boolean;
}

/** A part of a style save that is paid and not already the site's. */
export interface PaidStylePart {
    field: "look" | "fontPair" | "palette";
    /** The look, pair or colourway (`template:colourway`) chosen. */
    id: string;
}

type SiteTemplate = Pick<TemplateManifest, "id" | "version" | "styles">;

const NONE_FREE: FreeStyles = { looks: [], fontPairs: [], colourways: [] };

/** A colourway's id in the catalogue: unique only with its template's. */
export function colourwayKey(templateId: string, colourwayId: string): string {
    return `${templateId}:${colourwayId}`;
}

/**
 * What one site may choose for nothing: the catalogue's free lists, as they
 * apply to its template, plus what every site always has.
 */
export function siteFreeStyles(
    lists: FreeStyles,
    template: SiteTemplate | null | undefined,
    startColourway: string | null | undefined,
): SiteFreeStyles {
    const looks = LOOK_IDS.filter((l) => lists.looks.includes(l));
    const presets = template?.styles ?? [];
    const ownPairs = presets.flatMap((p) =>
        p.style.fontPair ? [p.style.fontPair as string] : [],
    );
    const fontPairs = [
        ...new Set<string>([
            DEFAULT_FONT_PAIR,
            ...ownPairs,
            ...lists.fontPairs,
        ]),
    ];
    // The one it was made in, else the template's first (as Reset reads it).
    const start = presets.some((p) => p.id === startColourway)
        ? startColourway
        : presets[0]?.id;
    const colourways = presets
        .filter(
            (p) =>
                p.id === start ||
                (template !== null &&
                    template !== undefined &&
                    lists.colourways.includes(colourwayKey(template.id, p.id))),
        )
        .map((p) => p.id);
    return { looks, fontPairs, colourways };
}

/**
 * The parts of `next` that are paid for this site and not what it already
 * has. Empty: the save needs no plan row.
 */
export function paidStyleParts(
    next: SiteStyle,
    {
        stored,
        liveLook,
        template,
        free,
    }: {
        /** The draft's style before this save. */
        stored: SiteStyle | undefined;
        /** The live site's look, when it has one. */
        liveLook?: LookId;
        template: SiteTemplate | null | undefined;
        free: SiteFreeStyles;
    },
): PaidStylePart[] {
    const paid: PaidStylePart[] = [];

    if (
        next.look &&
        next.look !== stored?.look &&
        next.look !== liveLook &&
        !free.looks.includes(next.look)
    ) {
        paid.push({ field: "look", id: next.look });
    }

    const pair = next.fontPair ?? DEFAULT_FONT_PAIR;
    const had = stored?.fontPair ?? DEFAULT_FONT_PAIR;
    if (pair !== had && !free.fontPairs.includes(pair)) {
        paid.push({ field: "fontPair", id: pair });
    }

    // A colourway is its exact palette (DEC-090); that it is one of the
    // template's is `assertTemplateLookOffered`'s rule, checked first.
    const palette = next.palette;
    if (
        palette &&
        template &&
        !(stored?.palette && samePalette(stored.palette, palette))
    ) {
        const colourway = templateColourways(template).find(
            (c) => c.style.palette && samePalette(c.style.palette, palette),
        );
        if (colourway && !free.colourways.includes(colourway.id)) {
            paid.push({
                field: "palette",
                id: colourwayKey(template.id, colourway.id),
            });
        }
    }
    return paid;
}

/**
 * The live catalogue's free lists. Fail safe the other way from a plan
 * read: a catalogue that can't be read frees nothing beyond what every site
 * has, and `themes` then decides (which lets everything through when the
 * plan can't be read either).
 */
export async function liveFreeStyles(
    now: Date = new Date(),
): Promise<FreeStyles> {
    try {
        return freeStylesOf(await catalogue.liveCatalog(now));
    } catch (err) {
        logger.warn(
            `free_styles_unresolved error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return NONE_FREE;
    }
}

function storedStyle(stored: unknown): SiteStyle | undefined {
    try {
        return parseSiteStyle(stored);
    } catch {
        return undefined;
    }
}

interface SiteRow {
    style: unknown;
    templateId: string | null;
    templateVersion: number | null;
    templateStyleId: string | null;
}

async function readSite(
    organizationId: string,
    siteId: string,
): Promise<SiteRow | null> {
    return prisma.site.findFirst({
        where: { id: siteId, organizationId, deletedAt: null },
        select: {
            style: true,
            templateId: true,
            templateVersion: true,
            templateStyleId: true,
        },
    });
}

/**
 * Refuse a style save that picks a paid look, typeface or colourway on a
 * plan without `themes`: the plan's 403 `MODULE_LOCKED`, as every switch
 * row's. A save of free parts only, or of what the site already has, reads
 * no catalogue and no plan.
 */
export async function assertStyleChoicesAllowed(
    organizationId: string,
    siteId: string,
    next: SiteStyle,
    now: Date = new Date(),
): Promise<void> {
    const site = await readSite(organizationId, siteId);
    if (!site) return;
    const template = recordedTemplate(site);
    const stored = storedStyle(site.style);
    const parts = (lists: FreeStyles, liveLook?: LookId) =>
        paidStyleParts(next, {
            stored,
            liveLook,
            template,
            free: siteFreeStyles(lists, template, site.templateStyleId),
        });

    if (parts(NONE_FREE).length === 0) return;
    // Only now the live look and the catalogue, the larger reads.
    const live = await prisma.site.findFirst({
        where: { id: siteId, organizationId, deletedAt: null },
        select: { currentPublication: { select: { snapshot: true } } },
    });
    const liveLook = snapshotLook(live?.currentPublication?.snapshot);
    if (parts(NONE_FREE, liveLook).length === 0) return;
    if (parts(await liveFreeStyles(now), liveLook).length === 0) return;
    await planMeter.assertIncluded(organizationId, "themes", now);
}

/** The editor's `styleAccess` for a site already read. */
export async function siteStyleAccess(
    organizationId: string,
    site: Omit<SiteRow, "style">,
    now: Date = new Date(),
): Promise<SiteStyleAccess> {
    const [lists, paidIncluded] = await Promise.all([
        liveFreeStyles(now),
        planMeter.isIncluded(organizationId, "themes", now),
    ]);
    return {
        free: siteFreeStyles(
            lists,
            recordedTemplate(site),
            site.templateStyleId,
        ),
        paidIncluded,
    };
}
