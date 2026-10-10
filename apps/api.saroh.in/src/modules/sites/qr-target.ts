import { randomInt } from "node:crypto";

import type { Prisma } from "@saroh/database";

import { trimTrailingSlashes } from "../../common/paths";

/**
 * A QR code's short id, its lists, and where it points.
 *
 * A code holds a short link, `<address>.saroh.app/q/<code>`, never the page
 * itself. What it opens is stored as a kind and, for a product or a page, the
 * row's id; the address is worked out when the code is scanned
 * ({@link qrTargetPath}), so a renamed product or a moved page still opens
 * and a code can be pointed somewhere new without reprinting.
 *
 * Shared by the workspace's side (`qr-codes.service.ts`) and the public scan
 * (`public-qr.service.ts`), so the two can't disagree about what a code
 * opens.
 */

/** What a code can open. */
export const QR_TARGET_KINDS = [
    "SITE",
    "SHOP",
    "BOOK",
    "PRODUCT",
    "PAGE",
] as const;
export type QrTargetKind = (typeof QR_TARGET_KINDS)[number];

/** Where a code is placed. */
export const QR_PLACES = [
    "COUNTER",
    "MIRROR",
    "CARD",
    "FLYER",
    "OTHER",
] as const;
export type QrPlace = (typeof QR_PLACES)[number];

/** How a code is drawn. Only BRANDED is the plan's to allow. */
export const QR_STYLES = ["PLAIN", "BRANDED"] as const;
export type QrStyle = (typeof QR_STYLES)[number];

/** The catalogue row a branded code, print files and scan counts sit on. */
export const QR_BRANDING_ROW = "qr-branding";

/** The colour a code is drawn in when none is chosen. */
export const QR_INK = "#1c1c1a";

export function isQrTargetKind(value: unknown): value is QrTargetKind {
    return (QR_TARGET_KINDS as readonly unknown[]).includes(value);
}

/** Whether a kind names a row (a product, a page) or stands alone. */
export function qrTargetNeedsRef(kind: QrTargetKind): boolean {
    return kind === "PRODUCT" || kind === "PAGE";
}

// ---------------------------------------------------------------------------
// The short id
// ---------------------------------------------------------------------------

/**
 * What a short id is made of: digits and lower-case letters with no
 * look-alikes (no 0, 1, i, l, o) and no vowels, so one never spells a word.
 */
export const QR_CODE_ALPHABET = "23456789bcdfghjkmnpqrstvwxyz";
export const QR_CODE_MIN_LENGTH = 3;
export const QR_CODE_MAX_LENGTH = 6;

/**
 * What a short link may carry: looser than the alphabet on purpose, so the
 * alphabet can change without old paper turning into a bad request.
 */
export const QR_CODE_SHAPE = /^[0-9a-z]{3,6}$/;

/** How many times creating a code tries a fresh id before giving up. */
export const QR_CODE_ATTEMPTS = 10;

/**
 * How long the id is on the nth try (from 0): three characters at first,
 * one more every few collisions, six at most. A site with a few codes gets
 * the shortest link; a crowded one still finds a free id.
 */
export function qrCodeLength(attempt: number): number {
    const grown = QR_CODE_MIN_LENGTH + Math.floor(Math.max(0, attempt) / 3);
    return Math.min(QR_CODE_MAX_LENGTH, grown);
}

/** A fresh short id. `pick` is `randomInt`, replaced in tests. */
export function newQrCode(
    length: number = QR_CODE_MIN_LENGTH,
    pick: (max: number) => number = randomInt,
): string {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += QR_CODE_ALPHABET[pick(QR_CODE_ALPHABET.length)] ?? "";
    }
    return out;
}

// ---------------------------------------------------------------------------
// The colour
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/;

/** "#RRGGBB" as stored: lower case. Null for anything else. */
export function normaliseQrColor(value: string): string | null {
    const hex = value.trim().toLowerCase();
    return HEX.test(hex) ? hex : null;
}

function channel(value: number): number {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** A colour's contrast against white, from 1 (white) to 21 (black). */
export function contrastOnWhite(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance =
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return 1.05 / (luminance + 0.05);
}

/** The least contrast against white a camera reads reliably. */
export const QR_MIN_CONTRAST = 4;

/** Whether a code drawn in this colour on white would be hard to scan. */
export function tooLightToScan(hex: string): boolean {
    return contrastOnWhite(hex) < QR_MIN_CONTRAST;
}

// ---------------------------------------------------------------------------
// The tag a scan leaves on the address
// ---------------------------------------------------------------------------

/**
 * What the redirect adds to the page's address: `?src=qr-<code>`. A booking
 * or an order made from that page carries it back, and the API stores which
 * code it was ({@link qrSourceCode}).
 */
export const QR_SOURCE_PARAM = "src";
export const QR_SOURCE_PREFIX = "qr-";

/** The code a tag names, or null for anything that isn't one. */
export function codeOfQrSource(tag: string | null | undefined): string | null {
    if (!tag?.startsWith(QR_SOURCE_PREFIX)) return null;
    const code = tag.slice(QR_SOURCE_PREFIX.length).toLowerCase();
    return QR_CODE_SHAPE.test(code) ? code : null;
}

/** The longest tag there can be: the prefix and a six-character code. */
export const QR_SOURCE_TAG_MAX = QR_SOURCE_PREFIX.length + QR_CODE_MAX_LENGTH;

/**
 * A request's `source` as a DTO keeps it: the tag when it is a well-formed
 * one, otherwise nothing at all. A booking or an order is never refused
 * over where it came from, so anything else (a number, a long string, a
 * tag for something that isn't a QR code) is dropped here, before
 * validation, rather than answered with a 400.
 */
export function qrSourceTagOf(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length > QR_SOURCE_TAG_MAX) {
        return undefined;
    }
    return codeOfQrSource(value) === null ? undefined : value;
}

/**
 * What `Booking.sourceCode` and `Order.sourceCode` hold for a code: its
 * row's id. Not the short id, which is unique only within one site, and a
 * business can have more than one. The one place that decides it, so what
 * the booking and checkout writes store is what the list counts.
 */
export function qrSourceCode(code: { id: string }): string {
    return code.id;
}

// ---------------------------------------------------------------------------
// Where a code points
// ---------------------------------------------------------------------------

type TargetDb = Pick<
    Prisma.TransactionClient,
    "product" | "page" | "publication"
>;

/** The site a target is resolved on. */
export interface QrTargetSite {
    id: string;
    organizationId: string;
    /** The storefront it sells from (`Site.storefrontId`); null: none. */
    storefrontId: string | null;
    currentPublicationId: string | null;
}

/** A page's address as the renderer matches it. */
function pagePath(path: string): string {
    const trimmed = trimTrailingSlashes(path.trim());
    if (trimmed === "") return "/";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * A published product sold where the site sells from, by id. A storefront
 * that has since closed sells nothing, as `effectiveStorefront` reads it.
 */
export async function qrProduct(
    db: TargetDb,
    site: QrTargetSite,
    productId: string,
): Promise<{ id: string; name: string; slug: string } | null> {
    if (!site.storefrontId) return null;
    return db.product.findFirst({
        where: {
            id: productId,
            organizationId: site.organizationId,
            status: "PUBLISHED",
            listings: {
                some: {
                    storeId: site.storefrontId,
                    store: { deletedAt: null },
                },
            },
        },
        select: { id: true, name: true, slug: true },
    });
}

/**
 * A free-form page of the site that is in what the site shows now, by id:
 * not hidden, and at an address the current publication holds. A page that
 * was moved in the draft and not published since is not there yet.
 */
export async function qrPage(
    db: TargetDb,
    site: QrTargetSite,
    pageId: string,
): Promise<{ id: string; title: string; path: string } | null> {
    if (!site.currentPublicationId) return null;
    const page = await db.page.findFirst({
        where: {
            id: pageId,
            siteId: site.id,
            organizationId: site.organizationId,
            kind: "FREE",
            hidden: false,
        },
        select: { id: true, title: true, path: true },
    });
    if (!page) return null;
    const path = pagePath(page.path);
    // Asked of the database, so a scan never loads the whole snapshot.
    const published = await db.publication.count({
        where: {
            id: site.currentPublicationId,
            siteId: site.id,
            snapshot: { path: ["pages"], array_contains: [{ path }] },
        },
    });
    return published > 0 ? { id: page.id, title: page.title, path } : null;
}

/** What a code opens, as the workspace lists it. */
export interface QrTargetLook {
    /** The product's or page's own name; a plain word for the others. */
    name: string;
    /** The address on the site it opens; null while it can't be opened. */
    path: string | null;
}

const FIXED: Record<"SITE" | "SHOP" | "BOOK", QrTargetLook> = {
    SITE: { name: "Website", path: "/" },
    SHOP: { name: "Shop", path: "/shop" },
    BOOK: { name: "Booking page", path: "/book" },
};

/**
 * What a code opens now: its name and its address on the site. `path` is
 * null when the product or page it named is gone, unpublished or no longer
 * sold on this site; a scan then forwards to the home page.
 *
 * The site's own pages (`/`, `/shop`, `/book`) are never checked here: each
 * says for itself when it is closed, and that is a better answer than a
 * code that quietly goes somewhere else.
 */
export async function qrTargetLook(
    db: TargetDb,
    site: QrTargetSite,
    target: { targetKind: string; targetRef: string | null },
): Promise<QrTargetLook> {
    switch (target.targetKind) {
        case "SITE":
        case "SHOP":
        case "BOOK":
            return FIXED[target.targetKind];
        case "PRODUCT": {
            const product = target.targetRef
                ? await qrProduct(db, site, target.targetRef)
                : null;
            return product
                ? {
                      name: product.name,
                      path: `/shop/${encodeURIComponent(product.slug)}`,
                  }
                : { name: "A product no longer in your shop", path: null };
        }
        case "PAGE": {
            const page = target.targetRef
                ? await qrPage(db, site, target.targetRef)
                : null;
            return page
                ? { name: page.title, path: page.path }
                : { name: "A page no longer on your site", path: null };
        }
        default:
            return { name: "Website", path: null };
    }
}

/** The address a scan forwards to; null: the home page. */
export async function qrTargetPath(
    db: TargetDb,
    site: QrTargetSite,
    target: { targetKind: string; targetRef: string | null },
): Promise<string | null> {
    return (await qrTargetLook(db, site, target)).path;
}
