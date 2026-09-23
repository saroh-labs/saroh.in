import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { Pager } from "@/components/operations/pager";
import { Panel } from "@/components/panel";
import { InviteBatch } from "@/components/waitlist/invite-batch";
import { can, requireStaff } from "@/lib/console";
import { formatDate, formatRelative } from "@/lib/format";
import { param } from "@/lib/params";
import { getWaitlistSummary, listWaitlist } from "@/lib/waitlist";

export const metadata = { title: "Waitlist" };

/**
 * Who is waiting to be let in (plan U11, R17), by where they came from and
 * how long they have waited — oldest first — and a batch invite that opens
 * the door to them.
 */
export default async function WaitlistPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const params = {
        state: raw.state === "invited" ? "invited" : undefined,
        source: param(raw.source),
        cursor: param(raw.cursor),
    };
    const [summary, page] = await Promise.all([
        getWaitlistSummary().catch(() => null),
        listWaitlist(params).catch(() => undefined),
    ]);
    const waitingHere =
        params.state === "invited"
            ? []
            : (page?.items.map((row) => row.id) ?? []);
    const canInvite =
        can(staff, "waitlist:invite") && summary?.canInvite === true;

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Waitlist"]}
                    title="Waitlist"
                    description="People who asked to hear when this instance was ready for them. Inviting them is what opens signup."
                    actions={
                        canInvite && waitingHere.length > 0 ? (
                            <InviteBatch ids={waitingHere} />
                        ) : undefined
                    }
                />

                {summary && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="Waiting"
                            value={summary.waiting}
                            hint={
                                summary.oldestWaitingDays > 0
                                    ? `longest for ${summary.oldestWaitingDays} days`
                                    : undefined
                            }
                        />
                        <StatCard label="Invited" value={summary.invited} />
                        <StatCard
                            label="Joined the list, last week"
                            value={summary.joinedLastWeek}
                        />
                        <StatCard
                            label="Sources"
                            value={summary.bySource.length}
                        />
                    </div>
                )}

                {summary && !summary.canInvite && (
                    <p className="max-w-[68ch] text-sm text-muted-foreground">
                        This instance does not know where people create their
                        account, so nobody can be invited yet. Set{" "}
                        <code>ACCOUNTS_URL</code> on the API.
                    </p>
                )}

                {summary && summary.bySource.length > 0 && (
                    <Panel
                        title="Where they came from"
                        description="Everyone still waiting, by the page they signed up on."
                    >
                        {() => (
                            <ul className="grid gap-1.5 text-sm">
                                {summary.bySource.map((row) => (
                                    <li
                                        key={row.source ?? "none"}
                                        className="flex justify-between gap-3"
                                    >
                                        <span className="min-w-0 truncate">
                                            {row.source ?? "Not recorded"}
                                        </span>
                                        <span className="tabular-nums">
                                            {row.count}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                )}

                <FilterBar
                    action="/waitlist"
                    active={Boolean(params.state ?? params.source)}
                >
                    <FilterSelect
                        label="Showing"
                        name="state"
                        defaultValue={params.state}
                        options={[{ value: "invited", label: "Invited" }]}
                    />
                    <FilterSelect
                        label="Source"
                        name="source"
                        defaultValue={params.source}
                        options={[
                            { value: "none", label: "Not recorded" },
                            ...(summary?.bySource ?? []).flatMap((row) =>
                                row.source
                                    ? [{ value: row.source, label: row.source }]
                                    : [],
                            ),
                        ]}
                    />
                </FilterBar>

                {page === undefined ? (
                    <FailedState title="The waitlist could not be read" />
                ) : page === null ? (
                    <FailedState title="Your access does not cover the waitlist" />
                ) : page.items.length === 0 ? (
                    <EmptyState
                        title={
                            params.state === "invited"
                                ? "Nobody invited yet"
                                : "Nobody is waiting"
                        }
                        description="Signups from the public site appear here."
                    />
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-xl border bg-card">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                        <th className="px-4 py-2.5 font-semibold">
                                            Email
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            Source
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            {params.state === "invited"
                                                ? "Invited"
                                                : "Waiting since"}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {page.items.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-b last:border-0"
                                        >
                                            <td className="break-all px-4 py-2.5">
                                                {row.email}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">
                                                {row.source ?? "—"}
                                            </td>
                                            <td
                                                className="px-4 py-2.5"
                                                title={formatDate(
                                                    row.invitedAt ??
                                                        row.createdAt,
                                                )}
                                            >
                                                {formatRelative(
                                                    row.invitedAt ??
                                                        row.createdAt,
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pager
                            base="/waitlist"
                            params={params}
                            nextCursor={page.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
