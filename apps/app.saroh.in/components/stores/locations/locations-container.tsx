"use client";

import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { mayAddStorefront } from "@/lib/business-limits";
import type { Organization } from "@/lib/organizations/service";
import { peopleAccess } from "@/lib/stores/people";
import {
    LocationSaveProvider,
    useLocation,
    useLocationSave,
    useLocations,
} from "@/lib/stores/use-stores";

import { StorefrontsScreen } from "./storefronts-screen";

/** What the page's gates decided: who is asking and what they may do. */
export interface LocationsGate {
    businessName: string;
    /** The location in the address (`?storefront=`), if any. */
    chosen?: string;
    /** For who may manage a roster: its owner (`peopleAccess`). */
    userId: string;
    organization: Pick<Organization, "actions" | "role"> | null;
    /** `store:create`; the plan's room is the list's. */
    mayCreate: boolean;
    canEdit: boolean;
    canUploadLogo: boolean;
    canClose: boolean;
    canLinkCustomers: boolean;
}

/**
 * Sell › Locations on React Query (DEC-259): the list of locations, then
 * the chosen one's page, each read in the browser. The location in the
 * address is read beside the list, not after it; an id the list doesn't
 * have falls back to the first, as before. A list that fails is the
 * route's error page; a location that fails says so in its own place.
 */
export function LocationsContainer(gate: LocationsGate) {
    return (
        <LocationSaveProvider>
            <Locations {...gate} />
        </LocationSaveProvider>
    );
}

function Locations({
    chosen,
    userId,
    organization,
    mayCreate,
    ...gate
}: LocationsGate) {
    const list = useLocations();
    const storefronts = list.data?.storefronts;
    const chosenId = storefronts
        ? (storefronts.find((s) => s.id === chosen) ?? storefronts.at(0))?.id
        : chosen;
    // One closed here is never asked for again, not even on its way out.
    const { gone } = useLocationSave();
    const location = useLocation(
        chosenId && !gone.includes(chosenId) ? chosenId : undefined,
    );

    if (list.isError && !list.data) throw list.error;
    if (!list.data || !storefronts) {
        // The route's own loader, so nothing moves when the list lands.
        return (
            <PageLoading
                shape="settings"
                width="full"
                breadcrumb={["Sell", "Location"]}
                label="Loading the location"
            />
        );
    }

    const { limit, site, notTakingOrders } = list.data;
    const view = location.data;
    const roster = view?.roster;
    return (
        <PageContainer width="full">
            <StorefrontsScreen
                {...gate}
                storefronts={storefronts}
                selected={view?.settings ?? null}
                details={view?.details}
                people={
                    roster
                        ? {
                              ...roster,
                              ...peopleAccess(
                                  roster.members,
                                  userId,
                                  organization,
                              ),
                          }
                        : null
                }
                chosenId={chosenId}
                site={site}
                canCreate={
                    mayCreate &&
                    mayAddStorefront(
                        limit === null
                            ? null
                            : { used: storefronts.length, limit },
                    )
                }
                notTakingOrders={notTakingOrders}
                loading={Boolean(chosenId) && !view && !location.isError}
                onRetry={() => void location.refetch()}
            />
        </PageContainer>
    );
}
