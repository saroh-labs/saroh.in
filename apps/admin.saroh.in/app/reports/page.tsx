import { Badge } from "@saroh/ui/badge";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { MarkDone } from "@/components/business-reports/mark-done";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { Pager } from "@/components/operations/pager";
import { listBusinessReports, reportStatus } from "@/lib/business-reports";
import { can, requireStaff } from "@/lib/console";
import { formatDateTime, formatRelative, plural } from "@/lib/format";
import { param } from "@/lib/params";

export const metadata = { title: "Reports" };

/**
 * What customers reported about businesses at saroh.in/customers (Terms rev
 * 46): newest first, open unless asked otherwise, each with the business the
 * address is a Saroh site of. The reporter's email shows only to staff who
 * may read personal data. Marking a report done needs `reports:resolve`,
 * which Support holds.
 */
export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("organization:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const status = reportStatus(param(raw.status));
    const cursor = param(raw.cursor);
    const page = await listBusinessReports({ status, cursor }).catch(
        () => undefined,
    );
    const canClose = can(staff, "reports:resolve");
    const seesEmail = can(staff, "organization:pii:read");

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Reports"]}
                    title="Reports"
                    description={
                        page
                            ? `What customers reported about a business at saroh.in/customers. ${plural(page.open, "report")} open.`
                            : "What customers reported about a business at saroh.in/customers."
                    }
                />

                <FilterBar action="/reports" active={status !== "open"}>
                    <FilterSelect
                        label="Showing"
                        name="status"
                        anyLabel="Open"
                        defaultValue={status === "open" ? undefined : status}
                        options={[
                            { value: "done", label: "Done" },
                            { value: "all", label: "All" },
                        ]}
                    />
                </FilterBar>

                {page === undefined ? (
                    <FailedState title="Reports could not be read" />
                ) : page === null ? (
                    <FailedState title="Your access does not cover reports" />
                ) : page.items.length === 0 ? (
                    <EmptyState
                        title={
                            status === "done"
                                ? "No report is done yet"
                                : status === "all"
                                  ? "No reports yet"
                                  : "No open reports"
                        }
                        description="Reports customers send from saroh.in/customers appear here."
                    />
                ) : (
                    <>
                        <ul className="grid gap-3">
                            {page.items.map((row) => (
                                <li
                                    key={row.id}
                                    className="grid gap-2 rounded-xl border bg-card p-4"
                                >
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="break-all font-medium">
                                            {row.siteHost}
                                        </span>
                                        {row.business ? (
                                            <Link
                                                href={`/businesses/${encodeURIComponent(row.business.id)}`}
                                                className="text-sm underline underline-offset-4"
                                            >
                                                {row.business.name}
                                            </Link>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">
                                                Not a Saroh site
                                            </span>
                                        )}
                                        <Badge
                                            variant={
                                                row.status === "DONE"
                                                    ? "success"
                                                    : "warning"
                                            }
                                        >
                                            {row.status === "DONE"
                                                ? "Done"
                                                : "Open"}
                                        </Badge>
                                        <span
                                            className="ml-auto text-sm text-muted-foreground"
                                            title={formatDateTime(
                                                row.createdAt,
                                            )}
                                        >
                                            {formatRelative(row.createdAt)}
                                        </span>
                                    </div>
                                    <p className="max-w-[72ch] whitespace-pre-line break-words text-sm">
                                        {row.message}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                        <span className="break-all">
                                            {!row.hasEmail
                                                ? "No email left"
                                                : seesEmail && row.reporterEmail
                                                  ? row.reporterEmail
                                                  : "Left an email (needs personal data access)"}
                                        </span>
                                        {row.doneAt && (
                                            <span>
                                                Done{" "}
                                                {formatRelative(row.doneAt)}
                                            </span>
                                        )}
                                        {canClose && row.status === "OPEN" && (
                                            <span className="ml-auto">
                                                <MarkDone
                                                    id={row.id}
                                                    host={row.siteHost}
                                                />
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <Pager
                            base="/reports"
                            params={{
                                status: status === "open" ? undefined : status,
                                cursor,
                            }}
                            nextCursor={page.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
