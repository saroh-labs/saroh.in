import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId, getJson, getList } from "@/lib/api/http";
import type { PlanRefusal } from "@/lib/billing/refusal";
import { planRefusalOf } from "@/lib/billing/refusal";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

// Re-exported so callers keep one import site for "everything about a site",
// while the pure half stays in a module a client component can reach.
export { resolveStyleVariables } from "@/lib/sites/style";
export type {
    SiteStyle,
    SiteStyleOptions,
    StyleSwatch,
} from "@/lib/sites/style";

/**
 * CMS Sites data access for app.saroh.in (S2-004). Every call is org-scoped:
 * the active organization id (from the `active_org` cookie) is used both in the
 * path (`/organizations/:organizationId/...`) and forwarded as the
 * `x-organization-id` header — mirroring `lib/organizations/service.ts`. The
 * request's session cookie is forwarded so api.saroh.in derives the user and
 * enforces org membership. Server-only: imports next/headers (via the shared
 * HTTP plumbing).
 *
 * The app never imports @saroh/database — the section content types below are a
 * hand-maintained mirror of the versioned section contract
 * (packages/database/src/cms/section-contract.ts), reached only through the API.
 */

// ---------------------------------------------------------------------------
// Section content types — mirror of the section contract (v1)
// ---------------------------------------------------------------------------

/**
 * The section types the editor supports.
 *
 * RE-EXPORTED, not redeclared. This was a hand-written union listing the six
 * types, which is a fourth place the set of blocks lived — and it went stale the
 * first time a block was added (#255): the compiler rejected `features`
 * everywhere while `SECTION_TYPES` already had it.
 *
 * Taking it from the contract means a block added there is a block this app
 * knows about, and the exhaustive `Record<SectionType, …>` maps in the editor
 * start demanding their entries instead of silently accepting six.
 */
import type { SectionType } from "@saroh/block-contract";
import type { SiteChangeKind } from "./pending";

export type { SectionType };

/** Button style shared by hero CTA and the standalone cta section. */
export type CtaStyle = "primary" | "secondary" | "link";

/** What a button does (#207). Mirrors `ctaActionSchema` in the contract. */
export type CtaAction =
    | { kind: "page"; pageId: string }
    | { kind: "url"; href: string }
    | { kind: "email"; address: string; subject?: string }
    | { kind: "call"; number: string }
    | { kind: "whatsapp"; number: string; message?: string };

export type CtaKind = CtaAction["kind"];

/**
 * A button as the editor holds it. v1 carries `href`; v2 carries `action`.
 * Both are optional here because a section may be either, and the editor
 * lifts v1 → v2 the first time the button is touched (see `liftCta`).
 */
export interface CtaValue {
    label: string;
    href?: string;
    action?: CtaAction;
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
    /** One photo beside the text (G7). */
    image?: ImageValue;
    /** Which side the photo sits on; absent is the right. */
    imageSide?: "left" | "right";
}

export type CtaContent = CtaValue;

export type GalleryLayout = "grid" | "carousel" | "masonry";

export interface GalleryContent {
    images: ImageValue[];
    layout?: GalleryLayout;
}

/** One point in a features section (mirror of the section contract). */
export interface FeatureItem {
    title: string;
    body?: string;
}

/** `features` — a heading over a set of short, titled points. */
export interface FeaturesContent {
    heading?: string;
    intro?: string;
    items: FeatureItem[];
}

/** One question in an FAQ section (mirror of the section contract). */
export interface FaqItem {
    question: string;
    answer: string;
}

/** `faq` — questions and their answers. */
export interface FaqContent {
    heading?: string;
    intro?: string;
    items: FaqItem[];
}

/** One quote in a testimonials section (mirror of the section contract). */
export interface TestimonialItem {
    quote: string;
    name: string;
    role?: string;
}

/** `testimonials` — what customers said, under their names. */
export interface TestimonialsContent {
    heading?: string;
    items: TestimonialItem[];
}

/** One piece of work in a projects section (mirror of the section contract). */
export interface ProjectItem {
    image?: ImageValue;
    title: string;
    summary?: string;
    /** A web address, an email or phone link, or a path on this site. */
    link?: string;
}

/** `projects` — the merchant's own work, typed in (K11). Up to 24. */
export interface ProjectsContent {
    title?: string;
    items: ProjectItem[];
}

/** `contact` — where to find the business and how to reach it. */
export interface ContactContent {
    heading?: string;
    intro?: string;
    address?: string;
    hours?: string;
    phone?: string;
    email?: string;
    whatsapp?: string;
    mapUrl?: string;
}

/**
 * `servicesList` — which of the org's Services to show, in order. Their names
 * and prices are read live by the site, not stored here.
 */
export interface ServicesListContent {
    heading?: string;
    intro?: string;
    serviceIds: string[];
    showPrices?: boolean;
    cta?: CtaValue;
    /** Display options (G16). Absent: a list, descriptions shown, "Book". */
    layout?: ListLayout;
    showDescriptions?: boolean;
    buttonLabel?: string;
}

/** "Show as" (G16): side by side, or one per row. */
export type ListLayout = "cards" | "list";

/**
 * `visitUs` — which shop's address and hours to show (G8). The place itself is
 * read live by the site, never stored here. Both switches read as on when
 * absent.
 */
export interface VisitUsContent {
    title?: string;
    storeId?: string;
    showMap?: boolean;
    showHours?: boolean;
}

/**
 * `journal` — how the site's latest posts show (G10). The posts themselves
 * are read live by the site, never stored here. `count` is 3 or 6 (absent:
 * 3); both switches read as on when absent.
 */
export interface JournalContent {
    title?: string;
    count?: 3 | 6;
    showExcerpts?: boolean;
    showImages?: boolean;
    /** Display options (G16). Absent: cards, and no button of their own. */
    layout?: ListLayout;
    buttonLabel?: string;
}

/**
 * `plans` — how the business's plans on sale show (G9). The plans themselves
 * are read live by the site, never stored here. `highlight` absent means
 * `first`; `showDescriptions` absent means shown.
 */
export interface PlansContent {
    title?: string;
    highlight?: "first" | "none";
    buttonLabel?: string;
    showDescriptions?: boolean;
    /** Display options (G16). Absent: cards, with prices. */
    layout?: ListLayout;
    showPrices?: boolean;
}

/**
 * `productGrid` — which products from the catalogue show (G12): the newest,
 * a collection's or picked by hand, by id. The products themselves are read
 * live by the site, never stored here. `source` absent means `newest`,
 * `count` absent four, `showPrices` absent shown.
 */
export interface ProductGridContent {
    title?: string;
    source?: "newest" | "collection" | "picked";
    collectionId?: string;
    productIds?: string[];
    count?: number;
    showPrices?: boolean;
    /**
     * Display options (G16). Absent: cards with photos and lines, and no
     * button (the card opens the product).
     */
    layout?: ListLayout;
    showPhotos?: boolean;
    showDescriptions?: boolean;
    buttonLabel?: string;
}

/**
 * `packs` — how the business's class packs on sale show (G20). The packs
 * themselves are read live by the site, never stored here.
 * `showDescriptions` absent means shown.
 */
export interface PacksContent {
    title?: string;
    buttonLabel?: string;
    showDescriptions?: boolean;
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

/**
 * `booking` v1 — a public booking widget. `serviceId` points at the bookable
 * Service the PUBLIC availability + book endpoints resolve the owning org from;
 * it is chosen from the org's services in the editor (Services are authored in
 * the service editor, not inline) and is absent until then. All values are
 * plain text.
 */
export interface BookingContent {
    serviceId?: string;
    title?: string;
    description?: string;
    /**
     * Not drawn since A9 and not edited: booking finishes on the booking
     * page. Kept because stored sections may still carry them.
     */
    submitLabel?: string;
    successMessage?: string;
}

/** Content shape keyed by section type. */
export interface SectionContentByType {
    hero: HeroContent;
    richText: RichTextContent;
    cta: CtaContent;
    gallery: GalleryContent;
    enquiry: EnquiryContent;
    booking: BookingContent;
    features: FeaturesContent;
    faq: FaqContent;
    testimonials: TestimonialsContent;
    contact: ContactContent;
    servicesList: ServicesListContent;
    visitUs: VisitUsContent;
    journal: JournalContent;
    plans: PlansContent;
    packs: PacksContent;
    productGrid: ProductGridContent;
    projects: ProjectsContent;
}

/**
 * Layout every section carries, whatever its type (#189).
 *
 * Declared once and intersected below rather than repeated in all six content
 * interfaces, mirroring the single `paddingOverride` in the section contract —
 * six copies is six chances for one to drift.
 *
 * ABSENT means "follow the site setting". Not defaulted, because a default
 * would freeze today's site value into the section and stop it tracking the
 * slider afterwards.
 */
export interface SectionLayout {
    padding?: number;
    /**
     * Which of the block's looks this section wears (#254).
     *
     * Here rather than on each of the six content types for the same reason
     * `padding` is: it applies to every block. A plain string, not a union —
     * the set of looks is per block and lives in `BLOCK_META`, and duplicating
     * it here would put the same list in two places.
     *
     * ABSENT means the section predates variants, NOT that it wears the
     * default: `resolveVariant` reads the old shape instead, so a published
     * hero with an image stays two-column and a `gallery@1` carousel stays a
     * carousel.
     */
    variant?: string;
}

/**
 * A section discriminated on `type`, so narrowing on `type` gives the exact
 * `content` shape. Used by the editor and preview.
 */
export type Section = {
    [K in SectionType]: {
        type: K;
        contractVersion: number;
        content: SectionContentByType[K] & SectionLayout;
        /**
         * Visibility, and deliberately a sibling of `content` rather than part
         * of it: hiding a section is not an edit to what it says. A hidden
         * section keeps its place and its copy in the draft and is left out of
         * the published snapshot. ABSENT means visible.
         */
        hidden?: boolean;
        /**
         * The section's stable identity across saves (#193). Absent only for a
         * section the editor has just added, which the server then mints one
         * for. It MUST be sent back for everything else: reviewer notes are
         * pinned to it, and a save that dropped it would detach them all.
         */
        key?: string;
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
    /**
     * Null until the site has been published once. The API has always sent
     * this — `SitesService.listSites` selects it — but this interface did not
     * declare it, so the index had no way to tell a live site from a draft and
     * simply did not say. A merchant with three sites could not see which of
     * them the public could actually reach.
     */
    currentPublicationId?: string | null;
    /** When the site last went live; null if it never has. */
    currentPublication?: { publishedAt: string } | null;
    /**
     * Draft work newer than what is live. Derived server-side from
     * `pendingSectionChanges`, so it cannot say "up to date" about a site the
     * count disagrees with.
     */
    hasUnpublishedChanges?: boolean;
    /**
     * How many sections publishing would change (#190, #191). Null before the
     * first publish — there is nothing to diff against, and "never published"
     * is the more consequential thing to say.
     *
     * The editor's top bar, the settings screen and the sites list all render
     * this same number, computed once in the API.
     */
    pendingSectionChanges?: number | null;
    /**
     * Which site-level settings publishing would change (#282). Null before the
     * first publish. Described through `describePendingChanges`.
     */
    pendingSiteChanges?: SiteChangeKind[] | null;
    /** A claimed hostname that has not verified yet, if any. */
    pendingDomain?: string | null;
}

/** A menu entry names a page; the label is optional and defaults to its title. */
export interface SiteNavigationItem {
    pageId: string;
    label?: string;
}
export interface SiteNavigation {
    items: SiteNavigationItem[];
}

/** A site footer, the same `{ format, value }` a richText section carries. */
export interface SiteFooter {
    format: "html" | "markdown";
    value: string;
}

/**
 * A module page's kind (G14): one page per kind per site, beside the
 * free-form pages. Mirrors the API's `MODULE_PAGE_KINDS`, in menu order.
 */
export type ModulePageKind = "SHOP" | "BOOK" | "PRICES" | "JOURNAL" | "CONTACT";
export type PageKind = "FREE" | ModulePageKind;

export interface SitePage {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** Hidden pages stay in the draft and are left out of the snapshot (#197). */
    hidden: boolean;
    /**
     * FREE, or the module page this is (G14). Absent from an API older than
     * G14, which only ever had free-form pages.
     */
    kind?: PageKind;
    /** "Show in menu" (G14). Absent means on, as it was before G14. */
    inMenu?: boolean;
}

/**
 * What the caller may do with this site, decided by the API's policy (#275).
 *
 * Read from the server, never computed here: a screen that decides for itself
 * which buttons a role gets is a second policy, and it drifts from the one that
 * actually refuses the request.
 */
export interface SiteCapabilities {
    edit: boolean;
    publish: boolean;
    comment: boolean;
    approve: boolean;
    manageSettings: boolean;
    manageDomain: boolean;
}

export interface SiteDetail extends SiteSummary {
    /** Server-owned permission for the draft editor. */
    canEdit: boolean;
    /** Everything this caller may do here (#275). */
    can: SiteCapabilities;
    /**
     * "Publishing needs approval" (DEC-071, R10): on, Publish and restore are
     * refused and only an approved test release goes live, unless an owner
     * overrides. Absent from an older API, which reads as off.
     */
    publishNeedsApproval?: boolean;
    /** This caller is an owner who can publish: may go live past it (KTD-11). */
    canOverride?: boolean;
    pages: SitePage[];
    /** Always present on a detail read; null only before the first publish. */
    pendingSectionChanges: number | null;
    pendingSiteChanges: SiteChangeKind[] | null;
    /**
     * Search and social settings (#188). Null means "not set" and must render
     * as absent — never as an empty title or a broken image.
     */
    seoTitle: string | null;
    seoDescription: string | null;
    socialImageUrl: string | null;
    /** Facts about the share image, measured when it was chosen (#220). */
    socialImageWidth: number | null;
    socialImageHeight: number | null;
    socialImageBytes: number | null;
    /** Where this site's posts live (#232); null means the default, "blog". */
    postsPrefix: string | null;
    /**
     * What the merchant wrote at the foot of their site (#202). Null means they
     * have written nothing, and nothing renders — see `parseSiteFooter`.
     */
    footer: SiteFooter | null;
    /**
     * The same footer, sanitized by the API the way publish does (#336) —
     * the one the editor's canvas may render as markup. `footer` is for
     * editing and is never rendered as HTML here.
     */
    footerPreview: SiteFooter | null;
    /** The site's menu (#206), by page id. Null until one is built. */
    navigation: SiteNavigation | null;
    /** When the site last went live; null if it has never been published. */
    currentPublication: { publishedAt: string } | null;
    /** The site's look — always complete; absent choices come back filled. */
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    /**
     * Where the site's shop sells from (G11), and the storefronts it could.
     * Null while the shop isn't open for this business — the API's
     * `SITE_SHOP` flag, off until checkout (G13) ships — and absent from an
     * API older than G11: either way the settings show no row.
     */
    sellsFrom?: SellsFrom | null;
    /**
     * The shop could serve (SITE_SHOP, Commerce on) and a storefront with
     * products could be chosen, but Sells from is unanswered, so `/shop`
     * isn't live yet (P4). Absent from an older API: not said.
     */
    shopAwaitsSellsFrom?: boolean;
    /**
     * The module pages this caller could add now (G14): kinds whose module is
     * on and that the site doesn't have yet, in menu order. Empty without
     * `site:update`; a module that isn't rolled out is never listed
     * (DEC-057). Absent from an API older than G14.
     */
    addablePageKinds?: ModulePageKind[];
    /**
     * Whether Add block offers the Class packs block: Class packs rolled out
     * and on (DEC-057). Absent from an older API, which reads as not.
     */
    packsBlockOffered?: boolean;
    /**
     * The template the site was made from and the style chosen with it
     * (industry templates, KTD-7). Null for a site made before that was
     * recorded; absent from an older API.
     */
    template?: SiteTemplate | null;
}

/** Which template a site came from: its id, version and style, if any. */
export interface SiteTemplate {
    id: string;
    version: number;
    styleId: string | null;
}

/** The storefront a site sells from, and the open ones with products. */
export interface SellsFrom {
    /** Null: not answered yet, so the shop shows nothing live. */
    storefront: { id: string; name: string } | null;
    choices: { id: string; name: string; products: number }[];
}

/**
 * A settings change. Every field is optional and nullable, and the two are
 * different requests: OMIT a field to leave it alone, send NULL to clear it.
 * Sending the whole form every time would let a stale tab overwrite a value
 * someone else changed.
 */
export interface SiteSettingsInput {
    /**
     * The name in the site's header (G6). Never null or blank: the API
     * refuses both, because a site always has a name.
     */
    name?: string;
    seoTitle?: string | null;
    seoDescription?: string | null;
    socialImageUrl?: string | null;
    socialImageWidth?: number | null;
    socialImageHeight?: number | null;
    socialImageBytes?: number | null;
    /** Null restores the default (#232). */
    postsPrefix?: string | null;
    /** The storefront the shop sells from (G11); null clears it. */
    storefrontId?: string | null;
}

export interface PageDraft {
    pageVersionId: string;
    /**
     * Which edit of this draft the sections are (#285). Sent back on save;
     * a save against a revision the server has moved past is refused.
     */
    revision: number;
    sections: DraftSection[];
    /** What publishing would change, site-wide, as of this read (#190). */
    pendingSectionChanges: number | null;
    pendingSiteChanges: SiteChangeKind[] | null;
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
    | {
          ok: false;
          error: string;
          field?: string;
          index?: number;
          /**
           * The draft moved on under this editor (#285). A different kind of
           * failure from the rest: nothing is wrong with what the merchant
           * wrote, and retrying the same save would only overwrite someone
           * else's work — so the screen offers to reload rather than to retry.
           */
          conflict?: boolean;
          /**
           * An address to offer instead of one the API refused (G14's
           * `details.suggestion`): taken, or one of the site's own routes.
           * Offered, never applied.
           */
          suggestion?: string;
          /**
           * The API's `details.code` for a refusal a screen answers in its
           * own way: `APPROVAL_REQUIRED` while "Publishing needs approval"
           * is on (DEC-071, T9).
           */
          code?: string;
          /** Its plan refused it (U13): shown as the notice (U14). */
          plan?: PlanRefusal;
      };

// ---------------------------------------------------------------------------
// Fetch plumbing (shared apiFetch/getActiveOrgId from @/lib/api/http)
// ---------------------------------------------------------------------------

/** Base path for the active org's sites, or null when no org is active. */
async function sitesBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/sites` : null;
}

/** Extract a human message (+ optional index) from a JSON error body. */
/**
 * Pull a human-readable message out of an API error body.
 *
 * The api's envelope is `{ error: { code, message, statusCode, correlationId } }`
 * — `error` is an OBJECT, not a string. This used to be typed as
 * `{ error?: string }` and returned straight through, so every 400 handed the
 * caller an object typed as a string. Toasts crashed the page with "Objects are
 * not valid as a React child", and the editor's inline section error would have
 * done the same. TypeScript believed the annotation; the wire disagreed.
 *
 * So the shape is now checked at runtime rather than declared, and the return
 * is a string in every branch — including the one where the body is something
 * none of this anticipated.
 */
function readError(
    data: unknown,
    fallback: string,
): {
    error: string;
    index?: number;
    suggestion?: string;
    code?: string;
    plan?: PlanRefusal;
} {
    const body = (typeof data === "object" && data !== null ? data : {}) as {
        message?: unknown;
        error?: unknown;
    };

    const inner =
        typeof body.error === "object" && body.error !== null
            ? (body.error as { message?: unknown; details?: unknown })
            : undefined;

    const message = [inner?.message, body.message, body.error].find(
        (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    // A refused section names its position in `error.details.index`.
    const details = (
        typeof inner?.details === "object" && inner.details !== null
            ? inner.details
            : {}
    ) as { index?: unknown; suggestion?: unknown; code?: unknown };

    const plan = planRefusalOf(inner?.details, message);
    return {
        error: message ?? fallback,
        index: typeof details.index === "number" ? details.index : undefined,
        // Its plan refused it (U13): themes, review (U14).
        ...(plan ? { plan } : {}),
        // `APPROVAL_REQUIRED` (DEC-071, T9): the screen offers the way on.
        ...(typeof details.code === "string" ? { code: details.code } : {}),
        // An address the API offers instead of a refused one (G14).
        ...(typeof details.suggestion === "string" &&
        details.suggestion.startsWith("/")
            ? { suggestion: details.suggestion }
            : {}),
    };
}

// ---------------------------------------------------------------------------
// Reads (called from server components)
// ---------------------------------------------------------------------------

/** Templates available to seed a new site. Empty with no active org; empty when
 * none exist, but throws on a real API/network failure (#101). */
export async function listTemplates(): Promise<Template[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<Template>(`${base}/templates`);
}

/** The active org's sites (newest first). Empty with no active org / when none
 * exist, but throws on a real API/network failure (#101). */
export async function listSites(): Promise<SiteSummary[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<SiteSummary>(base);
}

/** What `/sites/new` starts from (DEC-069, L5). */
export interface NewSiteDefaults {
    siteName: string;
    /** The business's own address, or a free one like it; may be empty. */
    address: string;
}

/**
 * The name and address a new site is offered (`GET …/sites/new-defaults`).
 * Null when it can't be read (an API from before it, or a failure): the form
 * then starts empty, and the API still gives the site the business's own
 * address or says which one to use.
 */
export async function getNewSiteDefaults(): Promise<NewSiteDefaults | null> {
    const base = await sitesBase();
    if (!base) return null;
    try {
        const res = await apiFetch(`${base}/new-defaults`);
        if (!res.ok) return null;
        const data = (await res.json()) as Partial<NewSiteDefaults> | null;
        return {
            siteName: typeof data?.siteName === "string" ? data.siteName : "",
            address: typeof data?.address === "string" ? data.address : "",
        };
    } catch {
        return null;
    }
}

/** A site + its pages, or null when missing / no active org (throws on a real
 * failure). */
export async function getSite(siteId: string): Promise<SiteDetail | null> {
    const base = await sitesBase();
    if (!base) return null;
    return getJson<SiteDetail>(`${base}/${siteId}`);
}

/** The current editable draft for a page (the API creates one if none). Null on
 * a 404 / no active org; throws on a real failure. */
export async function getPageDraft(
    siteId: string,
    pageId: string,
): Promise<PageDraft | null> {
    const base = await sitesBase();
    if (!base) return null;
    return getJson<PageDraft>(`${base}/${siteId}/pages/${pageId}/draft`);
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
    } | null;
    if (res.ok && data?.siteId) {
        return {
            ok: true,
            data: { siteId: data.siteId, slug: data.slug ?? "" },
        };
    }
    const failure = toFailure(data, "Could not create the site");
    const suggestion = addressSuggestionOf(data);
    return {
        ok: false,
        error: failure.error,
        field:
            failure.field === "name" || failure.field === "subdomain"
                ? failure.field
                : undefined,
        // A free address offered for one in use (DEC-069, L5).
        ...(suggestion ? { suggestion } : {}),
    };
}

/**
 * The free web address a refusal offers (`details.suggestion` on the 409
 * for an address in use), or null. Unlike a page's suggested path it has no
 * leading `/`.
 */
export function addressSuggestionOf(body: unknown): string | null {
    const b = (typeof body === "object" && body !== null ? body : {}) as {
        error?: unknown;
        details?: unknown;
    };
    const inner =
        typeof b.error === "object" && b.error !== null
            ? (b.error as { details?: unknown })
            : b;
    const details = inner.details;
    if (typeof details !== "object" || details === null) return null;
    const said = (details as { suggestion?: unknown }).suggestion;
    return typeof said === "string" && /^[a-z0-9-]+$/.test(said) ? said : null;
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
    /** The revision this editor loaded, so a stale save is refused (#285). */
    revision?: number,
): Promise<
    SitesResult<{
        pageVersionId?: string;
        revision?: number;
        pendingSectionChanges?: number | null;
        pendingSiteChanges?: SiteChangeKind[] | null;
    }>
> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/${siteId}/pages/${pageId}/draft/sections`,
        {
            method: "PUT",
            body: JSON.stringify({ sections, revision }),
        },
    );
    const data = (await res.json().catch(() => null)) as {
        pageVersionId?: string;
        revision?: number;
        pendingSectionChanges?: number | null;
        pendingSiteChanges?: SiteChangeKind[] | null;
        message?: string;
        error?: string;
        code?: string;
        index?: number;
    } | null;
    if (res.status === 409) {
        /*
         * Someone else saved this page while this editor was open (#285). The
         * local copy is NOT discarded and nothing is written: the caller
         * decides, and the editor offers to reload.
         */
        return {
            ok: false,
            conflict: true,
            ...readError(
                data,
                "Someone else saved this page while you were editing.",
            ),
        };
    }
    if (res.ok) {
        return {
            ok: true,
            data: {
                pageVersionId: data?.pageVersionId,
                revision: data?.revision,
                /*
                 * The save returns the recomputed count so the top bar stays
                 * true through a long editing session without the browser ever
                 * deciding for itself what "changed" means.
                 */
                pendingSectionChanges: data?.pendingSectionChanges ?? null,
                pendingSiteChanges: data?.pendingSiteChanges ?? null,
            },
        };
    }
    return { ok: false, ...readError(data, "Could not save the sections") };
}

/** Publish an immutable snapshot of the site's current drafts. */
export async function publishSite(
    siteId: string,
    /**
     * An owner going live past "Publishing needs approval" (DEC-071, T9):
     * refused from anyone else, and recorded when it goes through.
     */
    override = false,
): Promise<SitesResult<{ publicationId?: string; bypassed: boolean }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/publish`, {
        method: "POST",
        ...(override ? { body: JSON.stringify({ override: true }) } : {}),
    });
    const data = (await res.json().catch(() => null)) as {
        publicationId?: string;
        bypassed?: boolean;
        message?: string;
        error?: string;
    } | null;
    if (res.ok) {
        return {
            ok: true,
            data: {
                publicationId: data?.publicationId,
                bypassed: data?.bypassed === true,
            },
        };
    }
    return { ok: false, ...readError(data, "Could not publish the site") };
}

/**
 * Update a site's search and social settings (#188).
 *
 * Sends only what the caller passed: an omitted field is left alone by the API
 * and an explicit null clears it, so a form that PATCHes one field cannot wipe
 * the others.
 */
export async function updateSiteSettings(
    siteId: string,
    input: SiteSettingsInput,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return {
        ok: false,
        ...readError(data, "Could not save these settings."),
    };
}

/** One publish in a site's history (#194). */
export interface SitePublication {
    id: string;
    publishedAt: string;
    publishedByUserId: string | null;
    /** Who published it, by name (email when unnamed); null if unknown (#283). */
    publishedBy: string | null;
    templateId: string;
    templateVersion: number;
    /** Whether this is the version the public is being served right now. */
    isCurrent: boolean;
    /** Set when this publish went past an outstanding change request (#199). */
    bypass: { at: string; by: string } | null;
    /**
     * Set when an owner went live past "Publishing needs approval" (DEC-071,
     * T9). Optional: an older API image doesn't send it.
     */
    override?: { at: string; by: string } | null;
    /**
     * Which route this publish took: APPROVED, BYPASSED, OVERRIDDEN or NONE
     * (#278, T9). Null on versions published before it was recorded.
     */
    reviewRoute: string | null;
    /**
     * The test release this version went live from (DEC-071, T12); null for
     * a direct publish or a restore. Optional for an older API image.
     */
    testRelease?: PublicationRelease | null;
}

/** A test release, as the version it went live as names it (T12). */
export interface PublicationRelease {
    id: string;
    number: number;
    name: string;
}

/** Every publish of a site, newest first. Empty if it has never been published. */
export async function listPublications(
    siteId: string,
): Promise<SitePublication[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<SitePublication>(`${base}/${siteId}/publications`);
}

/** One page of a published snapshot, as it was served (#283). */
export interface PublishedPage {
    path: string;
    title: string;
    isHome: boolean;
    sections: { type: string; content: unknown }[];
}

/** The parts of a publication snapshot the version preview reads (#283). */
export interface PublishedSnapshot {
    site?: { name?: string; styleVariables?: Record<string, string> | null };
    pages?: PublishedPage[];
}

/** A section a past version holds that this build can no longer draw. */
export interface UnrenderableSection {
    path: string;
    index: number;
    type: string;
}

/** One past publish with its stored snapshot, for previewing it as served. */
export interface SitePublicationDetail {
    id: string;
    publishedAt: string;
    publishedByUserId: string | null;
    publishedBy: string | null;
    templateId: string;
    templateVersion: number;
    snapshot: PublishedSnapshot;
    renderability: { renderable: boolean; unrenderable: UnrenderableSection[] };
    /** The test release this version went live from (T12). */
    testRelease?: PublicationRelease | null;
}

/**
 * One past publish of a site (#283), or null when this site has no such
 * version (a 404 from the API).
 */
export async function getPublication(
    siteId: string,
    publicationId: string,
): Promise<SitePublicationDetail | null> {
    const base = await sitesBase();
    if (!base) return null;
    return getJson<SitePublicationDetail>(
        `${base}/${siteId}/publications/${encodeURIComponent(publicationId)}`,
    );
}

/**
 * Put a past version back. Appends a new publication rather than deleting the
 * ones after it, so this can itself be undone.
 */
export async function restorePublication(
    siteId: string,
    publicationId: string,
    /** An owner's restore past "Publishing needs approval" (DEC-071, Q3). */
    override = false,
): Promise<SitesResult<{ publicationId: string; bypassed: boolean }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/${siteId}/publications/${publicationId}/restore`,
        {
            method: "POST",
            ...(override ? { body: JSON.stringify({ override: true }) } : {}),
        },
    );
    const data = (await res.json().catch(() => null)) as {
        publicationId?: string;
        bypassed?: boolean;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.publicationId) {
        return {
            ok: true,
            data: {
                publicationId: data.publicationId,
                // Whether this restore went live past a change request (#279).
                bypassed: data.bypassed === true,
            },
        };
    }
    return { ok: false, ...readError(data, "Could not restore that version.") };
}

/** Replace a site's look. The panel always sends a whole style (#189). */
// ---------------------------------------------------------------------------
// Review — notes pinned to sections, and one approval (#193)
// ---------------------------------------------------------------------------

export interface SiteCommentView {
    id: string;
    /** Null once the page it was left on has been deleted (#277). */
    pageId: string | null;
    pageTitle: string | null;
    sectionKey: string;
    body: string;
    resolvedAt: string | null;
    createdAt: string;
    author: { id: string; name: string };
    /** The section this was about is no longer on the page. */
    orphaned: boolean;
}

/**
 * What the latest verdict on a site was. `BYPASSED` is not a reviewer's word:
 * it is the record that someone published over a request for changes (#199).
 * Nor is `OVERRIDDEN`: an owner went live past "Publishing needs approval"
 * (DEC-071, T9). A union rather than a string so every place that words a
 * verdict has to word them all — a new outcome is a type error, not a line
 * that quietly renders as "asked for changes", or a lookup that throws.
 */
export type ApprovalOutcome =
    "REQUESTED" | "APPROVED" | "CHANGES_REQUESTED" | "BYPASSED" | "OVERRIDDEN";

export interface ReviewState {
    /**
     * What is being reviewed (DEC-071, T12): a test release, or null for the
     * draft. The two never mix: a verdict on a release is about its frozen
     * bytes and leaves the draft's review as it was (KTD-10).
     */
    testRelease?: PublicationRelease | null;
    openNotes: number;
    latestApproval: {
        outcome: ApprovalOutcome;
        at: string;
        by: string;
    } | null;
    /**
     * A review was asked for, or changes were, and neither has been settled
     * for the draft as it stands (#199, #278). Publishing still works; it is
     * recorded as a bypass.
     */
    outstanding: boolean;
    /** Asked for and not yet answered — the "In review" state (#278). */
    pending: boolean;
    /**
     * The newest approval was of a different draft than the one that would go
     * live now: approved, then the work carried on (#278).
     */
    approvalIsStale: boolean;
}

/**
 * Every note on a site. Empty rather than throwing on failure: the Review tab
 * showing nothing is a worse outcome than the editor refusing to open, and
 * notes are not what the merchant came here to do.
 */
export async function listComments(
    siteId: string,
    /** A test release's own notes instead of the draft's (T8, T12). */
    testReleaseId?: string,
): Promise<SiteCommentView[]> {
    const base = await sitesBase();
    if (!base) return [];
    /*
     * A failure THROWS now (#275). This used to turn any error into an empty
     * array, so an outage read as "No notes on this site yet" — the one
     * sentence a reviewer must be able to trust, since acting on it means
     * assuming nobody has said anything. `getList` distinguishes an absent
     * resource (404 → empty) from a failure, and the segment boundary explains
     * the failure.
     */
    return getList<SiteCommentView>(
        `${base}/${siteId}/comments${releaseQuery(testReleaseId)}`,
    );
}

/** `?testReleaseId=…`, or nothing for the draft. */
function releaseQuery(testReleaseId: string | undefined): string {
    return testReleaseId
        ? `?testReleaseId=${encodeURIComponent(testReleaseId)}`
        : "";
}

export async function getReviewState(
    siteId: string,
    /** A test release's review instead of the draft's (T8, T12). */
    testReleaseId?: string,
): Promise<ReviewState> {
    const empty: ReviewState = {
        testRelease: null,
        openNotes: 0,
        pending: false,
        approvalIsStale: false,
        latestApproval: null,
        outstanding: false,
    };
    const base = await sitesBase();
    if (!base) return empty;
    /*
     * A failure THROWS now (#275), for the same reason notes do: a swallowed
     * error read as "nobody has reviewed this", which is the answer a merchant
     * publishes on.
     *
     * The fields are still read defensively — an older API that does not send
     * `pending` yet is a missing field, not a failure.
     */
    const data = await getJson<Partial<ReviewState>>(
        `${base}/${siteId}/review${releaseQuery(testReleaseId)}`,
    );
    if (!data) return empty;
    return {
        testRelease: data.testRelease ?? null,
        openNotes: typeof data.openNotes === "number" ? data.openNotes : 0,
        latestApproval: data.latestApproval ?? null,
        outstanding: data.outstanding === true,
        pending: data.pending === true,
        approvalIsStale: data.approvalIsStale === true,
    };
}

/**
 * Leave a note on a section (#277). Requires `site:comment`, which a REVIEWER
 * has and a MEMBER does not.
 *
 * The api rejects a section key that is not on the page's draft, so a note
 * pinned from a stale screen fails loudly instead of being stored as an
 * orphan nobody can act on.
 */
export async function createComment(
    siteId: string,
    input: {
        pageId: string;
        /** On a test release, the section's position on its frozen page (T8). */
        sectionKey: string;
        body: string;
        testReleaseId?: string;
    },
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/comments`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not leave that note.") };
}

/**
 * The verdicts a REVIEWER can record (#277): an answer to the work, and
 * nothing else. REQUESTED is the merchant asking (#278) and BYPASSED is what
 * publish writes for itself, so neither is a reviewer's to record.
 *
 * Derived from {@link ApprovalOutcome} rather than repeated, so an outcome
 * cannot be added to one list and forgotten in the other.
 */
export type ReviewerVerdict = Exclude<
    ApprovalOutcome,
    "REQUESTED" | "BYPASSED" | "OVERRIDDEN"
>;

/**
 * Record a verdict on the site. Requires `site:approve`.
 *
 * Approving does not publish and asking for changes does not block one — the
 * reviewer says what they think, the owner decides (#199).
 */
export async function createApproval(
    siteId: string,
    outcome: ReviewerVerdict,
    /** A verdict on a test release's frozen bytes, not the draft (T8, T12). */
    testReleaseId?: string,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/approvals`, {
        method: "POST",
        body: JSON.stringify(
            testReleaseId ? { outcome, testReleaseId } : { outcome },
        ),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not record that.") };
}

/** One section of a page, as a reviewer reads it (#275). */
export interface ReviewableSection {
    key: string;
    type: string;
    contractVersion: number;
    label: string | null;
    hidden: boolean;
    content: unknown;
}

/** A page as a reviewer reads it: its sections, in order (#275). */
export interface ReviewablePage {
    sections: ReviewableSection[];
}

/**
 * Read a page without asking for the editor's draft (#275).
 *
 * `getPageDraft` requires `section:write` and creates a DRAFT version when the
 * page has none — an authoring load, which a reviewer must not make. This one
 * needs only `site:read` and writes nothing.
 */
export async function getPageForReview(
    siteId: string,
    pageId: string,
): Promise<ReviewablePage> {
    const base = await sitesBase();
    if (!base) return { sections: [] };
    const page = await getJson<ReviewablePage>(
        `${base}/${siteId}/pages/${pageId}/read`,
    );
    return page ?? { sections: [] };
}

/**
 * Ask for a review (#278). Requires `site:update` — the person whose work it
 * is saying they are ready for eyes. It blocks nothing.
 */
export async function requestReview(
    siteId: string,
    /** Put a test release up for review instead of the draft (T8, T12). */
    testReleaseId?: string,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/review/request`, {
        method: "POST",
        ...(testReleaseId ? { body: JSON.stringify({ testReleaseId }) } : {}),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not ask for a review.") };
}

/** Mark a note settled, or reopen it. Requires `section:write` on the api. */
export async function setCommentResolved(
    siteId: string,
    commentId: string,
    resolved: boolean,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not update the note.") };
}

// ---------------------------------------------------------------------------
// Flags (spec §2, "quiet until publish")
// ---------------------------------------------------------------------------

/**
 * The nine advisory checks. Mirrored from the api rather than imported, on the
 * same boundary rule as the section content types above — but the RULES are not
 * mirrored: only the api decides what is flagged, so there is one answer to
 * "what is wrong with this site" rather than two that can disagree.
 */
export type FlagType =
    | "emptyRequiredField"
    | "placeholderText"
    | "missingImage"
    | "hiddenButLinked"
    | "pageNotInNavigation"
    | "unpublishedChanges"
    | "missingSeoDescription"
    | "brokenLink"
    | "phoneWidth"
    // The shop (G11): raised only while it is open for the business.
    | "storefrontUnchosen"
    | "reservedAddress"
    // The checkout (G13): the shop can't take an online order now.
    | "shopCantTakeOrders"
    // A Product grid (G12) naming products that aren't on sale there.
    | "productsNotOnSale"
    // The site has no web address (DEC-069, L5): the one flag that blocks.
    | "addressMissing";

export interface Flag {
    type: FlagType;
    message: string;
    pageId: string | null;
    sectionIndex: number | null;
    field: string | null;
    /** The API refuses to publish until this is fixed (only `addressMissing`). */
    blocking?: boolean;
}

export interface SiteFlags {
    flags: Flag[];
    /** Types the api cannot check yet, so the editor can say so honestly. */
    awaitingNavigation: FlagType[];
}

/**
 * Every flag on a site. Returns an empty set rather than throwing on failure:
 * flags are advisory, and a check that cannot run is not a reason to stop
 * someone editing or publishing.
 */
export async function getSiteFlags(siteId: string): Promise<SiteFlags> {
    const empty: SiteFlags = { flags: [], awaitingNavigation: [] };
    const base = await sitesBase();
    if (!base) return empty;
    try {
        const res = await apiFetch(`${base}/${siteId}/flags`);
        if (!res.ok) return empty;
        const data = (await res.json()) as Partial<SiteFlags> | null;
        return {
            flags: Array.isArray(data?.flags) ? data.flags : [],
            awaitingNavigation: Array.isArray(data?.awaitingNavigation)
                ? data.awaitingNavigation
                : [],
        };
    } catch {
        return empty;
    }
}

/**
 * A page to add (G14): a free-form page names its title and address; a
 * module page names its `kind` and may leave both to the kind's defaults
 * (a Book or Shop page's address is always its route's).
 */
export type CreatePageInput =
    | { kind?: "FREE"; title: string; path: string; inMenu?: boolean }
    | {
          kind: ModulePageKind;
          title?: string;
          path?: string;
          inMenu?: boolean;
      };

/** What a page change may carry; an omitted field is left alone. */
export interface UpdatePageInput {
    title?: string;
    path?: string;
    hidden?: boolean;
    /** "Show in menu" (G14). */
    inMenu?: boolean;
}

/**
 * Add a page to a site. The API decides what a legal path is and whether it is
 * free — the form does not pre-check, because a client-side answer that
 * disagreed with the server's would be worse than one round trip.
 */
export async function createPage(
    siteId: string,
    input: CreatePageInput,
): Promise<SitesResult<SitePage>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
        (Partial<SitePage> & { message?: string; error?: string }) | null;
    if (res.ok && data?.id) return { ok: true, data: data as SitePage };
    return { ok: false, ...readError(data, "Could not add the page.") };
}

/**
 * Rename a page, move it, hide it or take it out of the menu. An omitted
 * field is left alone.
 */
export async function updatePage(
    siteId: string,
    pageId: string,
    input: UpdatePageInput,
): Promise<SitesResult<SitePage>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
        (Partial<SitePage> & { message?: string; error?: string }) | null;
    if (res.ok && data?.id) return { ok: true, data: data as SitePage };
    return { ok: false, ...readError(data, "Could not update the page.") };
}

/** Delete a page and everything on it. The home page cannot be deleted. */
export async function deletePage(
    siteId: string,
    pageId: string,
): Promise<SitesResult<{ deleted: true }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages/${pageId}`, {
        method: "DELETE",
    });
    if (res.ok) return { ok: true, data: { deleted: true } };
    const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
    } | null;
    return { ok: false, ...readError(data, "Could not delete the page.") };
}

export async function updateSiteNavigation(
    siteId: string,
    navigation: SiteNavigation | null,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/navigation`, {
        method: "PUT",
        // Always an object on the wire — Express's json parser rejects a bare
        // null (see updateSiteFooter). An empty items list clears the menu.
        body: JSON.stringify(navigation ?? { items: [] }),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not save the menu.") };
}

export async function updateSiteFooter(
    siteId: string,
    footer: SiteFooter | null,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/footer`, {
        method: "PUT",
        /*
         * Always an OBJECT on the wire, never a bare `null`.
         *
         * Express's json parser is strict by default and accepts only objects
         * and arrays, so `JSON.stringify(null)` is rejected as malformed before
         * it ever reaches the handler — a 400 reading "Unexpected token 'n'"
         * that says nothing about footers.
         *
         * An empty value is already how a footer is removed: `parseSiteFooter`
         * collapses blank to null on the way in. So clearing sends an empty
         * string and the semantics are unchanged.
         */
        body: JSON.stringify(footer ?? { format: "html", value: "" }),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not save the footer.") };
}

export async function updateSiteStyle(
    siteId: string,
    style: SiteStyle,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/style`, {
        method: "PUT",
        body: JSON.stringify(style),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not save the style.") };
}

// ---------------------------------------------------------------------------
// Preview links (#198)
// ---------------------------------------------------------------------------

export type PreviewLinkState = "active" | "expired" | "revoked";

export interface SitePreviewLinkView {
    id: string;
    /**
     * The link's secret. Present ONLY on the response that created the link
     * (#284): the API stores its hash, so a list or a revoke never carries it.
     */
    token?: string;
    state: PreviewLinkState;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    lastUsedAt: string | null;
    createdBy: { name: string | null };
}

/** The choices the api accepts, in days. */
export type PreviewLinkDays = 1 | 7 | 30;

export async function listPreviewLinks(
    siteId: string,
): Promise<SitePreviewLinkView[]> {
    const base = await sitesBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/${siteId}/preview-links`);
    if (!res.ok) return [];
    return (await res.json()) as SitePreviewLinkView[];
}

export async function createPreviewLink(
    siteId: string,
    expiresInDays: PreviewLinkDays,
): Promise<SitesResult<SitePreviewLinkView & { token: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/preview-links`, {
        method: "POST",
        body: JSON.stringify({ expiresInDays }),
    });
    const data = (await res.json().catch(() => null)) as
        (SitePreviewLinkView & { message?: string; error?: string }) | null;
    if (res.ok && data?.id && data.token) {
        return { ok: true, data: { ...data, token: data.token } };
    }
    return {
        ok: false,
        ...readError(data, "Could not create a preview link."),
    };
}

export async function revokePreviewLink(
    siteId: string,
    linkId: string,
): Promise<SitesResult<SitePreviewLinkView>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/preview-links/${linkId}`, {
        method: "DELETE",
    });
    const data = (await res.json().catch(() => null)) as
        (SitePreviewLinkView & { message?: string; error?: string }) | null;
    if (res.ok && data?.id) return { ok: true, data };
    return {
        ok: false,
        ...readError(data, "Could not turn this link off."),
    };
}
