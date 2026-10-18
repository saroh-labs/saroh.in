import type { ReactNode } from "react";

import { DeletionPanels } from "@/components/business/deletion-panels";
import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { ReferredBy } from "@/components/business/referred-by";
import { SessionTab } from "@/components/business/session-tab";
import { WhatTheySee } from "@/components/business/what-they-see";
import { Facts, Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readModuleState,
    readSummary,
    tabTitle,
} from "@/lib/business-page";
import type {
    BusinessModulesState,
    BusinessRow,
    BusinessView,
    Panel as PanelResult,
} from "@/lib/businesses";
import { can } from "@/lib/console";
import { dataKeptLine, legalHoldLine } from "@/lib/deletion-words";
import {
    formatDate,
    formatDateTime,
    formatRelative,
    plural,
} from "@/lib/format";
import { moduleLabel } from "@/lib/modules";
import { planLine } from "@/lib/plan-words";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Overview", organizationId) };
}

/**
 * Overview (admin plan U2): the directory row's summary, which any staff
 * member who may open the business reads without a support session, then
 * What they see, its state and its way out, which need one. U3 rebuilds
 * this tab as one view from a single read.
 */
export default async function OverviewTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const summary = await readSummary(organizationId);
    if (!summary) return null;
    const moduleState = can(staff, "organization:view-as")
        ? await readModuleState(organizationId)
        : null;

    return (
        <div className="grid gap-6">
            <SummaryPanel summary={summary} />
            <SessionTab staff={staff} organizationId={organizationId}>
                {(view) => (
                    <OverviewDetails
                        view={view}
                        moduleState={moduleState ?? { status: "failed" }}
                    />
                )}
            </SessionTab>
        </div>
    );
}

/** What the directory row says, readable without a session. */
function SummaryPanel({ summary }: { summary: BusinessRow }) {
    return (
        <Panel
            title="Summary"
            description="What the directory says about this business."
        >
            {() => (
                <Facts
                    rows={[
                        [
                            "Plan",
                            planLine(
                                summary.effectivePlan ?? null,
                                summary.plan?.name,
                            ),
                        ],
                        ["People", plural(summary.members, "person", "people")],
                        [
                            "Switched on",
                            summary.enabledModules.length > 0
                                ? summary.enabledModules
                                      .map(moduleLabel)
                                      .join(", ")
                                : "Nothing yet",
                        ],
                        ["Last active", formatRelative(summary.lastActiveAt)],
                        ["Joined", formatDate(summary.createdAt)],
                        [
                            "Address and id",
                            <span key="id" className="font-mono text-[12.5px]">
                                {summary.slug} · {summary.id}
                            </span>,
                        ],
                    ]}
                />
            )}
        </Panel>
    );
}

function OverviewDetails({
    view,
    moduleState,
}: {
    view: BusinessView;
    moduleState: PanelResult<BusinessModulesState>;
}) {
    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid min-w-0 content-start gap-6">
                <Panel
                    title="What they see"
                    description="Their live site, and what they can use now."
                >
                    {() => <WhatTheySee view={view} modules={moduleState} />}
                </Panel>
            </div>
            <aside className="grid min-w-0 content-start gap-6">
                <StatePanel view={view} />
                {/* Its way out (#921): refunds it waits on, and the trail. */}
                <DeletionPanels view={view} />
            </aside>
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
            description="Where this business stands on the instance."
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
                        ["On this instance since", formatDate(facts.createdAt)],
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
                            "Holds",
                            `${plural(facts.counts.sites, "site")}, ${plural(facts.counts.orders, "order")} (${facts.counts.openOrders} open), ${plural(facts.counts.bookings, "booking")}, ${plural(facts.counts.contacts, "contact")}`,
                        ],
                    ]}
                />
            )}
        </Panel>
    );
}
