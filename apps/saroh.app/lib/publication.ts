import { env } from "@/env";

/**
 * Public publication client for the multi-tenant renderer (S2-006).
 *
 * This talks ONLY to the PUBLIC read API (S2-005) on api.saroh.in — no auth,
 * no cookies, no org scoping. The single thing it can ever read back is a
 * site's CURRENT immutable {@link PublicationSnapshot}; by design the API
 * returns 404 for unpublished/unknown sites and NEVER exposes drafts. So a
 * `null` here means "nothing published" → the caller renders a clean 404 and
 * there is simply no draft data reachable from this app to render instead.
 *
 * Prisma / `@saroh/database` is intentionally NOT imported here (ESLint forbids
 * it in frontends). The snapshot + section-content types below are a LOCAL
 * replica of `packages/database/src/cms/section-contract.ts` (v1). If the
 * server contract gains a new version, add it here — unknown section types are
 * rendered as nothing (forward-compatible), never crash.
 */

const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

// ---------------------------------------------------------------------------
// Section content shapes — local replica of the v1 section contract.
// ---------------------------------------------------------------------------

/** A call-to-action button (shared building block + the `cta` section). */
export interface CtaContent {
    label: string;
    href: string;
    style?: "primary" | "secondary" | "link";
}

/** An image reference (shared building block). */
export interface ImageContent {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
}

/** `hero` v1 — a headline block with optional CTA + image. */
export interface HeroContent {
    heading: string;
    subheading?: string;
    cta?: CtaContent;
    image?: ImageContent;
}

/**
 * `richText` v1 — authorable rich content. `value` is HTML or markdown that
 * was ALREADY SANITIZED server-side at publish (the publish step runs the
 * contract's `sanitizedFields` through an HTML sanitizer before writing the
 * immutable snapshot). The renderer therefore treats it as trusted, controlled
 * content — see the safety note in `components/sections/rich-text.tsx`.
 */
export interface RichTextContent {
    format: "html" | "markdown";
    value: string;
}

/** `gallery` v1 — an ordered set of images. */
export interface GalleryContent {
    images: ImageContent[];
    layout?: "grid" | "carousel" | "masonry";
}

/** One field descriptor snapshotted into an `enquiry` section. */
export interface EnquiryField {
    name: string;
    label: string;
    type: "text" | "email" | "tel" | "textarea";
    required?: boolean;
}

/**
 * `enquiry` v1 — a public enquiry form. `formId` names the backing Form the
 * PUBLIC submit endpoint validates against and derives the owning org from (so
 * the visitor's POST can only ever create a lead in that Form's org). `fields`
 * is the snapshot the renderer draws the inputs from. All values are plain
 * text — nothing here was authored HTML, so no sanitization is involved.
 */
export interface EnquiryContent {
    formId?: string;
    title?: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
    fields: EnquiryField[];
}

/**
 * `booking` v1 — a public booking widget. `serviceId` names the bookable
 * Service the PUBLIC availability + book endpoints resolve the owning org from
 * (so the visitor's POST can only ever create a Booking in that Service's org).
 * A section with no `serviceId` (never picked in the editor) renders nothing.
 * All values are plain text — nothing here was authored HTML.
 */
export interface BookingContent {
    serviceId?: string;
    title?: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
}

/**
 * A single section as it appears in a publication snapshot. `content` is
 * deliberately `unknown`: it arrives as JSON, so the {@link SectionRenderer}
 * narrows it per `type` at the point of use. Unknown `type`s render nothing.
 */
export interface Section {
    type: string;
    contractVersion: number;
    content: unknown;
}

/** One page of a publication snapshot. */
export interface PublicationPage {
    path: string;
    title: string | null;
    isHome: boolean;
    sections: Section[];
}

/**
 * The site-level fields a snapshot carries.
 *
 * Everything but `name`/`slug` is optional because publications are immutable
 * and go back to Stage 2: a row written before #188 and #189 simply has none of
 * these, and must keep rendering exactly as it does today rather than 404ing or
 * showing the word "undefined".
 */
export interface PublicationSite {
    name: string;
    slug: string;
    /** Search appearance (#188). Absent or null means "not set". */
    seoTitle?: string | null;
    seoDescription?: string | null;
    /** The share image a link preview uses (#188). */
    socialImageUrl?: string | null;
    /**
     * The merchant's look, already resolved into `--site-*` custom properties
     * (#189).
     *
     * RESOLVED by the publisher, not by this app. Turning "clay" into an HSL
     * triple here would mean keeping a second copy of the palette in the
     * renderer, and a copy that drifts is how a merchant styles one thing and
     * publishes another. It also keeps the snapshot honest: this is the site as
     * it was served, so retuning a swatch later does not restyle work that is
     * already published.
     */
    styleVariables?: Record<string, string> | null;
}

/**
 * The self-contained, immutable publication snapshot — the ONLY thing the
 * renderer draws from. Drafts are never part of this by design.
 */
export interface PublicationSnapshot {
    site: PublicationSite;
    pages: PublicationPage[];
    publishedAt: string;
}

/** The public API wraps the snapshot alongside its publish timestamp. */
interface PublicSiteView {
    snapshot: PublicationSnapshot;
    publishedAt: string;
}

// ---------------------------------------------------------------------------
// Host → subdomain resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an incoming host header to a platform subdomain.
 *
 * Middleware has already normalized dev hosts (`*.localhost:3003` →
 * `*.<ROOT_DOMAIN>`), so `demo.saroh.app` → `demo`. We strip the
 * `.<ROOT_DOMAIN>` suffix when present; otherwise (a custom/apex domain, or a
 * bare host) we fall back to the first DNS label. Returns null when there is
 * no meaningful subdomain to look up.
 */
export function subdomainFromHost(
    host: string | null | undefined,
): string | null {
    if (!host) return null;
    // Drop any port and lowercase.
    const hostname = host.split(":")[0]?.toLowerCase().trim();
    if (!hostname) return null;

    const root = env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase();
    if (root && hostname.endsWith(`.${root}`)) {
        const sub = hostname.slice(0, -1 * (root.length + 1));
        // `www` is not a tenant.
        if (!sub || sub === "www") return null;
        // Only the left-most label is the tenant subdomain.
        return sub.split(".")[0] ?? null;
    }

    // Custom/apex domain or bare host: use the first label if it looks like a
    // subdomain (host has more than one label), else there is no subdomain.
    const labels = hostname.split(".");
    if (labels.length <= 1) return null;
    const first = labels[0];
    if (!first || first === "www") return null;
    return first;
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

/**
 * Fetch a site's CURRENT publication snapshot by platform subdomain.
 * Returns the typed snapshot, or `null` when the API answers 404
 * (unpublished/unknown site) or the request otherwise fails. Server-side,
 * uncached (`no-store`) so a fresh publish is reflected immediately.
 */
export async function getPublicationBySubdomain(
    subdomain: string,
): Promise<PublicationSnapshot | null> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/sites/by-subdomain/${encodeURIComponent(subdomain)}`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        // Network/DNS error — treat as "not renderable" rather than throwing a
        // 500 at an anonymous visitor.
        return null;
    }

    // 404 (or anything non-OK) → no publication to render. Drafts are never
    // reachable here, so there is no fallback content by design.
    if (!res.ok) return null;

    const body = (await res.json()) as PublicSiteView | null;
    return body?.snapshot ?? null;
}

/**
 * Convenience: resolve an incoming host to its subdomain and fetch that
 * tenant's current publication snapshot. Returns `null` for hosts without a
 * resolvable subdomain or with no publication.
 */
export async function getPublicationForHost(
    host: string | null | undefined,
): Promise<PublicationSnapshot | null> {
    const subdomain = subdomainFromHost(host);
    if (!subdomain) return null;
    return getPublicationBySubdomain(subdomain);
}

// ---------------------------------------------------------------------------
// Snapshot navigation helpers
// ---------------------------------------------------------------------------

/** Normalize a request path for matching against page `path`s. */
function normalizePath(path: string): string {
    if (!path || path === "/") return "/";
    // Strip a trailing slash (but keep the leading one).
    const trimmed = path.replace(/\/+$/, "");
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** The home page of a snapshot: the `isHome` page, else the first page. */
export function findHomePage(
    snapshot: PublicationSnapshot,
): PublicationPage | null {
    return snapshot.pages.find((p) => p.isHome) ?? snapshot.pages.at(0) ?? null;
}

/**
 * Find the page whose `path` matches `requestPath`. `/` (or empty) resolves to
 * the home page. Matching is tolerant of a leading/trailing slash mismatch.
 */
export function findPageByPath(
    snapshot: PublicationSnapshot,
    requestPath: string,
): PublicationPage | null {
    const wanted = normalizePath(requestPath);
    if (wanted === "/") return findHomePage(snapshot);
    return snapshot.pages.find((p) => normalizePath(p.path) === wanted) ?? null;
}
