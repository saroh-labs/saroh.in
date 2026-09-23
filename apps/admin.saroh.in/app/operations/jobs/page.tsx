import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { BulkAction } from "@/components/operations/bulk-action";
import { JobTable } from "@/components/operations/job-table";
import { Pager } from "@/components/operations/pager";
import { can, requireStaff } from "@/lib/console";
import { getQueue, listJobs } from "@/lib/machinery";
import { param } from "@/lib/params";

export const metadata = { title: "Jobs" };

/**
 * The job queue (plan U7): what is waiting, how late, what has failed and
 * why — and a retry for what failed, always dry-run first.
 */
export default async function JobsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("jobs:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const params = {
        status: param(raw.status),
        type: param(raw.type),
        organizationId: param(raw.organizationId),
        cursor: param(raw.cursor),
    };
    const [queue, jobs] = await Promise.all([
        getQueue().catch(() => null),
        listJobs(params).catch(() => undefined),
    ]);
    const canRetry = can(staff, "jobs:retry");
    const failedHere =
        jobs?.items
            .filter((job) => job.status === "FAILED")
            .map((job) => job.id) ?? [];

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Operations", "Jobs"]}
                    title="Jobs"
                    description="The work the instance does in the background: notifications, renewals, messages and more."
                    actions={
                        canRetry && failedHere.length > 0 ? (
                            <BulkAction
                                kind="jobs.retry"
                                ids={failedHere}
                                trigger={`Retry ${failedHere.length} failed on this page`}
                                noun={{ one: "job", other: "jobs" }}
                            />
                        ) : undefined
                    }
                />

                {queue && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="Waiting"
                            value={queue.pending}
                            hint={
                                queue.oldestDueSeconds > 0
                                    ? `oldest due ${Math.round(queue.oldestDueSeconds / 60)} min ago`
                                    : "nothing overdue"
                            }
                        />
                        <StatCard label="Running" value={queue.processing} />
                        <StatCard
                            label="Failed"
                            value={queue.failed}
                            hint={`${queue.failedLastDay} in the last day`}
                        />
                        <StatCard
                            label="Done, last day"
                            value={queue.doneLastDay}
                        />
                    </div>
                )}

                <FilterBar
                    action="/operations/jobs"
                    active={Boolean(
                        params.status ?? params.type ?? params.organizationId,
                    )}
                >
                    <FilterSelect
                        label="State"
                        name="status"
                        defaultValue={params.status}
                        options={[
                            { value: "FAILED", label: "Failed" },
                            { value: "PENDING", label: "Waiting" },
                            { value: "PROCESSING", label: "Running" },
                            { value: "DONE", label: "Done" },
                        ]}
                    />
                    <FilterSelect
                        label="Type"
                        name="type"
                        defaultValue={params.type}
                        options={(queue?.failedByType ?? [])
                            .map((row) => ({
                                value: row.type,
                                label: `${row.type} (${row.count} failed)`,
                            }))
                            .concat(
                                params.type &&
                                    !queue?.failedByType.some(
                                        (row) => row.type === params.type,
                                    )
                                    ? [
                                          {
                                              value: params.type,
                                              label: params.type,
                                          },
                                      ]
                                    : [],
                            )}
                    />
                    <FilterText
                        label="Business id"
                        name="organizationId"
                        defaultValue={params.organizationId}
                    />
                </FilterBar>

                {jobs === undefined ? (
                    <FailedState title="The queue could not be read" />
                ) : jobs === null ? (
                    <FailedState title="Your access does not cover the queue" />
                ) : (
                    <>
                        <JobTable rows={jobs.items} canRetry={canRetry} />
                        <Pager
                            base="/operations/jobs"
                            params={params}
                            nextCursor={jobs.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
