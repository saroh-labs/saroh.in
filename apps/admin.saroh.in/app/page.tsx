import { getServerSession } from "@saroh/auth/next";
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
        <AdminShell email={staff.email} viaBootstrap={staff.viaBootstrap}>
            <main className="mx-auto max-w-5xl p-6 sm:p-8">
                <h1 className="text-2xl font-semibold">Platform</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Aggregate health across every tenant. No customer records
                    are shown here.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat
                        label="Organizations"
                        value={metrics.organizations.total}
                        hint={`${metrics.organizations.createdLast30Days} new in 30 days`}
                    />
                    <Stat
                        label="Users"
                        value={metrics.users.total}
                        hint={`${metrics.users.verified} verified · ${metrics.users.createdLast30Days} new in 30 days`}
                    />
                    <Stat
                        label="Orders"
                        value={metrics.commerce.orders}
                        hint={`${metrics.commerce.openOrders} open`}
                    />
                    <Stat
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

function Stat({
    label,
    value,
    hint,
}: {
    label: string;
    value: number;
    hint: string;
}) {
    return (
        <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
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
    return (
        <div className="rounded-lg border p-4">
            <h2 className="font-medium">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
            </p>
            {rows.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
            ) : (
                <ul className="mt-4 grid gap-2">
                    {rows.map((row) => (
                        <li
                            key={row.key}
                            className="flex items-center justify-between gap-4 text-sm"
                        >
                            <span className="truncate">{row.label}</span>
                            <span className="tabular-nums">{row.value}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
