import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";

import { SessionTab } from "@/components/business/session-tab";
import { SiteTrackers } from "@/components/business/site-trackers";
import { WebsiteTab } from "@/components/business/website-tab";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readOverview,
    readSummary,
    tabTitle,
} from "@/lib/business-page";
import { can } from "@/lib/console";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Website and payments", organizationId) };
}

/**
 * Website and payments (admin plan U6, R7): each site and whether it is
 * published, the payments connection, and each site's trackers.
 *
 * Sites and payments come from the Overview's read (`organization:read`,
 * no support session, R10). Trackers name who switched them off and why,
 * so they read inside a support session, with the switch for an operator
 * holding `organization:trackers:write`.
 */
export default async function WebsiteTabPage({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    const [summary, overview] = await Promise.all([
        readSummary(organizationId),
        readOverview(organizationId).catch(() => undefined),
    ]);
    if (overview === undefined) {
        return (
            <FailedPanel
                things="their website and payments"
                reassurance="The rest of the page is current."
            />
        );
    }
    if (overview === null) {
        return (
            <PermissionDeniedState
                title="This business isn't one of yours"
                description="Your access covers the businesses you look after."
            />
        );
    }

    const trackersWrite = can(staff, "organization:trackers:write");
    return (
        <WebsiteTab
            businessName={summary?.name ?? "there"}
            website={overview.website}
            trackers={
                <SessionTab staff={staff} organizationId={organizationId}>
                    {(view) =>
                        !view.sites ? (
                            <EmptyPanel
                                size="inline"
                                title="No trackers to show"
                                description="Its sites' trackers couldn't be read from this API."
                            />
                        ) : view.sites.status === "failed" ? (
                            <FailedState
                                size="inline"
                                title="Couldn't load the trackers"
                                description="Nothing has been changed. Reload to try again."
                            />
                        ) : (
                            <SiteTrackers
                                organizationId={view.facts.id}
                                sites={view.sites.data}
                                canSwitch={trackersWrite}
                            />
                        )
                    }
                </SessionTab>
            }
        />
    );
}
