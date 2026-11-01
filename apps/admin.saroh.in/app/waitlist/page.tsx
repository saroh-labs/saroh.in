import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { Pager } from "@/components/operations/pager";
import { FailedPanel } from "@/components/states/failed-panel";
import { InviteBatch } from "@/components/waitlist/invite-batch";
import {
    WaitlistBreakdowns,
    WaitlistTiles,
} from "@/components/waitlist/waitlist-summary";
import { WaitlistTable } from "@/components/waitlist/waitlist-table";
import { can, requireStaff } from "@/lib/console";
import { countryName } from "@/lib/format";
import { param } from "@/lib/params";
import {
    getWaitlistSummary,
    listWaitlist,
    WAITLIST_KIND_LABELS,
} from "@/lib/waitlist";

export const metadata = { title: "Waitlist" };

const STATES = ["invited", "tools"] as const;

/**
 * Who is waiting to be let in (plan U11, R17; marketing U30): what kind of
 * business, in which city, from where, who sent them and how long they have
 * waited — oldest first — and a batch invite that opens the door to them.
 * Free-tool email gates are not waiting for Saroh: they are left out of
 * Waiting and the invite, and "Came from a free tool" lists them.
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
    const state = STATES.find((value) => value === raw.state);
    const params = {
        state,
        email: param(raw.email),
        source: param(raw.source),
        kind: param(raw.kind),
        city: param(raw.city),
        country: param(raw.country),
        cursor: param(raw.cursor),
    };
    const [summary, page] = await Promise.all([
        getWaitlistSummary().catch(() => undefined),
        listWaitlist(params).catch(() => undefined),
    ]);
    const waitingHere =
        state === undefined ? (page?.items.map((row) => row.id) ?? []) : [];
    const canRemove = can(staff, "waitlist:invite");
    // Invite stays in the header while there is someone to invite; when
    // invites can't go it is disabled, saying why (admin audit F6).
    const blocker =
        summary === undefined || summary === null
            ? "The counts couldn't be read, so Saroh can't tell if invites can go. Try again."
            : summary.canInvite
              ? null
              : (summary.inviteBlocker ??
                "Invites are off until invite emails are set up.");
    const filtered = Boolean(
        state ??
        params.email ??
        params.source ??
        params.kind ??
        params.city ??
        params.country,
    );

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Help customers", "Waitlist"]}
                    title="Waitlist"
                    description="People who asked to hear when Saroh was ready for them. Inviting them is what opens signup."
                    actions={
                        canRemove && waitingHere.length > 0 ? (
                            <InviteBatch ids={waitingHere} blocked={blocker} />
                        ) : undefined
                    }
                />

                {summary === undefined ? (
                    <FailedPanel
                        things="the counts"
                        reassurance="The list below is current."
                    />
                ) : summary ? (
                    <WaitlistTiles summary={summary} />
                ) : null}

                <FilterBar action="/waitlist" active={filtered}>
                    <FilterSelect
                        label="Showing"
                        name="state"
                        anyLabel="Waiting"
                        defaultValue={state}
                        options={[
                            { value: "invited", label: "Invited" },
                            { value: "tools", label: "Came from a free tool" },
                        ]}
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
                        label="Country"
                        name="country"
                        defaultValue={params.country}
                        options={[
                            ...(summary?.byCountry ?? []).flatMap((row) =>
                                row.country
                                    ? [
                                          {
                                              value: row.country,
                                              label: countryName(row.country),
                                          },
                                      ]
                                    : [],
                            ),
                            { value: "none", label: "Not recorded" },
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
                    {params.email && (
                        <input
                            type="hidden"
                            name="email"
                            value={params.email}
                        />
                    )}
                </FilterBar>

                {page === undefined ? (
                    <FailedPanel things="the waitlist" />
                ) : page === null ? (
                    <FailedState title="Your access does not cover the waitlist" />
                ) : page.items.length === 0 ? (
                    <EmptyState
                        title={
                            state === "invited"
                                ? "Nobody invited yet"
                                : state === "tools"
                                  ? "Nobody from a free tool"
                                  : "Nobody is waiting"
                        }
                        description="Signups from the public site appear here."
                    />
                ) : (
                    <>
                        <WaitlistTable
                            rows={page.items}
                            invited={state === "invited"}
                            canRemove={canRemove}
                        />
                        <Pager
                            base="/waitlist"
                            params={params}
                            nextCursor={page.nextCursor}
                        />
                    </>
                )}

                {/* After the list, so on a phone the people come first. */}
                {summary && <WaitlistBreakdowns summary={summary} />}
            </PageContainer>
        </AdminShell>
    );
}
