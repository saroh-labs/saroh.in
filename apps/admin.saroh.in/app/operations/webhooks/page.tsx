import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { BulkAction } from "@/components/operations/bulk-action";
import { Pager } from "@/components/operations/pager";
import { WebhookTable } from "@/components/operations/webhook-table";
import { can, requireStaff } from "@/lib/console";
import { getWebhookSummary, listWebhooks } from "@/lib/machinery";
import { param } from "@/lib/params";

export const metadata = { title: "Webhooks" };

/**
 * Payment providers' deliveries to this instance (plan U8): what arrived,
 * what it did, what failed and why — and a replay for what failed. Only a
 * failed delivery can be replayed, so none is ever applied twice.
 */
export default async function WebhooksPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("webhooks:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const params = {
        status: param(raw.status),
        provider: param(raw.provider),
        organizationId: param(raw.organizationId),
        cursor: param(raw.cursor),
    };
    const [summary, deliveries] = await Promise.all([
        getWebhookSummary().catch(() => null),
        listWebhooks(params).catch(() => undefined),
    ]);
    const canReplay = can(staff, "webhooks:replay");
    const failedHere =
        deliveries?.items
            .filter((row) => row.status === "FAILED")
            .map((row) => row.id) ?? [];
    const day = summary?.lastDay ?? {};

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Operations", "Webhooks"]}
                    title="Webhooks"
                    description="What payment providers told this instance, and what it did about it."
                    actions={
                        canReplay && failedHere.length > 0 ? (
                            <BulkAction
                                kind="webhooks.replay"
                                ids={failedHere}
                                trigger={`Replay ${failedHere.length} failed on this page`}
                                noun={{ one: "delivery", other: "deliveries" }}
                            />
                        ) : undefined
                    }
                />

                {summary && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="Applied, last day"
                            value={day.PROCESSED ?? 0}
                        />
                        <StatCard
                            label="Nothing to do, last day"
                            value={day.IGNORED ?? 0}
                        />
                        <StatCard
                            label="Failed, last day"
                            value={day.FAILED ?? 0}
                        />
                        <StatCard
                            label="Failed, all time"
                            value={summary.total.FAILED ?? 0}
                        />
                    </div>
                )}

                <FilterBar
                    action="/operations/webhooks"
                    active={Boolean(
                        params.status ??
                        params.provider ??
                        params.organizationId,
                    )}
                >
                    <FilterSelect
                        label="State"
                        name="status"
                        defaultValue={params.status}
                        options={[
                            { value: "FAILED", label: "Failed" },
                            { value: "PROCESSED", label: "Applied" },
                            { value: "IGNORED", label: "Nothing to do" },
                            { value: "RECEIVED", label: "Received" },
                        ]}
                    />
                    <FilterText
                        label="Provider"
                        name="provider"
                        defaultValue={params.provider}
                        placeholder="razorpay"
                    />
                    <FilterText
                        label="Business id"
                        name="organizationId"
                        defaultValue={params.organizationId}
                    />
                </FilterBar>

                {deliveries === undefined ? (
                    <FailedState title="Deliveries could not be read" />
                ) : deliveries === null ? (
                    <FailedState title="Your access does not cover deliveries" />
                ) : (
                    <>
                        <WebhookTable
                            rows={deliveries.items}
                            canReplay={canReplay}
                        />
                        <Pager
                            base="/operations/webhooks"
                            params={params}
                            nextCursor={deliveries.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
