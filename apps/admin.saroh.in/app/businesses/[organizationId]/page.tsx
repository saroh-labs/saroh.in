import { Badge } from "@saroh/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { CloseAccess } from "@/components/business/close-access";
import { LifecycleActions } from "@/components/business/lifecycle-actions";
import {
    ATTENTION_LABEL,
    LifecycleBadge,
} from "@/components/business/lifecycle-badge";
import {
    ModuleToggle,
    RepairModules,
} from "@/components/business/module-actions";
import { NotesPanel } from "@/components/business/notes-panel";
import { OpenAccess } from "@/components/business/open-access";
import { PlanActions, RevokeLimit } from "@/components/business/plan-actions";
import { Facts, Panel } from "@/components/panel";
import type { BusinessRow, BusinessView, PlanOption } from "@/lib/businesses";
import {
    getBusinessSummary,
    getBusinessView,
    listPlans,
} from "@/lib/businesses";
import { can, requireStaff } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";
import {
    asWords,
    camelToWords,
    formatDate,
    formatDateTime,
    formatRelative,
    plural,
} from "@/lib/format";
import { moduleLabel } from "@/lib/modules";

export const metadata = { title: "Business" };

/**
 * Everything about one business in one place (plan U4), and what an operator
 * may change about it (U5). The details sit behind a support session; the
 * directory row is all that shows until one is open.
 */
export default async function BusinessPage({
    params,
}: {
    params: Promise<{ organizationId: string }>;
}) {
    const gate = await requireStaff("organization:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { organizationId } = await params;

    const summary = await getBusinessSummary(organizationId).catch(() => null);
    if (!summary) notFound();

    const canViewAs = can(staff, "organization:view-as");
    const result = canViewAs ? await getBusinessView(organizationId) : null;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Businesses", summary.name]}
                    title={summary.name}
                    description={
                        <span className="font-mono text-[12.5px]">
                            {summary.slug} · {summary.id}
                        </span>
                    }
                    actions={
                        result?.status === "ok" ? (
                            <CloseAccess organizationId={organizationId} />
                        ) : undefined
                    }
                />

                <SummaryStrip summary={summary} />

                {!canViewAs ? (
                    <PermissionDeniedState
                        title="Opening a business needs support access"
                        description="Your access covers the directory, not a business's own details."
                        note="A Platform Owner can add the Support role to your access."
                    />
                ) : result?.status === "ok" ? (
                    <Business
                        staff={staff}
                        view={result.view}
                        plans={
                            can(staff, "subscription:read")
                                ? ((await listPlans().catch(() => null)) ?? [])
                                : []
                        }
                    />
                ) : result?.status === "not-found" ? (
                    notFound()
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-[15px]">
                                Open support access
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <p className="max-w-[68ch] text-sm text-muted-foreground">
                                Read-only, for thirty minutes, and written into
                                the trail with your name and reason on it. You
                                see what an operator needs — people, modules,
                                plan, activity — and never the business&rsquo;s
                                own customers.
                            </p>
                            <OpenAccess organizationId={organizationId} />
                        </CardContent>
                    </Card>
                )}
            </PageContainer>
        </AdminShell>
    );
}

function SummaryStrip({ summary }: { summary: BusinessRow }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <LifecycleBadge status={summary.lifecycleStatus} />
            {summary.attention.map((reason) => (
                <Badge key={reason} variant="warning">
                    {ATTENTION_LABEL[reason]}
                </Badge>
            ))}
            <span className="text-muted-foreground">
                {summary.plan ? summary.plan.name : "No plan"} ·{" "}
                {plural(summary.members, "person", "people")} · last active{" "}
                {formatRelative(summary.lastActiveAt)}
            </span>
        </div>
    );
}

function Business({
    staff,
    view,
    plans,
}: {
    staff: StaffIdentity;
    view: BusinessView;
    plans: PlanOption[];
}) {
    const { facts } = view;
    const id = facts.id;
    const lifecycleWrite = can(staff, "organization:lifecycle:write");
    const subscriptionWrite = can(staff, "subscription:override");
    const modulesWrite = can(staff, "organization:modules:write");

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid min-w-0 content-start gap-6">
                <Panel
                    title="People"
                    description="Who belongs to this business, and their role in it."
                    data={view.people}
                >
                    {(people) => (
                        <div className="grid gap-4">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <th className="py-2 pr-3 font-semibold">
                                                Person
                                            </th>
                                            <th className="py-2 pr-3 font-semibold">
                                                Role
                                            </th>
                                            <th className="py-2 font-semibold">
                                                Email
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {people.members.map((member) => (
                                            <tr
                                                key={member.membershipId}
                                                className="border-b last:border-0"
                                            >
                                                <td className="py-2 pr-3">
                                                    {member.name ?? (
                                                        <span className="text-muted-foreground">
                                                            No name
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {asWords(member.role)}
                                                </td>
                                                <td className="py-2">
                                                    {member.email ? (
                                                        <span className="break-all">
                                                            {member.email}
                                                            {!member.emailVerified && (
                                                                <span className="text-muted-foreground">
                                                                    {" "}
                                                                    · not
                                                                    verified
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            Hidden
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {people.invitations.length > 0 && (
                                <p className="text-sm text-muted-foreground">
                                    {plural(
                                        people.invitations.length,
                                        "invitation",
                                    )}{" "}
                                    waiting:{" "}
                                    {people.invitations
                                        .map(
                                            (invite) =>
                                                `${invite.email ?? "hidden"} as ${asWords(invite.role)}`,
                                        )
                                        .join("; ")}
                                </p>
                            )}
                        </div>
                    )}
                </Panel>

                <Panel
                    title="Modules"
                    description="What this business has switched on."
                    actions={
                        modulesWrite ? (
                            <RepairModules organizationId={id} />
                        ) : undefined
                    }
                    data={view.modules}
                >
                    {(modules) => (
                        <ul className="grid gap-1 sm:grid-cols-2">
                            {modules.map((module) => (
                                <li
                                    key={module.key}
                                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1.5"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {module.label}
                                        </p>
                                        <p className="truncate text-[12.5px] text-muted-foreground">
                                            {module.status === "ENABLED"
                                                ? "On"
                                                : module.status ===
                                                    "NOT_INSTALLED"
                                                  ? "Never set up"
                                                  : asWords(module.status)}
                                            {module.dependencies.length > 0 &&
                                                ` · needs ${module.dependencies.map(moduleLabel).join(", ")}`}
                                        </p>
                                    </div>
                                    {modulesWrite &&
                                        module.status !== "ARCHIVED" && (
                                            <ModuleToggle
                                                organizationId={id}
                                                moduleKey={module.key}
                                                label={module.label}
                                                enabled={
                                                    module.status === "ENABLED"
                                                }
                                            />
                                        )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel
                    title="Plan and limits"
                    description="What the plan grants, what applies now, and how much is in use."
                    data={view.plan}
                >
                    {(plan) => (
                        <div className="grid gap-4">
                            <Facts
                                rows={[
                                    [
                                        "Plan",
                                        plan.subscription
                                            ? `${plan.subscription.plan.name} (v${plan.subscription.plan.version})`
                                            : "No plan — the free floor applies",
                                    ],
                                    [
                                        "Status",
                                        plan.subscription
                                            ? asWords(plan.subscription.status)
                                            : "—",
                                    ],
                                    [
                                        plan.subscription?.status === "TRIALING"
                                            ? "Trial ends"
                                            : "Period ends",
                                        formatDate(
                                            plan.subscription?.currentPeriodEnd,
                                        ),
                                    ],
                                ]}
                            />
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[440px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <th className="py-2 pr-3 font-semibold">
                                                Limit
                                            </th>
                                            <th className="py-2 pr-3 text-right font-semibold">
                                                In use
                                            </th>
                                            <th className="py-2 pr-3 text-right font-semibold">
                                                Allowed
                                            </th>
                                            <th className="py-2 font-semibold" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {plan.limits.map((limit) => (
                                            <tr
                                                key={limit.key}
                                                className="border-b last:border-0"
                                            >
                                                <td className="py-2 pr-3">
                                                    {camelToWords(limit.key)}
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {limit.usage ?? (
                                                        <span className="text-muted-foreground">
                                                            Not measured
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {describeLimit(
                                                        limit.effective,
                                                    )}
                                                    {limit.override && (
                                                        <span className="block text-[12.5px] text-muted-foreground">
                                                            raised until{" "}
                                                            {formatDate(
                                                                limit.override
                                                                    .expiresAt,
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 text-right">
                                                    {limit.override &&
                                                        subscriptionWrite && (
                                                            <RevokeLimit
                                                                organizationId={
                                                                    id
                                                                }
                                                                overrideId={
                                                                    limit
                                                                        .override
                                                                        .id
                                                                }
                                                                label={camelToWords(
                                                                    limit.key,
                                                                )}
                                                                expiresAt={
                                                                    limit
                                                                        .override
                                                                        .expiresAt
                                                                }
                                                            />
                                                        )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {subscriptionWrite && (
                                <PlanActions
                                    organizationId={id}
                                    plans={plans}
                                    currentPlanId={
                                        plan.subscription?.plan.id ?? null
                                    }
                                    subscriptionStatus={
                                        plan.subscription?.status ?? null
                                    }
                                    numericLimits={plan.limits.flatMap(
                                        (limit) =>
                                            typeof limit.planValue === "number"
                                                ? [
                                                      {
                                                          key: limit.key,
                                                          planValue:
                                                              limit.planValue,
                                                      },
                                                  ]
                                                : [],
                                    )}
                                />
                            )}
                        </div>
                    )}
                </Panel>

                <Panel
                    title="What the business did"
                    description="Its own recent activity. What operators did to it is a separate list."
                    data={view.activity}
                >
                    {(rows) =>
                        rows.length === 0 ? (
                            <EmptyState title="No recorded activity yet" />
                        ) : (
                            <Timeline
                                rows={rows.map((row) => ({
                                    id: row.id,
                                    title: asWords(row.action),
                                    detail: `${row.actor ?? (row.actorUserId.startsWith("system:") ? "Saroh, automatically" : "Someone")}${row.outcome === "SUCCESS" ? "" : ` · ${asWords(row.outcome)}`}`,
                                    at: row.createdAt,
                                }))}
                            />
                        )
                    }
                </Panel>
            </div>

            <aside className="grid min-w-0 content-start gap-6">
                <Panel
                    title="State"
                    description="Where this business stands on the instance."
                >
                    {() => (
                        <div className="grid gap-4">
                            <Facts
                                rows={[
                                    [
                                        "State",
                                        <LifecycleBadge
                                            key="s"
                                            status={facts.lifecycleStatus}
                                        />,
                                    ],
                                    [
                                        "On this instance since",
                                        formatDate(facts.createdAt),
                                    ],
                                    ...(facts.suspendedAt
                                        ? ([
                                              [
                                                  "Suspended",
                                                  formatDateTime(
                                                      facts.suspendedAt,
                                                  ),
                                              ],
                                              [
                                                  "Why",
                                                  facts.suspensionReason ?? "—",
                                              ],
                                          ] as [string, string][])
                                        : []),
                                    ...(facts.deletionScheduledAt
                                        ? ([
                                              [
                                                  "Deletion on",
                                                  formatDate(
                                                      facts.deletionScheduledAt,
                                                  ),
                                              ],
                                              [
                                                  "Why",
                                                  facts.deletionReason ?? "—",
                                              ],
                                          ] as [string, string][])
                                        : []),
                                    ["Time zone", facts.timezone ?? "Not set"],
                                    [
                                        "Holds",
                                        `${plural(facts.counts.sites, "site")}, ${plural(facts.counts.orders, "order")} (${facts.counts.openOrders} open), ${plural(facts.counts.bookings, "booking")}, ${plural(facts.counts.contacts, "contact")}`,
                                    ],
                                ]}
                            />
                            {lifecycleWrite && (
                                <LifecycleActions
                                    organizationId={id}
                                    name={facts.name}
                                    status={facts.lifecycleStatus}
                                />
                            )}
                        </div>
                    )}
                </Panel>

                <Panel
                    title="Notes"
                    description="For the next operator. The business never sees them."
                    data={view.notes}
                >
                    {(notes) => (
                        <NotesPanel
                            organizationId={id}
                            notes={notes}
                            canWrite
                        />
                    )}
                </Panel>

                <Panel
                    title="What operators did"
                    description="Every operator action on this business, with the reason given."
                    data={view.operatorActions}
                >
                    {(rows) =>
                        rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nothing yet.
                            </p>
                        ) : (
                            <Timeline
                                rows={rows.map((row) => ({
                                    id: row.id,
                                    title: asWords(row.action),
                                    detail: [
                                        row.reason,
                                        row.actor ?? "An operator",
                                    ]
                                        .filter(Boolean)
                                        .join(" · "),
                                    at: row.createdAt,
                                }))}
                            />
                        )
                    }
                </Panel>
            </aside>
        </div>
    );
}

function Timeline({
    rows,
}: {
    rows: { id: string; title: string; detail: string; at: string }[];
}) {
    return (
        <ol className="grid gap-3">
            {rows.map((row) => (
                <li key={row.id} className="grid gap-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{row.title}</span>
                        <time
                            dateTime={row.at}
                            className="font-mono text-[12px] text-muted-foreground"
                        >
                            {formatDateTime(row.at)}
                        </time>
                    </div>
                    <p className="break-words text-[13px] text-muted-foreground">
                        {row.detail}
                    </p>
                </li>
            ))}
        </ol>
    );
}

function describeLimit(value: number | boolean | null): string {
    if (value === null) return "No limit";
    if (typeof value === "boolean") return value ? "Included" : "Not included";
    return String(value);
}
