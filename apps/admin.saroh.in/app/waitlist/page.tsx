import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { Pager } from "@/components/operations/pager";
import { Panel } from "@/components/panel";
import { InviteBatch } from "@/components/waitlist/invite-batch";
import { RemoveEntry } from "@/components/waitlist/remove-entry";
import { can, requireStaff } from "@/lib/console";
import { formatDate, formatRelative } from "@/lib/format";
import { param } from "@/lib/params";
import {
    getWaitlistSummary,
    kindLabel,
    listWaitlist,
    WAITLIST_KIND_LABELS,
} from "@/lib/waitlist";

export const metadata = { title: "Waitlist" };

/**
 * Who is waiting to be let in (plan U11, R17; marketing U30): what kind of
 * business, in which city, from where, who sent them and how long they have
 * waited — oldest first — and a batch invite that opens the door to them.
 */
export default async function WaitlistPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("waitlist:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const params = {
        state: raw.state === "invited" ? "invited" : undefined,
        source: param(raw.source),
        kind: param(raw.kind),
        city: param(raw.city),
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
    const canRemove = can(staff, "waitlist:invite");
    const filtered = Boolean(
        params.state ?? params.source ?? params.kind ?? params.city,
    );

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

                {summary && (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <CountPanel
                            title="Kind of business"
                            description="Everyone still waiting, by the kind they picked."
                            rows={summary.byKind.map((row) => ({
                                key: row.kind ?? "none",
                                label: kindLabel(row.kind),
                                count: row.count,
                            }))}
                        />
                        <CountPanel
                            title="Where they came from"
                            description="Everyone still waiting, by the page or link they signed up from."
                            rows={summary.bySource.map((row) => ({
                                key: row.source ?? "none",
                                label: row.source ?? "Not recorded",
                                count: row.count,
                            }))}
                        />
                        <CountPanel
                            title="Cities"
                            description="The cities people typed, most first. City is optional."
                            rows={summary.byCity.map((row) => ({
                                key: row.city.toLowerCase(),
                                label: row.city,
                                count: row.count,
                            }))}
                        />
                        <CountPanel
                            title="Top referrers"
                            description="Who sent the most people through their link. A self-referral is not counted."
                            rows={summary.topReferrers.map((row) => ({
                                key: row.id,
                                label: row.businessName ?? row.email,
                                count: row.referrals,
                            }))}
                        />
                    </div>
                )}

                <FilterBar action="/waitlist" active={filtered}>
                    <FilterSelect
                        label="Showing"
                        name="state"
                        defaultValue={params.state}
                        options={[{ value: "invited", label: "Invited" }]}
                    />
                    <FilterSelect
                        label="Kind"
                        name="kind"
                        defaultValue={params.kind}
                        options={[
                            ...Object.entries(WAITLIST_KIND_LABELS).map(
                                ([value, label]) => ({ value, label }),
                            ),
                            { value: "none", label: "Not recorded" },
                        ]}
                    />
                    <FilterSelect
                        label="City"
                        name="city"
                        defaultValue={params.city}
                        options={[
                            ...(summary?.byCity ?? []).map((row) => ({
                                value: row.city,
                                label: row.city,
                            })),
                            { value: "none", label: "Not given" },
                        ]}
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
                            <table className="w-full min-w-[880px] text-sm">
                                <thead>
                                    <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                        <th className="px-4 py-2.5 font-semibold">
                                            #
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            Business
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            Kind
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            City
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            Source
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-semibold">
                                            Referred
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">
                                            {params.state === "invited"
                                                ? "Invited"
                                                : "Waiting since"}
                                        </th>
                                        {canRemove && (
                                            <th className="px-4 py-2.5">
                                                <span className="sr-only">
                                                    Actions
                                                </span>
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {page.items.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                                                {row.position}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium">
                                                    {row.businessName ?? "—"}
                                                </div>
                                                <div className="break-all text-muted-foreground">
                                                    {row.email}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {row.kind
                                                    ? kindLabel(row.kind)
                                                    : "—"}
                                                {row.plan && (
                                                    <div className="text-muted-foreground">
                                                        Asked about {row.plan}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {row.city ?? "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">
                                                {row.source ?? "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">
                                                {row.referrals}
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
                                            {canRemove && (
                                                <td className="px-4 py-2.5 text-right">
                                                    <RemoveEntry
                                                        id={row.id}
                                                        label={
                                                            row.businessName ??
                                                            row.email
                                                        }
                                                    />
                                                </td>
                                            )}
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

/** One breakdown of the list: a label and a count per line, biggest first. */
function CountPanel({
    title,
    description,
    rows,
}: {
    title: string;
    description: string;
    rows: { key: string; label: string; count: number }[];
}) {
    return (
        <Panel title={title} description={description}>
            {() =>
                rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing yet.
                    </p>
                ) : (
                    <ul className="grid gap-1.5 text-sm">
                        {rows.map((row) => (
                            <li
                                key={row.key}
                                className="flex justify-between gap-3"
                            >
                                <span className="min-w-0 truncate">
                                    {row.label}
                                </span>
                                <span className="tabular-nums">
                                    {row.count}
                                </span>
                            </li>
                        ))}
                    </ul>
                )
            }
        </Panel>
    );
}
