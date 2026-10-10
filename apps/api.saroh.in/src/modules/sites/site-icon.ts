import { prisma, runInOrgContext } from "@saroh/database";

import {
    LOGO_CONTENT_TYPES,
    LOGO_MAX_BYTES,
} from "../organizations/business-logo";

/**
 * A site's icon (DEC-121): what a browser tab, a bookmark and a phone's
 * home screen show for a merchant's site.
 *
 * Which one a site shows, in order:
 *  1. its own, set in Website › Settings and published (the snapshot's
 *     `site.icon`);
 *  2. the business logo from Settings › Business, read live;
 *  3. neither: the renderer draws a plain tile with the site's initial in
 *     the site's own colours. Never Saroh's mark.
 *
 * The site's own icon is draft state, like the share image: saved on the
 * Site, live at the next publish. The logo that stands in is the
 * business's and applies at once.
 */

/** What an icon may be: the business logo's rule (no SVG; `business-logo.ts`). */
export const SITE_ICON_CONTENT_TYPES = LOGO_CONTENT_TYPES;

/** 1 MB, as the logo: a tab draws it at 16px. */
export const SITE_ICON_MAX_BYTES = LOGO_MAX_BYTES;

/** Why a library object cannot be the site icon, or null. */
export function siteIconProblem(media: {
    contentType: string;
    sizeBytes: number;
}): string | null {
    if (!SITE_ICON_CONTENT_TYPES.includes(media.contentType)) {
        return "A site icon is a PNG, JPG or WebP image.";
    }
    if (media.sizeBytes > SITE_ICON_MAX_BYTES) {
        return "A site icon is under 1 MB. Choose a smaller image.";
    }
    return null;
}

/** The icon as a Publication snapshot holds it (`site.icon`). */
export interface SnapshotIcon {
    url: string;
    /** Its media type, so the page can declare it; null when unknown. */
    type: string | null;
}

/** What `draftIcon` reads off a site. */
export interface DraftIconFields {
    iconUrl: string | null;
    iconMedia: { contentType: string } | null;
}

/** The select that loads {@link DraftIconFields}. */
export const DRAFT_ICON_SELECT = {
    iconUrl: true,
    iconMedia: { select: { contentType: true } },
} as const;

/** A known icon type, or null: never a type the page should not declare. */
function iconType(value: unknown): string | null {
    return typeof value === "string" && SITE_ICON_CONTENT_TYPES.includes(value)
        ? value
        : null;
}

/** The site's own icon as publish would write it, or null for none. */
export function draftIcon(site: DraftIconFields): SnapshotIcon | null {
    if (!site.iconUrl) return null;
    return {
        url: site.iconUrl,
        type: iconType(site.iconMedia?.contentType),
    };
}

/**
 * The icon a snapshot holds, read forgivingly: a snapshot published before
 * icons has none, and nothing but a web address is ever handed on.
 */
export function snapshotIcon(snapshot: unknown): SnapshotIcon | null {
    if (snapshot === null || typeof snapshot !== "object") return null;
    const site = (snapshot as { site?: unknown }).site;
    if (site === null || typeof site !== "object") return null;
    const icon = (site as { icon?: unknown }).icon;
    if (icon === null || typeof icon !== "object") return null;
    const { url, type } = icon as { url?: unknown; type?: unknown };
    if (typeof url !== "string" || !/^https?:\/\/\S+$/i.test(url)) return null;
    return { url, type: iconType(type) };
}

/** The icon a site shows, and whose it is. */
export interface PublicSiteIcon extends SnapshotIcon {
    /** `site`: its own, published. `business`: the business logo. */
    source: "site" | "business";
}

/** The business logo as an icon, read live; null when there is none. */
async function businessLogoIcon(
    organizationId: string,
): Promise<SnapshotIcon | null> {
    const profile = await runInOrgContext(organizationId, () =>
        prisma.businessProfile.findUnique({
            where: { organizationId },
            select: {
                logoUrl: true,
                logoMedia: { select: { contentType: true } },
            },
        }),
    );
    if (!profile?.logoUrl) return null;
    return {
        url: profile.logoUrl,
        type: iconType(profile.logoMedia?.contentType),
    };
}

/**
 * PUBLIC: the icon the renderer puts in a page's head, resolved here so it
 * makes no extra request: the snapshot's own, else the business logo, else
 * null (the renderer then draws the plain tile). The organization comes
 * from the Site, never from the caller.
 *
 * A logo that cannot be read leaves the plain tile rather than failing the
 * page: an icon is never worth a 500.
 */
export async function publicSiteIcon(
    snapshot: unknown,
    organizationId: string,
): Promise<PublicSiteIcon | null> {
    const own = snapshotIcon(snapshot);
    if (own) return { ...own, source: "site" };
    const logo = await businessLogoIcon(organizationId).catch(() => null);
    return logo ? { ...logo, source: "business" } : null;
}

/** The icon as Website › Settings reads it. */
export interface SiteIconView {
    /** The site's own icon as saved (draft); null when it has none. */
    own: { url: string; mediaId: string | null } | null;
    /** The business logo that stands in without one; null when there is none. */
    businessLogoUrl: string | null;
}

/** {@link SiteIconView} for a site of this business. */
export async function siteIconView(
    organizationId: string,
    site: { iconUrl: string | null; iconMediaId: string | null },
): Promise<SiteIconView> {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { logoUrl: true },
    });
    return {
        own: site.iconUrl
            ? { url: site.iconUrl, mediaId: site.iconMediaId }
            : null,
        businessLogoUrl: profile?.logoUrl ?? null,
    };
}
