import { z } from "zod";

import type { SiteCardData } from "@/components/sites/all-sites/site-card";
import type { SitePublishData } from "@/components/sites/publish/site-publish";
import type { ServiceOption } from "@/components/sites/section-fields/types";
import type { ScheduledGoLives } from "@/components/sites/versions/site-versions";
import type { Post, PostCategory } from "@/lib/content/service";
import type { FormSummary } from "@/lib/forms/service";
import type {
    OrganizationSettings,
    SiteContactView,
} from "@/lib/organizations/settings-service";
import type { PickerReview } from "@/lib/product-reviews/picker-read";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { AddBusinessCounts } from "@/lib/sites/add-business-read";
import type { GridCatalogueRead } from "@/lib/sites/grid-catalogue";
import type { PublishApproval } from "@/lib/sites/publish-approval";
import type { PublishRequestView } from "@/lib/sites/publish-requests";
import type { SearchTrackingRead } from "@/lib/sites/search-tracking";
import type {
    ChangeUnit,
    ModulePageKind,
    NewSiteDefaults,
    PublicationRelease,
    PublishedPage,
    ReviewState,
    SiteCommentView,
    SiteDetail,
    SiteOverview,
    SitePage,
    SitePublication,
    SiteRedirect,
    Template,
    UnrenderableSection,
} from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";
import type { SiteStateTone } from "@/lib/sites/site-state";
import type { ModuleStates } from "@/lib/sites/template-picker";
import type { TestRelease } from "@/lib/sites/test-release-types";
import type { TrackersLock } from "@/lib/sites/trackers-lock";
import type { TeamPickPerson } from "@/lib/staff/team-picker-read";
import type {
    VisitedLocation,
    VisitPlacesRead,
} from "@/lib/stores/storefronts";

/**
 * The Website area's reads (DEC-259). Client-safe: the keys and the
 * routes; the services are paired in `access.ts`. Every read of a site
 * sits under `siteKeys(orgId, siteId)`, so a publish, a request answered
 * or the editor left reads the site's screens again in one invalidation.
 */

/** Every Website read of a business. */
export const sitesKeys = (orgId: string): DomainKey =>
    domainKey("sites", orgId);

/** Every read of one site, whatever screen asked. */
export const siteKeys = (orgId: string, siteId: string): DomainKey =>
    domainKey("sites", orgId, "site", siteId);

const siteId = z.string().regex(/^[\w-]{1,64}$/);
const site = { siteId };

/** All sites (plan 2026-11-18-001 U3): the cards, and whether one more may be made. */
export interface AllSitesScreen {
    sites: SiteCardData[];
    /** Under the business's website limit (ADR-006). */
    canAddMore: boolean;
}

export const allSitesRead = defineRead<AllSitesScreen>()({
    key: (orgId) => domainKey("sites", orgId, "all"),
    route: { path: "/api/sites", params: {} },
    // A card's status and "Edited …" move with the editor, whose leaving
    // marks every Website read stale.
    tier: "records",
});

/** New site: the catalogue, the suggested name and address, the modules. */
export interface NewSiteScreen {
    /** Null when the catalogue couldn't be read: said in the form. */
    templates: Template[] | null;
    defaults: NewSiteDefaults | null;
    modules: ModuleStates | null;
}

export const newSiteRead = defineRead<NewSiteScreen>()({
    key: (orgId) => domainKey("sites", orgId, "new"),
    route: { path: "/api/sites/new", params: {} },
    tier: "settings",
});

/** A site's status in the Website area's words (`siteStatus`). */
export interface SiteStatusWords {
    label: string;
    tone: SiteStateTone;
    waiting: number;
}

/** The site header over every tab: what it says and what it offers. */
export interface SiteFrame {
    id: string;
    name: string;
    /** The business's web address host; null before it has one. */
    host: string | null;
    /** Where the public reaches it, or the site's own path before that. */
    address: string;
    /** Set only while the site is live. */
    liveUrl: string | null;
    qrUrl: string | null;
    status: SiteStatusWords;
    paused: boolean;
    canEdit: boolean;
    /** The Publish sheet's facts, for whoever may publish; else null. */
    publish: SitePublishData | null;
}

export const siteFrameRead = defineRead<SiteFrame>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "frame"),
    route: { path: "/api/sites/[siteId]", params: site },
    // The site's name, address and status: changed in Settings, by a
    // publish (which reads it again) or in the editor (left: marked stale).
    tier: "settings",
});

/** Overview: the API's overview, and the site facts its cards draw. */
export interface SiteOverviewScreen {
    /** Null when it couldn't be read: only its own parts go. */
    overview: SiteOverview | null;
    status: SiteStatusWords;
    live: boolean;
    host: string | null;
    url: string | null;
    canEdit: boolean;
    canPublish: boolean;
    pageCount: number;
    share: { page: SitePage; business: string } | null;
}

export const siteOverviewRead = defineRead<SiteOverviewScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "overview"),
    route: { path: "/api/sites/[siteId]/overview", params: site },
    tier: "records",
});

/** Pages and its sheets: the pages tree, its health, edits and old links. */
export interface SitePagesScreen {
    siteName: string;
    pages: SitePage[];
    host: string | null;
    live: boolean;
    siteImageUrl: string | null;
    canUpdate: boolean;
    addableKinds: ModulePageKind[] | undefined;
    health: SiteOverview["needsDoing"] | null;
    edits: SiteOverview["pageEdits"] | null;
    lastPublishedAt: string | null;
    redirects: SiteRedirect[] | null;
    changes: ChangeUnit[] | null;
    /** The line into AI apps (release visibility U14): the apps, named; null: not offered. */
    aiApps: string | null;
}

export const sitePagesRead = defineRead<SitePagesScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "pages"),
    route: { path: "/api/sites/[siteId]/pages", params: site },
    tier: "settings",
});

/** A post as Writing's row draws it. */
export interface PostRow {
    id: string;
    title: string;
    slug: string;
    status: Post["status"];
    live: boolean;
    featured: boolean;
    category: { name: string } | null;
    author: string | null;
    createdAt: string;
    updatedAt?: string;
    /** Past the plan's blog posts limit (#800). */
    paused: boolean;
}

export interface SitePostsScreen {
    posts: PostRow[];
    canEdit: boolean;
    /** Where the posts live: "blog" unless the site says otherwise. */
    prefix: string;
}

export const sitePostsRead = defineRead<SitePostsScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "posts"),
    route: { path: "/api/sites/[siteId]/posts", params: site },
    tier: "records",
});

/** The Categories sheet over Writing, for someone who may change them. */
export const postCategoriesRead = defineRead<PostCategory[]>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "categories"),
    route: { path: "/api/sites/[siteId]/post-categories", params: site },
    tier: "records",
});

/**
 * A site's Settings tab (#188): the site's settings, where it is reached,
 * how to reach the business, and, for someone who may change them, the
 * business's own settings and the locations its Address sheet edits.
 */
export interface SiteSettingsScreen {
    site: SiteDetail;
    address: SiteAddress | null;
    /** "Publishing needs approval" (DEC-071, T13); null leaves it out. */
    approval: PublishApproval | null;
    canChangeAddress: boolean;
    /** Null when it couldn't be read. */
    contact: SiteContactView | null;
    /** Null for anyone who may not change them (read-only rows). */
    business: OrganizationSettings | null;
    locations: VisitedLocation[] | null;
    canEditLocations: boolean;
}

export const siteSettingsRead = defineRead<SiteSettingsScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "settings"),
    route: { path: "/api/sites/[siteId]/settings", params: site },
    tier: "settings",
});

/** Settings › Tracking (DEC-108, U7): the section and the plan's lock. */
export interface SiteTrackingScreen {
    read: SearchTrackingRead;
    /** An aid, failing open: the save still refuses what it must. */
    lock: TrackersLock | null;
}

export const siteTrackingRead = defineRead<SiteTrackingScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "tracking"),
    route: { path: "/api/sites/[siteId]/search-tracking", params: site },
    tier: "settings",
});

/** A form as the Forms tab's row draws it. */
export type FormRow = Pick<
    FormSummary,
    "id" | "name" | "status" | "submissionCount" | "lastSubmissionAt"
> & { fields: { label: string }[] };

export const siteFormsRead = defineRead<FormRow[]>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "forms"),
    route: { path: "/api/sites/[siteId]/forms", params: site },
    tier: "records",
});

/** One entry as the form's page draws it: who, when, and what they typed. */
export interface FormEntryView {
    id: string;
    createdAt: string;
    /** The contact it became, by name; null once that contact is deleted. */
    contact: { id: string; name: string } | null;
    /** Who it came from when there's no contact: their name or email. */
    who: string;
    leadId: string | null;
    rows: { label: string; value: string; long: boolean }[];
}

/** A form's entries (#385), newest first. */
export interface FormEntriesScreen {
    name: string;
    active: boolean;
    total: number;
    entries: FormEntryView[];
}

export const formEntriesRead = defineRead<FormEntriesScreen>()({
    key: (orgId, { siteId, formId }) =>
        domainKey("sites", orgId, "site", siteId, "form", formId),
    route: {
        path: "/api/sites/[siteId]/forms/[formId]",
        params: { siteId, formId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "records",
});

/** Reach › Links and sharing. */
export interface SiteLinksScreen {
    name: string;
    host: string | null;
    pages: SitePage[];
    currentPublicationId: string | null;
    redirects: SiteRedirect[] | null;
    canEdit: boolean;
}

export const siteLinksRead = defineRead<SiteLinksScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "links"),
    route: { path: "/api/sites/[siteId]/links", params: site },
    tier: "settings",
});

/** Version history: the publishes, the scheduled go-lives and who may restore. */
export interface SiteVersionsScreen {
    name: string;
    publications: SitePublication[];
    scheduled: ScheduledGoLives;
    canEdit: boolean;
    canPublish: boolean;
    needsApproval: boolean;
    canOverride: boolean;
    /** Today's restore only (area off): a change request is outstanding. */
    changesRequested: boolean;
}

export const siteVersionsRead = defineRead<SiteVersionsScreen>()({
    key: (orgId, { siteId }) =>
        domainKey("sites", orgId, "site", siteId, "versions"),
    route: { path: "/api/sites/[siteId]/versions", params: site },
    tier: "records",
});

/**
 * One past version (#283): its pages as served, each holding only the
 * sections this build can still draw, and who may put it back.
 */
export interface SiteVersionScreen {
    siteName: string;
    publishedAt: string;
    publishedBy: string | null;
    isCurrent: boolean;
    /** The test release it went live from (T12). */
    release: PublicationRelease | null;
    renderable: boolean;
    /** Sections left out across the version. */
    unrenderableCount: number;
    pages: PublishedPage[];
    styleVariables: Record<string, string> | null;
    look: string | null;
    canEdit: boolean;
    canPublish: boolean;
    needsApproval: boolean;
    canOverride: boolean;
}

export const siteVersionRead = defineRead<SiteVersionScreen>()({
    key: (orgId, { siteId, publicationId }) =>
        domainKey("sites", orgId, "site", siteId, "version", publicationId),
    route: {
        path: "/api/sites/[siteId]/versions/[publicationId]",
        params: { siteId, publicationId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    // A version is immutable; whether it is the current one changes with a
    // publish or a restore, which read the site's screens again.
    tier: "records",
});

/** One test release, read in the workspace (DEC-071, T12). */
export interface SiteReleaseScreen {
    siteName: string;
    release: TestRelease;
    /** The business's time zone, the one its dates are said in. */
    zone: string;
    pages: PublishedPage[];
    unrenderable: UnrenderableSection[];
    variables: Record<string, string> | null;
    /** Its own notes and verdicts, never the draft's (T8). */
    comments: SiteCommentView[];
    review: ReviewState;
    /** The site's pages now: a note is pinned to the one with the path. */
    sitePages: SitePage[];
    canEdit: boolean;
    canComment: boolean;
    canApprove: boolean;
}

export const siteReleaseRead = defineRead<SiteReleaseScreen>()({
    key: (orgId, { siteId, releaseId }) =>
        domainKey("sites", orgId, "site", siteId, "release", releaseId),
    route: {
        path: "/api/sites/[siteId]/releases/[releaseId]",
        params: { siteId, releaseId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    // A test link's notes and verdicts: the reviewers' own, read again
    // by each note, verdict or request made here.
    tier: "settings",
});

/** An AI app's publish request (DEC-215); another business's is a 404. */
export const publishRequestRead = defineRead<PublishRequestView>()({
    key: (orgId, { siteId, requestId }) =>
        domainKey("sites", orgId, "site", siteId, "request", requestId),
    route: {
        path: "/api/sites/[siteId]/publish-requests/[requestId]",
        params: { siteId, requestId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "records",
});

/** The editor's Add, inspector and embed pickers beside the services and products (U18). */
export interface ReviewsPick {
    ok: true;
    /** Null when they can't be read (no Commerce, or the role can't). */
    reviews: PickerReview[] | null;
}
export interface AddCountsPick {
    ok: true;
    counts: AddBusinessCounts;
}
export interface TeamPick {
    ok: true;
    team: TeamPickPerson[] | null;
    canChoose: boolean;
}
export interface OffersPick {
    ok: true;
    /** Null when the read failed: never "No offers yet" by mistake. */
    offers: { id: string; name: string; rule: string }[] | null;
}
export interface VisitPlacesPick {
    ok: true;
    places: VisitPlacesRead;
}
export type PickerAnswer =
    | ServicesPick
    | GridCatalogueRead
    | ReviewsPick
    | AddCountsPick
    | TeamPick
    | OffersPick
    | VisitPlacesPick;

/** Each picker's domain: a save there marks it stale. */
const PICKER_DOMAIN = {
    services: "services",
    products: "products",
    reviews: "product-reviews",
    "add-counts": "products",
    team: "staff",
    offers: "discounts",
    "visit-places": "stores",
} as const;

/** What the editor's pickers read: a refusal is said, never an empty list. */
export type ServicesPick =
    { ok: true; services: ServiceOption[] } | { ok: false; forbidden: boolean };

/**
 * The editor's pickers (booking, services list, embeds, Add, Product
 * grid): one entry per kind under that kind's own domain (`services`,
 * `products`), so every picker shares it and a save on the Products
 * screen, which invalidates `products`, marks it stale too.
 */
export const pickerRead = defineRead<PickerAnswer>()({
    key: (orgId, { kind }) =>
        kind === "services" || kind === "products"
            ? domainKey(kind, orgId, "picker")
            : domainKey(PICKER_DOMAIN[kind], orgId, "picker", kind),
    route: {
        path: "/api/sites/pickers",
        params: {
            kind: z.enum([
                "services",
                "products",
                "reviews",
                "add-counts",
                "team",
                "offers",
                "visit-places",
            ]),
        },
    },
    tier: "records",
});

export type PickerKind = keyof typeof PICKER_DOMAIN;
