"use client";

import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { getReviewState, requestReview } from "@/lib/sites/actions";
import type { SiteChangeKind } from "@/lib/sites/pending";
import type { ReviewState, SitePage } from "@/lib/sites/service";
import { useSiteSave } from "@/lib/sites/use-sites";
import type { WebAddressFix } from "./address-fix";
import { PublishSheet } from "./publish-sheet";
import { usePublish } from "./use-publish";
import { usePublishChanges } from "./use-publish-changes";

/** What the Website area's server read hands the Publish sheet. */
export interface SitePublishData {
    siteId: string;
    siteName: string;
    /** The business's web address host; null when it has none yet. */
    host: string | null;
    pages: SitePage[];
    neverPublished: boolean;
    pendingSectionChanges: number | null;
    pendingSiteChanges: SiteChangeKind[] | null;
    needsApproval: boolean;
    canOverride: boolean;
    addressFix: WebAddressFix | null;
}

const NO_FLAGS = { flags: [], awaitingNavigation: [] };

/**
 * The Publish sheet outside the editor (U11): the site header's status chip
 * and the phone's changes bar open the same sheet the editor's Publish
 * does. Nothing is unsaved out here, so it opens straight on the checks;
 * a fix on a page opens the editor there. Drawn only for someone who may
 * publish: a Reviewer approves in the editor instead (DEC-226).
 */
export function SitePublish({
    data,
    trigger,
}: {
    data: SitePublishData;
    trigger: (open: () => void) => ReactNode;
}) {
    const router = useRouter();
    const phone = useNarrow();
    const save = useSiteSave(data.siteId);
    const [review, setReview] = useState<ReviewState | null>(null);
    const refreshReview = async () => {
        setReview(await getReviewState(data.siteId).catch(() => null));
    };
    const publish = usePublish({
        siteId: data.siteId,
        address: data.host,
        initialFlags: NO_FLAGS,
        initialNeverPublished: data.neverPublished,
        initialPendingChanges: data.pendingSectionChanges,
        initialPendingSiteChanges: data.pendingSiteChanges,
        refreshReview,
        initialNeedsApproval: data.needsApproval,
        canOverride: data.canOverride,
        // The header's chip, the counts and the tab below: read them again.
        onLiveChanged: () => void save.saved(),
    });
    const changes = usePublishChanges(data.siteId);
    const home = data.pages.find((p) => p.isHome) ?? data.pages.at(0);

    const open = () => {
        void refreshReview();
        void changes.load();
        void publish.openCheck({
            dirty: false,
            onlyHeldBack: false,
            heldBack: [],
        });
    };

    return (
        <>
            {trigger(open)}
            <PublishSheet
                open={publish.checking}
                siteId={data.siteId}
                changes={changes}
                phone={phone}
                pages={data.pages}
                flags={publish.siteFlags.flags}
                awaitingNavigation={publish.siteFlags.awaitingNavigation}
                publishing={publish.publishing}
                unsaved={false}
                neverPublished={publish.neverPublished}
                pendingSummary={publish.pendingSummary}
                pendingKnown={publish.pendingKnown}
                pendingChanges={publish.pendingChanges}
                pendingSiteChanges={publish.pendingSiteChanges}
                review={review}
                needsApproval={publish.needsApproval}
                canOverride={publish.canOverride}
                wentLive={publish.wentLive}
                error={publish.publishError}
                addressFix={data.addressFix}
                more={{ versionsHref: `/sites/${data.siteId}/versions` }}
                share={
                    publish.siteAddress && home
                        ? {
                              page: home,
                              business: data.siteName,
                              host: publish.siteAddress,
                          }
                        : null
                }
                onAsk={(name) =>
                    void runAction(() => requestReview(data.siteId)).then(
                        (res) => {
                            if (res?.ok) showSuccess(`Asked ${name} to look`);
                        },
                    )
                }
                onFlagsChanged={() => void publish.refreshFlags()}
                onAddressSaved={(host) => {
                    publish.setSiteAddress(host);
                    void publish.refreshFlags();
                }}
                onPublish={(choice) =>
                    void publish.onPublish(data.siteName, choice)
                }
                onClose={publish.closeCheck}
                // The fix is on the page, in the editor.
                onJump={(pageId) =>
                    router.push(
                        pageId
                            ? `/sites/${data.siteId}?page=${pageId}`
                            : `/sites/${data.siteId}`,
                    )
                }
            />
        </>
    );
}
