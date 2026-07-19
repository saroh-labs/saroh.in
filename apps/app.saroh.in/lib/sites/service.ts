import { cookies, headers } from "next/headers";

import { env } from "@/env";

/**
 * CMS Sites data access for app.saroh.in (S2-004). Every call is org-scoped:
 * the active organization id (from the `active_org` cookie) is used both in the
 * path (`/organizations/:organizationId/...`) and forwarded as the
 * `x-organization-id` header — mirroring `lib/organizations/service.ts`. The
 * request's session cookie is forwarded so api.saroh.in derives the user and
 * enforces org membership. Server-only: imports next/headers.
 *
 * The app never imports @saroh/database — the section content types below are a
 * hand-maintained mirror of the versioned section contract
 * (packages/database/src/cms/section-contract.ts), reached only through the API.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

/** Cookie holding the active organization id (readable server-side). */
const ACTIVE_ORG_COOKIE = "active_org";

// ---------------------------------------------------------------------------
// Section content types — mirror of the section contract (v1)
// ---------------------------------------------------------------------------

/** The section types the editor supports. */
export type SectionType = "hero" | "richText" | "cta" | "gallery" | "enquiry";

/** Button style shared by hero CTA and the standalone cta section. */
export type CtaStyle = "primary" | "secondary" | "link";

export interface CtaValue {
    label: string;
    href: string;
    style?: CtaStyle;
}

export interface ImageValue {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
}

export interface HeroContent {
    heading: string;
    subheading?: string;
    cta?: CtaValue;
    image?: ImageValue;
}

export interface RichTextContent {
    format: "html" | "markdown";
    value: string;
}

export type CtaContent = CtaValue;

export type GalleryLayout = "grid" | "carousel" | "masonry";

export interface GalleryContent {
    images: ImageValue[];
    layout?: GalleryLayout;
}

/** The field types an enquiry form supports (mirror of the section contract). */
export type EnquiryFieldType = "text" | "email" | "tel" | "textarea";

/** One authored field in an enquiry section (snapshot of the backing Form). */
export interface EnquiryField {
    name: string;
    label: string;
    type: EnquiryFieldType;
    required?: boolean;
}

/**
 * `enquiry` v1 — a public enquiry form. `formId` points at the backing Form the
 * public submit endpoint validates against; the editor syncs it on save (it is
 * absent until then). `fields` is the authored field list mirrored onto that
 * Form.
 */
export interface EnquiryContent {
    formId?: string;
    title?: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
    fields: EnquiryField[];
}

/** Content shape keyed by section type. */
export interface SectionContentByType {
    hero: HeroContent;
    richText: RichTextContent;
    cta: CtaContent;
    gallery: GalleryContent;
    enquiry: EnquiryContent;
}

/**
 * A section discriminated on `type`, so narrowing on `type` gives the exact
 * `content` shape. Used by the editor and preview.
 */
export type Section = {
    [K in SectionType]: {
        type: K;
        contractVersion: number;
        content: SectionContentByType[K];
    };
}[SectionType];

/** A section as returned by the draft endpoint (carries its order). */
export type DraftSection = Section & { order: number };

/** The payload the editor PUTs back (no order — array position is the order). */
export type SectionInput = Section;

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

export interface Template {
    id: string;
    version: number;
    name: string;
    description?: string;
}

export interface SiteSummary {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    status?: string;
}

export interface SitePage {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
}

export interface SiteDetail extends SiteSummary {
    pages: SitePage[];
}

export interface PageDraft {
    pageVersionId: string;
    sections: DraftSection[];
}

export interface CreateSiteInput {
    templateId?: string;
    templateVersion?: number;
    name: string;
    slug?: string;
    subdomain?: string;
}

/** Discriminated result so the UI can surface a message (and, on save, the
 * failing section index the API names in a 400). */
export type SitesResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: string; index?: number };

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

async function getActiveOrgId(): Promise<string | null> {
    return (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    const activeOrgId = await getActiveOrgId();
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(activeOrgId ? { "x-organization-id": activeOrgId } : {}),
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** Base path for the active org's sites, or null when no org is active. */
async function sitesBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/sites` : null;
}

/** Extract a human message (+ optional index) from a JSON error body. */
function readError(
    data: { message?: string; error?: string; index?: number } | null,
    fallback: string,
): { error: string; index?: number } {
    return {
        error: data?.message ?? data?.error ?? fallback,
        index: typeof data?.index === "number" ? data.index : undefined,
    };
}

// ---------------------------------------------------------------------------
// Reads (called from server components)
// ---------------------------------------------------------------------------

/** Templates available to seed a new site. Empty on any failure. */
export async function listTemplates(): Promise<Template[]> {
    const base = await sitesBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/templates`);
    if (!res.ok) return [];
    return (await res.json()) as Template[];
}

/** The active org's sites (newest first). Empty on any failure. */
export async function listSites(): Promise<SiteSummary[]> {
    const base = await sitesBase();
    if (!base) return [];
    const res = await apiFetch(base);
    if (!res.ok) return [];
    return (await res.json()) as SiteSummary[];
}

/** A site + its pages, or null when missing / not permitted. */
export async function getSite(siteId: string): Promise<SiteDetail | null> {
    const base = await sitesBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/${siteId}`);
    if (!res.ok) return null;
    return (await res.json()) as SiteDetail;
}

/** The current editable draft for a page (the API creates one if none). */
export async function getPageDraft(
    siteId: string,
    pageId: string,
): Promise<PageDraft | null> {
    const base = await sitesBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/${siteId}/pages/${pageId}/draft`);
    if (!res.ok) return null;
    return (await res.json()) as PageDraft;
}

// ---------------------------------------------------------------------------
// Mutations (wrapped by server actions in ./actions)
// ---------------------------------------------------------------------------

/** Create a draft site from a template. Returns the new id + slug. */
export async function createSite(
    input: CreateSiteInput,
): Promise<SitesResult<{ siteId: string; slug: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(base, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as {
        siteId?: string;
        slug?: string;
        message?: string;
        error?: string;
        field?: string;
    } | null;
    if (res.ok && data?.siteId) {
        return {
            ok: true,
            data: { siteId: data.siteId, slug: data.slug ?? "" },
        };
    }
    return {
        ok: false,
        field: data?.field,
        ...readError(data, "Could not create the site"),
    };
}

/**
 * Replace a page draft's sections. The API validates each section against the
 * section contract; a 400 names the failing index + reason, surfaced here so
 * the editor can point at the bad section.
 */
export async function saveDraftSections(
    siteId: string,
    pageId: string,
    sections: SectionInput[],
): Promise<SitesResult<{ pageVersionId?: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/${siteId}/pages/${pageId}/draft/sections`,
        {
            method: "PUT",
            body: JSON.stringify({ sections }),
        },
    );
    const data = (await res.json().catch(() => null)) as {
        pageVersionId?: string;
        message?: string;
        error?: string;
        index?: number;
    } | null;
    if (res.ok) {
        return { ok: true, data: { pageVersionId: data?.pageVersionId } };
    }
    return { ok: false, ...readError(data, "Could not save the sections") };
}

/** Publish an immutable snapshot of the site's current drafts. */
export async function publishSite(
    siteId: string,
): Promise<SitesResult<{ publicationId?: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/publish`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as {
        publicationId?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok) {
        return { ok: true, data: { publicationId: data?.publicationId } };
    }
    return { ok: false, ...readError(data, "Could not publish the site") };
}
