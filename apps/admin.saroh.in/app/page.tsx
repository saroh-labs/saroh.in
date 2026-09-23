import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { getMetrics, getStaffIdentity } from "@/lib/control-plane";
import { requireSession } from "@/lib/session";

/**
 * Overview — how the instance is doing, in aggregate. The health board takes
 * the console's front door when it lands (plan U9).
 *
 * Aggregates only, by design: the API's metrics endpoint returns counts and
 * group-bys, never a tenant's records. Per-tenant inspection stays a separate,
 * explicitly-audited surface rather than something this quietly grows into.
 */
/** `COMMERCE` → "Commerce", `page_view` → "Page view": say it in words. */
function asWords(key: string): string {
    const words = key.toLowerCase().replace(/[_.]/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export default async function DashboardPage() {
    const session = await requireSession();

    // The API is the authority on who is staff, not this app's env — see
    // lib/control-plane.ts.
    const staff = await getStaffIdentity();
    if (!staff) return <NotAuthorized email={session.user.email} />;

    const metrics = await getMetrics();
    if (!metrics) return <NotAuthorized email={session.user.email} />;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Instance", "Overview"]}
                    title="Overview"
                    description="Totals across every business on this instance. No business's own records are shown here."
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

                <section className="grid gap-6 lg:grid-cols-2">
                    <Panel
                        title="Module adoption"
                        description="Organizations with each module enabled."
                        empty="No module has been enabled yet."
                        rows={metrics.moduleAdoption.map((row) => ({
                            key: row.moduleKey,
                            label: asWords(row.moduleKey),
                            value: row.organizations,
                        }))}
                    />
                    <Panel
                        title="Activity (30 days)"
                        description="Analytics events captured, by type."
                        empty="No events captured in the last 30 days."
                        rows={metrics.activity.map((row) => ({
                            key: row.type,
                            label: asWords(row.type),
                            value: row.events,
                        }))}
                    />
                </section>
            </PageContainer>
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
                                        // Ink, not Saffron: a set of bars is
                                        // a scale (the brand's W2 ramp), and
                                        // Saffron is saved for the one value
                                        // that matters on a screen.
                                        className="h-full rounded-full bg-primary"
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
