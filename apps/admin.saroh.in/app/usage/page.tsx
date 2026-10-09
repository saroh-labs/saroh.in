import { buttonVariants } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { StorageTable } from "@/components/usage/storage-table";
import { requireStaff } from "@/lib/console";
import { plural } from "@/lib/format";
import { listStorageUsage } from "@/lib/usage";
import type { StorageOrder } from "@/lib/usage-words";
import {
    formatGb,
    pageCount,
    readOrder,
    readPage,
    usageHref,
} from "@/lib/usage-words";

export const metadata = { title: "Usage" };

const ORDERS: { value: StorageOrder; label: string }[] = [
    { value: "most", label: "Most storage" },
    { value: "least", label: "Least storage" },
];

/**
 * What each business uses of the instance (#798): the storage its photos
 * and videos take, counted as the plan's storage limit counts it, sorted
 * across every business and read a page at a time.
 */
export default async function UsagePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("organization:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const raw = await searchParams;
    const order = readOrder(raw.order);
    const page = readPage(raw.page);
    const usage = await listStorageUsage({ order, page }).catch(
        () => undefined,
    );

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Instance", "Usage"]}
                    title="Usage"
                    description="Storage each business's photos and videos take, as its plan counts it. A row opens that business."
                />

                <nav
                    aria-label="Sort"
                    className="flex flex-wrap items-center gap-2"
                >
                    {ORDERS.map((option) => {
                        const on = option.value === order;
                        return (
                            <Link
                                key={option.value}
                                href={usageHref(option.value, 1)}
                                aria-current={on ? "page" : undefined}
                                className={buttonVariants({
                                    variant: on ? "secondary" : "ghost",
                                    size: "sm",
                                })}
                            >
                                {option.label}
                            </Link>
                        );
                    })}
                </nav>

                {usage === undefined ? (
                    <FailedState
                        title="Usage could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : usage === null ? (
                    <FailedState
                        title="Usage is not open to you"
                        description="Your access does not cover this list."
                    />
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            {formatGb(usage.totalGb)} stored across{" "}
                            {plural(usage.total, "business", "businesses")}.
                        </p>
                        <StorageTable rows={usage.items} />
                        <UsagePager
                            order={order}
                            page={usage.page}
                            pages={pageCount(usage.total, usage.limit)}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

/** Previous and Next, with where this page sits among them. */
function UsagePager({
    order,
    page,
    pages,
}: {
    order: StorageOrder;
    page: number;
    pages: number;
}) {
    if (pages <= 1 && page <= 1) return null;
    return (
        <nav
            aria-label="Pages"
            className="flex flex-wrap items-center justify-end gap-2"
        >
            <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
            </span>
            {page > 1 && (
                <Link
                    href={usageHref(order, Math.min(page - 1, pages))}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                    Previous page
                </Link>
            )}
            {page < pages && (
                <Link
                    href={usageHref(order, page + 1)}
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                >
                    Next page
                </Link>
            )}
        </nav>
    );
}
