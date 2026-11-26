"use client";

import { LoadingState } from "@saroh/ui/data-state";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { PageLoading } from "@/components/shared/page/page-loading";
import {
    SearchTrackingFailed,
    SearchTrackingFrame,
} from "@/components/sites/search-tracking/parts";
import { SiteSearchTracking } from "@/components/sites/search-tracking/site-search-tracking";
import { SiteSearchTrackingRead } from "@/components/sites/search-tracking/site-search-tracking-read";
import { settingsKeys } from "@/lib/settings/queries";
import type { SiteAddress } from "@/lib/sites/share-links";
import {
    useSiteSave,
    useSiteSettings,
    useSiteTracking,
    whenRefused,
} from "@/lib/sites/use-sites";
import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

import { SettingsSavedProvider } from "./settings-saved";
import { SiteSettings } from "./site-settings";
import { SiteSettingsRead } from "./site-settings-read";

/**
 * A site's Settings tab on React Query (DEC-259): the site header and the
 * section list are the frame's; here the groups wait for the site's
 * settings read, and Tracking for its own, so the rest never waits on it.
 * Someone who may change the settings gets the rows with their sheets;
 * anyone else the values, and none of the controls the API would refuse
 * (#275). A save reads the site's screens again (the header too) and marks
 * the business's own settings stale, which the Contact rows change.
 */
export function SiteSettingsScreen({ siteId }: { siteId: string }) {
    const read = useSiteSettings(siteId);
    const save = useSiteSave(siteId);
    const qc = useQueryClient();
    const { orgId, saved } = save;
    const context = useMemo(
        () => ({
            orgId,
            saved: () =>
                Promise.all([
                    saved(),
                    qc.invalidateQueries({
                        queryKey: settingsKeys(orgId),
                        refetchType: "none",
                    }),
                ]).then(
                    () => undefined,
                    () => undefined,
                ),
        }),
        [orgId, saved, qc],
    );
    const s = read.data;
    if (!s) {
        if (read.isError) {
            whenRefused(read.error);
            return (
                <FailedState
                    size="panel"
                    title={couldntLoad("the settings")}
                    onRetry={() => void read.refetch()}
                    retrying={read.isFetching}
                />
            );
        }
        return (
            <PageLoading
                shape="panels"
                width="full"
                bare
                label="Loading the settings"
            />
        );
    }
    const tracking = (
        <SiteTrackingRegion
            siteId={siteId}
            canManage={s.site.can.manageSettings}
            address={s.address}
        />
    );
    return (
        <SettingsSavedProvider value={context}>
            {s.site.can.manageSettings ? (
                <SiteSettings
                    site={s.site}
                    address={s.address}
                    approval={s.approval}
                    canChangeAddress={s.canChangeAddress}
                    tracking={tracking}
                    contact={s.contact}
                    business={s.business}
                    locations={s.locations}
                    canEditLocations={s.canEditLocations}
                />
            ) : (
                <SiteSettingsRead
                    site={s.site}
                    address={s.address}
                    approval={s.approval}
                    tracking={tracking}
                    contact={s.contact}
                />
            )}
        </SettingsSavedProvider>
    );
}

/** "Search and tracking" (DEC-108, U7): live at once, its own read. */
function SiteTrackingRegion({
    siteId,
    canManage,
    address,
}: {
    siteId: string;
    canManage: boolean;
    address: SiteAddress | null;
}) {
    const read = useSiteTracking(siteId);
    const t = read.data;
    if (!t && read.isError) {
        return (
            <SearchTrackingFrame>
                <SearchTrackingFailed />
            </SearchTrackingFrame>
        );
    }
    if (!t) {
        return (
            <SearchTrackingFrame>
                <LoadingState
                    variant="list"
                    rows={4}
                    label="Loading search and tracking"
                />
            </SearchTrackingFrame>
        );
    }
    // A failed read is the section's own failed state, with Retry.
    return canManage ? (
        <SiteSearchTracking
            siteId={siteId}
            read={t.read}
            address={address}
            lock={t.lock}
        />
    ) : (
        <SiteSearchTrackingRead read={t.read} address={address} lock={t.lock} />
    );
}
