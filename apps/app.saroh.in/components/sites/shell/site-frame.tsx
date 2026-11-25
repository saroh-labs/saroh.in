"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { Skeleton } from "@saroh/ui/skeleton";
import type { ReactNode } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { PageContainer } from "@/components/shared/page/page-container";
import { pausedWords } from "@/lib/billing/paused";
import {
    useFrameFollowsRefresh,
    useSiteFrame,
    whenRefused,
} from "@/lib/sites/use-sites";

import { ChangesBar } from "./changes-bar";
import type { SiteAccess } from "./group-map";
import { siteGroups } from "./group-map";
import { SiteSectionHeading } from "./section-heading";
import { SitePhoneNav, SiteSectionList } from "./section-list";
import { SiteHeader } from "./site-header";

/**
 * The Website area's frame on React Query (DEC-259): the section list,
 * the phone's nav and each screen's heading are drawn at once from the
 * layout's gates (`access`: what this person may do); the site header
 * (name, address, status, Publish) is one `settings` read, a bar of the
 * header's own height until it lands. A site that isn't this business's
 * is the not-found page; a header that can't be read says so in its own
 * place, and the screen below still loads.
 */
export function SiteFrame({
    siteId,
    access,
    mayCreate,
    askAi,
    rendered,
    children,
}: {
    siteId: string;
    access: SiteAccess;
    mayCreate: boolean;
    askAi: boolean;
    /** When the layout was rendered: a later render reads the header again. */
    rendered: string;
    children: ReactNode;
}) {
    const frame = useSiteFrame(siteId);
    useFrameFollowsRefresh(siteId, rendered);
    if (frame.isError && !frame.data) whenRefused(frame.error);

    const groups = siteGroups(siteId, access);
    const site = frame.data;
    const waiting = site?.publish ? site.status.waiting : 0;

    return (
        <PageContainer width="full">
            <div
                className={
                    waiting > 0
                        ? "flex flex-col gap-5 max-[759px]:pb-20"
                        : "flex flex-col gap-5"
                }
            >
                {site ? (
                    <SiteHeader
                        site={site}
                        sites={[site]}
                        address={site.address}
                        liveUrl={site.liveUrl}
                        qrUrl={site.qrUrl}
                        canEdit={site.canEdit}
                        mayCreate={mayCreate}
                        askAi={askAi}
                        publish={site.publish}
                    />
                ) : frame.isError ? (
                    <FailedState
                        size="panel"
                        title={couldntLoad("this site")}
                        onRetry={() => void frame.refetch()}
                        retrying={frame.isFetching}
                    />
                ) : (
                    <HeaderLoading />
                )}
                {site?.paused ? (
                    <PausedNote>{pausedWords("site")}</PausedNote>
                ) : null}
                <div className="grid min-w-0 gap-5 min-[760px]:grid-cols-[220px_minmax(0,1fr)] min-[760px]:gap-8">
                    <SiteSectionList siteId={siteId} groups={groups} />
                    <div className="flex min-w-0 flex-col gap-5">
                        <SitePhoneNav siteId={siteId} groups={groups} />
                        <SiteSectionHeading
                            siteId={siteId}
                            groups={groups}
                            canEdit={access.canEdit}
                        />
                        {children}
                    </div>
                </div>
            </div>
            <ChangesBar
                siteId={siteId}
                waiting={waiting}
                publish={site?.publish ?? null}
            />
        </PageContainer>
    );
}

/** The header's place while it's read: its height, so nothing below moves. */
function HeaderLoading() {
    return (
        <div role="status" aria-busy="true">
            <span className="sr-only">Loading the site</span>
            <div className="flex flex-col gap-3 border-b border-border pb-4 min-[760px]:flex-row min-[760px]:items-center">
                <div
                    aria-hidden
                    className="flex min-w-0 flex-1 items-center gap-3"
                >
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="grid gap-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                    </div>
                </div>
                <Skeleton aria-hidden className="h-9 w-44 rounded-md" />
            </div>
        </div>
    );
}
