import { plainSiteIconDataUrl } from "@saroh/site-blocks/site-icon";

import { mediaSrc } from "@/lib/media/media-src";

import type { SiteDetail, SiteIconSaved } from "./service";
import { resolveStyleVariables } from "./style";

/**
 * The words and rules of the "Site icon" row (DEC-121). Pure, so the row,
 * its sheet and the read-only view say the same thing.
 *
 * A site shows its own icon, else the business logo, else a plain tile with
 * its initial in the site's accent colour. The tile is drawn by the same
 * function the live site serves it with (`@saroh/site-blocks/site-icon`),
 * so the preview here is the icon.
 */

/** The row's id, for a link to land on. */
export const SITE_ICON_ANCHOR = "settings-site-icon";

/** Which icon the site shows. */
export type SiteIconSource = "own" | "logo" | "plain";

/** One line saying which. */
export const SITE_ICON_LINE: Record<SiteIconSource, string> = {
    own: "Your own icon",
    logo: "Using your business logo",
    plain: "A plain icon with your initial",
};

/** What the sheet's remove button says: what the site shows without one. */
export const SITE_ICON_REMOVE: Record<
    Exclude<SiteIconSource, "own">,
    string
> = {
    logo: "Use your business logo",
    plain: "Use the plain icon",
};

/** What an icon should be, said once under the picker. */
export const SITE_ICON_GUIDE =
    "PNG, JPG or WebP, at least 192 × 192; square works best.";

/** An icon being shown: which it is, and the address an `<img>` draws. */
export interface ShownSiteIcon {
    source: SiteIconSource;
    src: string;
}

/** What the plain tile is drawn from. */
type TileSite = Pick<SiteDetail, "name"> &
    Partial<Pick<SiteDetail, "style" | "styleOptions">>;

/** The plain tile in the site's draft colours; neutral with no look read. */
export function plainSiteIcon(site: TileSite): string {
    return plainSiteIconDataUrl({
        name: site.name,
        variables:
            site.style && site.styleOptions
                ? resolveStyleVariables(site.style, site.styleOptions)
                : null,
    });
}

/**
 * The icon the site shows with `own` as its own (the saved one, or the one
 * being chosen in the sheet): its own, else the business logo, else the
 * plain tile. An address that can't be drawn falls through to the next.
 */
export function shownSiteIcon(
    site: TileSite,
    own: string | null | undefined,
    businessLogoUrl: string | null | undefined,
): ShownSiteIcon {
    const mine = mediaSrc(own);
    if (mine) return { source: "own", src: mine };
    const logo = mediaSrc(businessLogoUrl);
    if (logo) return { source: "logo", src: logo };
    return { source: "plain", src: plainSiteIcon(site) };
}

/** A site's icon as read, with an older API's absence as neither. */
export function siteIconOf(site: Pick<SiteDetail, "icon">): SiteIconSaved {
    return site.icon ?? { own: null, businessLogoUrl: null };
}

/** The types an icon may be: the API's rule (`sites/site-icon.ts`). */
const ICON_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** 1 MB, as the business logo. */
const ICON_MAX_BYTES = 1024 * 1024;

/**
 * Why a picked file can't be the icon, before anything is uploaded; "" when
 * it can. The API checks the same and has the last word.
 */
export function siteIconFileProblem(file: {
    type: string;
    size: number;
}): string {
    if (!ICON_TYPES.includes(file.type)) {
        return "That file isn't a PNG, JPG or WebP image.";
    }
    if (file.size > ICON_MAX_BYTES) {
        return "That image is over 1 MB. Choose a smaller one.";
    }
    return "";
}

/** The smallest side an icon should have, for a phone's home screen. */
const ICON_MIN_SIDE = 192;

/**
 * A note about the picked image's shape, or null. Guidance, never a
 * refusal: a small or oblong image still works, it just looks worse.
 */
export function siteIconShapeNote(image: {
    width?: number | null;
    height?: number | null;
}): string | null {
    const { width, height } = image;
    if (!width || !height) return null;
    if (width !== height) {
        return "This image isn't square, so it will look squashed in a tab. A square one works best.";
    }
    if (width < ICON_MIN_SIDE) {
        return `This image is ${width} × ${height}. It may look soft on a phone; 192 × 192 or larger is sharper.`;
    }
    return null;
}
