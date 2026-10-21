import { Logger } from "@nestjs/common";
import type {
    PaidStylePart,
    SiteFreeStyles,
    SiteStyleAccess,
} from "@saroh/block-contract";
import {
    colourwayKey,
    paidStyleParts as sharedPaidStyleParts,
    siteFreeStyles,
} from "@saroh/block-contract";
import { prisma } from "@saroh/database";
import type { FreeStyles } from "@saroh/pricing-catalog";
import { freeStylesOf } from "@saroh/pricing-catalog";
import type { LookId, TemplateManifest } from "@saroh/templates";

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

export { colourwayKey, siteFreeStyles };
export type { PaidStylePart, SiteFreeStyles, SiteStyleAccess };

type SiteTemplate = Pick<TemplateManifest, "id" | "version" | "styles">;

const NONE_FREE: FreeStyles = { looks: [], fontPairs: [], colourways: [] };

/**
 * The parts of `next` that are paid for this site and not what it already
 * has. Empty: the save needs no plan row. The rule itself is
 * `@saroh/block-contract`'s, the one the app's Style panel runs (review
 * #22); a colourway is told apart by its exact palette (DEC-090), and that
 * it is one of the template's is `assertTemplateLookOffered`'s rule,
 * checked first.
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
    return sharedPaidStyleParts(next, {
        stored,
        liveLook,
        templateId: template?.id ?? null,
        colourways: templateColourways(template).map((c) => ({
            id: c.id,
            palette: c.style.palette,
        })),
        free,
    });
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
