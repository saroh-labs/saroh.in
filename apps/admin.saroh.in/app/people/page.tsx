import { Badge } from "@saroh/ui/badge";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterText } from "@/components/filter-bar";
import { requireStaff } from "@/lib/console";
import { formatRelative, plural } from "@/lib/format";
import { searchPeople } from "@/lib/people";

export const metadata = { title: "People" };

/**
 * Find anyone on the instance by email, name or id (plan U6). Every search
 * reads personal data, so it needs its own permission and is on the record.
 */
export default async function PeoplePage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const q = (await searchParams).q?.trim() ?? "";
    const results =
        q.length >= 2 ? await searchPeople(q).catch(() => undefined) : null;

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "People"]}
                    title="People"
                    description="Anyone with an account on this instance: which businesses they belong to, and whether they are signed in."
                />
                <FilterBar action="/people" active={q !== ""}>
                    <FilterText
                        label="Find someone"
                        name="q"
                        defaultValue={q}
                        placeholder="Email, name or id"
                    />
                </FilterBar>

                {results === null ? (
                    <EmptyState
                        title="Search for someone"
                        description="At least two characters of their email, name or account id. Every search is recorded."
                    />
                ) : results === undefined ? (
                    <FailedState title="The search could not be run" />
                ) : results.length === 0 ? (
                    <EmptyState
                        title="Nobody matches"
                        description="Try part of their email instead."
                    />
                ) : (
                    <ul className="grid gap-2">
                        {results.map((person) => (
                            <li key={person.id}>
                                <Link
                                    href={`/people/${person.id}`}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="grid min-w-0 gap-0.5">
                                        <span className="truncate font-medium">
                                            {person.name ?? person.email}
                                        </span>
                                        <span className="truncate text-sm text-muted-foreground">
                                            {person.email}
                                        </span>
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        {person.isStaff && (
                                            <Badge variant="info">Staff</Badge>
                                        )}
                                        {!person.emailVerified && (
                                            <Badge variant="warning">
                                                Email not verified
                                            </Badge>
                                        )}
                                        {plural(
                                            person.businesses,
                                            "business",
                                            "businesses",
                                        )}{" "}
                                        · seen{" "}
                                        {formatRelative(person.lastSeenAt)}
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </PageContainer>
        </AdminShell>
    );
}
