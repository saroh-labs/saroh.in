import { SessionTab } from "@/components/business/session-tab";
import { SiteTrackers } from "@/components/business/site-trackers";
import { Panel } from "@/components/panel";
import { EmptyPanel } from "@/components/states/empty-panel";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";
import { can } from "@/lib/console";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Website and payments", organizationId) };
}

/**
 * Website and payments (admin plan U2): each site's own trackers, and the
 * switch for an operator holding `organization:trackers:write`. Its live
 * sites and whether it takes payments are in What they see, on Overview,
 * until U6 rebuilds this tab around them.
 */
export default async function WebsiteTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const trackersWrite = can(staff, "organization:trackers:write");
    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const { facts } = view;
                const id = facts.id;
                return (
                    <>
                        {" "}
                        {view.sites ? (
                            <Panel
                                title="Trackers"
                                description="Each site's own trackers. Switched off, none load, whatever the plan, until Saroh switches them back on."
                                data={view.sites}
                            >
                                {(sites) => (
                                    <SiteTrackers
                                        organizationId={id}
                                        sites={sites}
                                        canSwitch={trackersWrite}
                                    />
                                )}
                            </Panel>
                        ) : (
                            <EmptyPanel
                                title="No trackers to show"
                                description="Its sites and their trackers couldn't be read from this API."
                            />
                        )}
                    </>
                );
            }}
        </SessionTab>
    );
}
