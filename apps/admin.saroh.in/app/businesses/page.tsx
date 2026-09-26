import { buttonVariants } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { BusinessTable } from "@/components/business/business-table";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import type { BusinessQuery } from "@/lib/businesses";
import { listBusinesses, listPlans } from "@/lib/businesses";
import { can, requireStaff } from "@/lib/console";
import { MODULE_OPTIONS } from "@/lib/modules";

export const metadata = { title: "Businesses" };

const LIFECYCLE_OPTIONS = [
    { value: "ACTIVE", label: "Active" },
    { value: "SUSPENDED", label: "Suspended" },
    { value: "PENDING_DELETION", label: "Deletion scheduled" },
    { value: "DELETED_RETAINED", label: "Deleted" },
];

/**
 * Every business on this instance (plan U3). Search by name, slug or id —
 * or by a member's email, for an operator who may read personal data — and
 * filter by state, plan, module and whether anything needs attention.
 */
export default async function BusinessesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("organization:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const raw = await searchParams;
    const query: BusinessQuery = {
        q: clean(raw.q),
        lifecycle: clean(raw.lifecycle),
        plan: clean(raw.plan),
        module: clean(raw.module),
        health: raw.health === "attention" ? "attention" : undefined,
        cursor: clean(raw.cursor),
    };

    const [page, plans] = await Promise.all([
        listBusinesses(query).catch(() => undefined),
        can(staff, "subscription:read") ? listPlans().catch(() => null) : null,
    ]);

    const filtered = [
        query.q,
        query.lifecycle,
        query.plan,
        query.module,
        query.health,
    ].some((value) => value !== undefined);
    const canSearchEmail = can(staff, "organization:pii:read");

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Instance", "Businesses"]}
                    title="Businesses"
                    description="Every business on this instance. A row opens everything about that one."
                />

                <FilterBar action="/businesses" active={filtered}>
                    <FilterText
                        label="Search"
                        name="q"
                        defaultValue={query.q}
                        placeholder={
                            canSearchEmail
                                ? "Name, slug, id or a member's email"
                                : "Name, slug or id"
                        }
                    />
                    <FilterSelect
                        label="State"
                        name="lifecycle"
                        defaultValue={query.lifecycle}
                        options={LIFECYCLE_OPTIONS}
                    />
                    {plans && (
                        <FilterSelect
                            label="Plan"
                            name="plan"
                            defaultValue={query.plan}
                            options={[
                                { value: "none", label: "No plan" },
                                ...uniqueByKey(plans).map((plan) => ({
                                    value: plan.key,
                                    label: plan.name,
                                })),
                            ]}
                        />
                    )}
                    <FilterSelect
                        label="Module"
                        name="module"
                        defaultValue={query.module}
                        options={MODULE_OPTIONS.map((option) => ({
                            value: option.key,
                            label: option.label,
                        }))}
                    />
                    <FilterSelect
                        label="Health"
                        name="health"
                        defaultValue={query.health}
                        options={[
                            { value: "attention", label: "Needs attention" },
                        ]}
                    />
                </FilterBar>

                {page === undefined ? (
                    <FailedState
                        title="The directory could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : page === null ? (
                    <FailedState
                        title="That search was refused"
                        description={
                            query.q?.includes("@")
                                ? "Searching by email needs permission to read personal data."
                                : "Your access does not cover this list."
                        }
                    />
                ) : (
                    <>
                        <BusinessTable rows={page.items} />
                        <nav
                            aria-label="Pages"
                            className="flex flex-wrap items-center justify-end gap-2"
                        >
                            {query.cursor && (
                                <Link
                                    href={pageHref(query, undefined)}
                                    className={buttonVariants({
                                        variant: "ghost",
                                        size: "sm",
                                    })}
                                >
                                    First page
                                </Link>
                            )}
                            {page.nextCursor && (
                                <Link
                                    href={pageHref(query, page.nextCursor)}
                                    className={buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                    })}
                                >
                                    Next page
                                </Link>
                            )}
                        </nav>
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

function clean(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed === "" ? undefined : trimmed;
}

function pageHref(query: BusinessQuery, cursor: string | undefined): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, cursor })) {
        if (value) search.set(key, value);
    }
    return search.size > 0 ? `/businesses?${search.toString()}` : "/businesses";
}

/** One option per plan key, however many versions of it exist. */
function uniqueByKey<T extends { key: string }>(plans: T[]): T[] {
    const seen = new Set<string>();
    return plans.filter((plan) => {
        if (seen.has(plan.key)) return false;
        seen.add(plan.key);
        return true;
    });
}
