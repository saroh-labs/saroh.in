import { PermissionDeniedState } from "@saroh/ui/data-state";
import type { ReactNode } from "react";

import { DeletionPanels } from "@/components/business/deletion-panels";
import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { ActivityCard } from "@/components/business/overview/activity-card";
import { ModulesCard } from "@/components/business/overview/modules-card";
import { PlanCard } from "@/components/business/overview/plan-card";
import { SiteCard } from "@/components/business/overview/site-card";
import { TeamCard } from "@/components/business/overview/team-card";
import { UsageCard } from "@/components/business/overview/usage-card";
import { ReferredBy } from "@/components/business/referred-by";
import { Facts, Panel } from "@/components/panel";
import { FailedPanel } from "@/components/states/failed-panel";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readOverview,
    readPlans,
    readView,
    tabTitle,
} from "@/lib/business-page";
import type { BusinessView } from "@/lib/businesses";
import { can } from "@/lib/console";
import { dataKeptLine, legalHoldLine } from "@/lib/deletion-words";
import { formatDate, formatDateTime, plural } from "@/lib/format";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Overview", organizationId) };
}

/**
 * Overview (admin plan U3, R2): the business at a glance, from one read
 * (`GET …/overview`) that needs `organization:read` and no support session,
 * so Operations, Billing and Release staff see it as Support does. It
 * carries no personal data: names and roles, never emails; activity without
 * who or why; notes as a count. Each card's action opens over Overview.
 */
export default async function OverviewTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    let overview;
    try {
        overview = await readOverview(organizationId);
    } catch {
        overview = undefined;
    }
    if (overview === undefined) {
        return (
            <FailedPanel
                things="the overview"
                reassurance="The rest of the page is current."
            />
        );
    }
    if (overview === null) {
        // Refused: an Account manager on a business that isn't theirs.
        return (
            <PermissionDeniedState
                title="This business isn't one of yours"
                description="Your access covers the businesses you look after."
            />
        );
    }

    const canChangePlan = can(staff, "subscription:override");
    const legacyPlans =
        canChangePlan &&
        can(staff, "subscription:read") &&
        overview.plan.status === "ok" &&
        !overview.plan.data.livePlans
            ? await readPlans()
            : [];

    // Inside an open support session only: where it stands and its way
    // out, which carry reasons. Without one they are simply absent.
    const session = can(staff, "organization:view-as")
        ? await readView(organizationId).catch(() => null)
        : null;
    const view = session?.status === "ok" ? session.view : null;

    return (
        <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <PlanCard
                    organizationId={organizationId}
                    plan={overview.plan}
                    billedTo={overview.billedTo}
                    canOverride={can(staff, "pricing:override")}
                    canChangePlan={canChangePlan}
                    legacyPlans={legacyPlans}
                />
                <UsageCard
                    organizationId={organizationId}
                    usage={overview.usage}
                    canRaise={canChangePlan}
                />
                <ModulesCard
                    organizationId={organizationId}
                    modules={overview.modules}
                />
                <SiteCard
                    organizationId={organizationId}
                    website={overview.website}
                />
                <TeamCard
                    organizationId={organizationId}
                    team={overview.team}
                    accountManager={overview.accountManager}
                    canAssign={can(staff, "accounts:assign")}
                />
                <ActivityCard
                    organizationId={organizationId}
                    activity={overview.activity}
                    notes={overview.notes}
                />
            </div>
            {view && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <StatePanel view={view} />
                    {/* Its way out (#921): refunds it waits on, and the trail. */}
                    <DeletionPanels view={view} />
                </div>
            )}
        </div>
    );
}

/**
 * Where this business stands. Suspend…, Schedule deletion… and the rest of
 * its lifecycle are in the header's ⋯ More actions.
 */
function StatePanel({ view }: { view: BusinessView }) {
    const { facts } = view;
    const hold = facts.legalHold ?? null;
    return (
        <Panel
            title="State"
            description="Where this business stands with Saroh."
        >
            {() => (
                <Facts
                    rows={[
                        [
                            "State",
                            <LifecycleBadge
                                key="s"
                                status={facts.lifecycleStatus}
                            />,
                        ],
                        ["Here since", formatDate(facts.createdAt)],
                        ...(facts.referredBy
                            ? ([
                                  [
                                      "Referred by",
                                      <ReferredBy
                                          key="r"
                                          referredBy={facts.referredBy}
                                      />,
                                  ],
                              ] as [string, ReactNode][])
                            : []),
                        ...(facts.suspendedAt
                            ? ([
                                  [
                                      "Suspended",
                                      formatDateTime(facts.suspendedAt),
                                  ],
                                  ["Why", facts.suspensionReason ?? "—"],
                              ] as [string, string][])
                            : []),
                        ...(hold
                            ? ([
                                  ["Legal hold", legalHoldLine(hold)],
                                  ["Held because", hold.reason ?? "—"],
                              ] as [string, string][])
                            : []),
                        ...(dataKeptLine(facts)
                            ? ([
                                  [
                                      "Deleted",
                                      formatDate(facts.deletedRetainedAt),
                                  ],
                                  ["Its data", dataKeptLine(facts) ?? "—"],
                              ] as [string, string][])
                            : []),
                        ...(facts.deletionScheduledAt
                            ? ([
                                  [
                                      "Deletion on",
                                      formatDate(facts.deletionScheduledAt),
                                  ],
                                  ["Why", facts.deletionReason ?? "—"],
                              ] as [string, string][])
                            : []),
                        ["Time zone", facts.timezone ?? "Not set"],
                        [
                            "What they have",
                            `${plural(facts.counts.sites, "site")}, ${plural(facts.counts.orders, "order")} (${facts.counts.openOrders} open), ${plural(facts.counts.bookings, "booking")}, ${plural(facts.counts.contacts, "contact")}`,
                        ],
                    ]}
                />
            )}
        </Panel>
    );
}
