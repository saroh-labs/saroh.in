"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { ListCard, ListRow } from "@saroh/ui/list-card";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { Inbox, Plug } from "lucide-react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { Overview } from "@/components/sites/overview/overview";
import { PagesArea } from "@/components/sites/pages-area/pages-area";
import { PublishRequestScreen } from "@/components/sites/publish-request/publish-request-screen";
import { LinksList } from "@/components/sites/reach/links-list";
import { OldLinksList } from "@/components/sites/reach/old-links-list";
import type { SiteAccess } from "@/components/sites/shell/group-map";
import { siteGroups } from "@/components/sites/shell/group-map";
import { SiteHome } from "@/components/sites/shell/site-home-phone";
import { SiteVersions as LegacySiteVersions } from "@/components/sites/versions/legacy/site-versions";
import { SiteVersions } from "@/components/sites/versions/site-versions";
import { count } from "@/lib/format/plural";
import { ReadFailed } from "@/lib/query/client";
import {
    usePublishRequestView,
    useSiteForms,
    useSiteLinks,
    useSiteOverview,
    useSitePages,
    useSitePosts,
    useSiteSave,
    useSiteVersions,
    whenRefused,
} from "@/lib/sites/use-sites";

/**
 * The Website area's screens on React Query (DEC-259): each page awaits its
 * gates and draws one of these, which reads in the browser. The frame
 * above (the site header and the section list) is `SiteFrame`'s; here only
 * the data region waits, in the route loader's own shapes. A failure stays
 * in its region with Try again; a site that isn't this business's is the
 * not-found page.
 */

/** The data region while it's read, or its failure with Try again. */
function Region({
    read,
    what,
    shape = "rows",
}: {
    read: {
        isError: boolean;
        isFetching: boolean;
        error: unknown;
        refetch: () => unknown;
    };
    what: string;
    shape?: "rows" | "panels";
}) {
    if (read.isError) {
        whenRefused(read.error);
        return (
            <FailedState
                size="panel"
                title={couldntLoad(what)}
                onRetry={() => void read.refetch()}
                retrying={read.isFetching}
            />
        );
    }
    return (
        <PageLoading
            shape={shape}
            width="full"
            bare
            label={`Loading ${what}`}
        />
    );
}

/** Overview (plan 2026-11-18-001 U4): its cards, and the phone's site home. */
export function SiteOverviewContainer({
    siteId,
    access,
    timeZone,
}: {
    siteId: string;
    access: SiteAccess;
    timeZone: string;
}) {
    const read = useSiteOverview(siteId);
    // Writing's own read: a line on a row, and Writing opens warm.
    const posts = useSitePosts(siteId);
    if (!read.data)
        return <Region read={read} what="the overview" shape="panels" />;
    const o = read.data;
    const pages = o.canEdit ? count(o.pageCount, "page") : null;
    const written = posts.data ? count(posts.data.posts.length, "post") : null;
    return (
        <Overview
            siteId={siteId}
            overview={o.overview}
            status={o.status}
            live={o.live}
            host={o.host}
            url={o.url}
            canEdit={o.canEdit}
            canPublish={o.canPublish}
            timeZone={timeZone}
            share={o.share}
            phoneHome={
                <SiteHome
                    groups={siteGroups(siteId, access)}
                    lines={{
                        "pages-and-posts":
                            [pages, written].filter(Boolean).join(" · ") ||
                            undefined,
                        reach: o.host ?? undefined,
                    }}
                />
            }
        />
    );
}

/** Pages in the Website area (plan 2026-11-18-001 U5): the tree, its sheets. */
export function SitePagesContainer({ siteId }: { siteId: string }) {
    const read = useSitePages(siteId);
    const save = useSiteSave(siteId);
    if (!read.data) return <Region read={read} what="the pages" />;
    const p = read.data;
    return (
        <PagesArea
            siteId={siteId}
            siteName={p.siteName}
            pages={p.pages}
            host={p.host}
            live={p.live}
            siteImageUrl={p.siteImageUrl}
            canUpdate={p.canUpdate}
            addableKinds={p.addableKinds}
            health={p.health}
            edits={p.edits}
            lastPublishedAt={p.lastPublishedAt}
            redirects={p.redirects}
            changes={p.changes}
            footer={p.aiApps ? <AiWayIn apps={p.aiApps} /> : null}
            save={save}
        />
    );
}

/**
 * A way into AI apps (release visibility U14): a line, never a notice, so
 * it can't stack with "Waiting to be published".
 */
function AiWayIn({ apps }: { apps: string }) {
    return (
        // Saroh's own words and its list of AI apps: read in a recording.
        <p
            data-ph-unmask=""
            className="-mt-1.5 flex items-start gap-2 text-[13px] leading-normal text-foreground/80"
        >
            <Plug
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>
                <IntentLink
                    href="/settings/developers/ai"
                    className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px] coarse:inline-block coarse:py-2.5"
                >
                    Edit your site from your AI assistant
                </IntentLink>
                <span className="text-muted-foreground">
                    {" · Works with "}
                    {apps}. Changes stay a draft until you publish.
                </span>
            </span>
        </p>
    );
}

/**
 * The Forms tab (#385): the forms on this site, and how much has come
 * through each. A form is made in the editor, by adding an enquiry
 * section, so there is nothing to create here.
 */
export function SiteFormsContainer({ siteId }: { siteId: string }) {
    const read = useSiteForms(siteId);
    if (!read.data) return <Region read={read} what="the forms" />;
    const forms = read.data;
    if (forms.length === 0) {
        return (
            <EmptyState
                icon={<Inbox />}
                title="No forms yet"
                description="Add an enquiry section to a page in the editor and its form shows here."
            />
        );
    }
    return (
        <ListCard
            main="Form"
            paged={{ list: "site-forms", things: "forms" }}
            end="Latest entry"
            note="Each entry also becomes a contact and a lead. Here is what they typed, kept as they sent it."
        >
            {forms.map((form) => (
                <li
                    key={form.id}
                    className="border-b border-border last:border-b-0"
                >
                    <IntentLink
                        href={`/sites/${siteId}/forms/${form.id}`}
                        className="block bg-card transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                        <ListRow
                            title={form.name}
                            tag={
                                form.status === "ACTIVE" ? null : (
                                    <Badge variant="neutral">Closed</Badge>
                                )
                            }
                            sub={`${count(form.submissionCount, "entry", "entries")} · asks for ${form.fields
                                .map((f) => f.label.toLowerCase())
                                .join(", ")}`}
                            end={
                                <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                                    {form.lastSubmissionAt ? (
                                        <ViewerDate
                                            iso={form.lastSubmissionAt}
                                        />
                                    ) : (
                                        "None yet"
                                    )}
                                </span>
                            }
                        />
                    </IntentLink>
                </li>
            ))}
        </ListCard>
    );
}

/**
 * Reach › Links and sharing (plan 2026-11-18-001 U6): the page links the
 * business shares, and the old links that forward to them. A reader sees
 * both lists and changes nothing.
 */
export function SiteLinksContainer({ siteId }: { siteId: string }) {
    const read = useSiteLinks(siteId);
    const save = useSiteSave(siteId);
    const host = read.data?.host ?? null;
    return (
        <div className="flex flex-col gap-8">
            <p className="-mt-2 text-sm text-muted-foreground">
                The links you share{host ? ` for ${host}` : ""}, and the old
                ones that still work.
            </p>
            {read.data ? (
                <>
                    <LinksList
                        siteId={siteId}
                        host={host}
                        business={read.data.name}
                        pages={read.data.pages}
                        currentPublicationId={read.data.currentPublicationId}
                        redirects={read.data.redirects}
                    />
                    <OldLinksList
                        siteId={siteId}
                        host={host}
                        pages={read.data.pages}
                        redirects={read.data.redirects}
                        canEdit={read.data.canEdit}
                        save={save}
                        onRetry={() => void read.refetch()}
                    />
                </>
            ) : (
                <Region read={read} what="the links" />
            )}
        </div>
    );
}

/**
 * Version history (#194): the frame (breadcrumb, title, Settings) at once,
 * the versions when they land. `asDraft` is the page's gate: restore as the
 * draft (the area on) or live again (today's).
 */
export function SiteVersionsContainer({
    siteId,
    asDraft,
}: {
    siteId: string;
    asDraft: boolean;
}) {
    const read = useSiteVersions(siteId);
    const save = useSiteSave(siteId);
    const v = read.data;
    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[
                    <IntentLink
                        data-ph-unmask=""
                        key="site"
                        href={`/sites/${siteId}/pages`}
                    >
                        Website
                    </IntentLink>,
                    "Version history",
                ]}
                holdsData="description"
                title="Version history"
                description={v ? v.name : <span>&nbsp;</span>}
                actions={
                    <Button variant="outline" asChild>
                        <IntentLink href={`/sites/${siteId}/settings`}>
                            Settings
                        </IntentLink>
                    </Button>
                }
            />
            {!v ? (
                <Region read={read} what="the versions" />
            ) : asDraft ? (
                <SiteVersions
                    siteId={siteId}
                    publications={v.publications}
                    canRestore={v.canEdit}
                    scheduled={v.scheduled}
                    save={save}
                />
            ) : (
                <LegacySiteVersions
                    siteId={siteId}
                    publications={v.publications}
                    changesRequested={v.changesRequested}
                    canRestore={v.canPublish}
                    needsApproval={v.needsApproval}
                    canOverride={v.canOverride}
                    scheduled={v.scheduled}
                    save={save}
                />
            )}
        </PageContainer>
    );
}

const REQUEST_CRUMBS = [
    <IntentLink data-ph-unmask="" key="site" href="/sites">
        Website
    </IntentLink>,
    "Publish request",
];

/**
 * Where an AI app's publish request is answered (DEC-215). Its title comes
 * from the request, so the loader stands until it lands. One that isn't
 * this business's or this site's says so (never a not-found page: the
 * link came from outside); a role without `site:publish` is the no-access
 * page.
 */
export function PublishRequestContainer({
    siteId,
    requestId,
}: {
    siteId: string;
    requestId: string;
}) {
    const read = usePublishRequestView(siteId, requestId);
    const save = useSiteSave(siteId);
    const gone = read.error instanceof ReadFailed && read.error.status === 404;
    if (read.isError && !read.data && !gone) whenRefused(read.error);
    if (!read.data && !read.isError) {
        return (
            <PageLoading
                shape="panels"
                width="default"
                breadcrumb={REQUEST_CRUMBS}
                label="Loading the publish request"
            />
        );
    }
    const view = read.data;
    return (
        <PageContainer>
            <PageHeader
                breadcrumb={REQUEST_CRUMBS}
                holdsData
                title={view ? `Publish ${view.siteName}?` : "Publish request"}
                description={
                    view
                        ? "An AI app prepared this. Only you can publish it."
                        : undefined
                }
            />
            {view ? (
                <PublishRequestScreen
                    view={view}
                    requestId={requestId}
                    save={save}
                />
            ) : gone ? (
                <div className="grid max-w-xl gap-4">
                    <Notice tone="warning" role="status">
                        This link doesn&apos;t open a publish request in this
                        business. It may be for another business, or it was
                        cleared after a week. Nothing was published.
                    </Notice>
                    <Button
                        asChild
                        variant="outline"
                        className="justify-self-start"
                    >
                        <IntentLink href="/sites">
                            Back to the website
                        </IntentLink>
                    </Button>
                </div>
            ) : (
                <Region read={read} what="the publish request" shape="panels" />
            )}
        </PageContainer>
    );
}
