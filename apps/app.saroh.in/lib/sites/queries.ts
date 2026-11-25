import { z } from "zod";

import type { SitePublishData } from "@/components/sites/publish/site-publish";
import type { ScheduledGoLives } from "@/components/sites/versions/site-versions";
import type { Post, PostCategory } from "@/lib/content/service";
import type { FormSummary } from "@/lib/forms/service";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { PublishRequestView } from "@/lib/sites/publish-requests";
import type {
    ChangeUnit,
    ModulePageKind,
    SiteOverview,
    SitePage,
    SitePublication,
    SiteRedirect,
} from "@/lib/sites/service";
import type { SiteStateTone } from "@/lib/sites/site-state";

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
