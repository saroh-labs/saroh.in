import { getServerSession } from "@saroh/auth/next";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { accountsLoginUrl } from "@/lib/admin-access";
import { getMetrics, getStaffIdentity } from "@/lib/control-plane";

/**
 * Platform dashboard — how Saroh itself is doing.
 *
 * Aggregates only, by design: the API's metrics endpoint returns counts and
 * group-bys, never a tenant's records. Per-tenant inspection stays a separate,
 * explicitly-audited surface rather than something this quietly grows into.
 */
export default async function DashboardPage() {
    const session = await getServerSession(await headers());
    if (!session) redirect(accountsLoginUrl);

    // The API is the authority on who is staff, not this app's env — see
    // lib/control-plane.ts.
    const staff = await getStaffIdentity();
    if (!staff) return <NotAuthorized email={session.user.email} />;

    const metrics = await getMetrics();
    if (!metrics) return <NotAuthorized email={session.user.email} />;

    return (
        <AdminShell staff={staff}>
            <main className="mx-auto max-w-6xl p-6 sm:p-8">
                <PageHeader
                    title="Platform"
                    description="Aggregate health across every tenant. No customer records are shown here."
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Organizations"
                        value={metrics.organizations.total}
                        hint={`${metrics.organizations.createdLast30Days} new in 30 days`}
                    />
                    <StatCard
                        label="Users"
                        value={metrics.users.total}
                        hint={`${metrics.users.verified} verified · ${metrics.users.createdLast30Days} new in 30 days`}
                    />
                    <StatCard
                        label="Orders"
                        value={metrics.commerce.orders}
                        hint={`${metrics.commerce.openOrders} open`}
                    />
                    <StatCard
                        label="Sites"
                        value={metrics.content.sites}
                        hint={`${metrics.content.publishedSites} published`}
                    />
                </div>

                <section className="mt-8 grid gap-6 lg:grid-cols-2">
                    <Panel
                        title="Module adoption"
                        description="Organizations with each module enabled."
                        empty="No module has been enabled yet."
                        rows={metrics.moduleAdoption.map((row) => ({
                            key: row.moduleKey,
                            label: row.moduleKey,
                            value: row.organizations,
                        }))}
                    />
                    <Panel
                        title="Activity (30 days)"
                        description="Analytics events captured, by type."
                        empty="No events captured in the last 30 days."
                        rows={metrics.activity.map((row) => ({
                            key: row.type,
                            label: row.type,
                            value: row.events,
                        }))}
                    />
                </section>
            </main>
        </AdminShell>
    );
}

function Panel({
    title,
    description,
    empty,
    rows,
}: {
    title: string;
    description: string;
    empty: string;
    rows: { key: string; label: string; value: number }[];
}) {
    // A bar per row, scaled to the largest value: the shape of adoption is the
    // thing an operator reads here, and a bare number column hides it.
    const max = Math.max(1, ...rows.map((row) => row.value));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{empty}</p>
                ) : (
                    <ul className="grid gap-2.5">
                        {rows.map((row) => (
                            <li key={row.key} className="grid gap-1">
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span className="truncate">
                                        {row.label}
                                    </span>
                                    <span className="tabular-nums">
                                        {row.value}
                                    </span>
                                </div>
                                <div
                                    className="h-1 overflow-hidden rounded-full bg-muted"
                                    aria-hidden
                                >
                                    <div
                                        className="h-full rounded-full bg-brand"
                                        style={{
                                            width: `${(row.value / max) * 100}%`,
                                        }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
