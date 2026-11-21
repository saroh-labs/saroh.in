import { buttonVariants } from "@saroh/ui/button";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminAuditTable } from "@/components/admin-audit-table";
import { FilterBar, FilterText } from "@/components/filter-bar";
import { NotAuthorized } from "@/components/not-authorized";
import { requireStaff } from "@/lib/console";
import { listAudit } from "@/lib/control-plane";

export const metadata = { title: "Audit trail" };

interface AuditSearchParams {
    cursor?: string;
    actorUserId?: string;
    organizationId?: string;
    action?: string;
}

export default async function AuditPage({
    searchParams,
}: {
    searchParams?: Promise<AuditSearchParams>;
}) {
    const gate = await requireStaff("audit:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const rawQuery = (await searchParams) ?? {};
    const query = {
        cursor: clean(rawQuery.cursor),
        actorUserId: clean(rawQuery.actorUserId),
        organizationId: clean(rawQuery.organizationId),
        action: clean(rawQuery.action),
    };
    const page = await listAudit({ ...query, limit: 50 });
    if (!page) return <NotAuthorized email={staff.email} staff={staff} />;

    return (
        <>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Keep it running", "Audit trail"]}
                    title="What operators did"
                    description="Every action Saroh's team took in this console, and none can be edited. Sensitive request details are never shown."
                    actions={
                        (query.actorUserId !== undefined ||
                            query.organizationId !== undefined ||
                            query.action !== undefined) && (
                            <Link
                                href="/audit"
                                className={buttonVariants({
                                    variant: "ghost",
                                    size: "sm",
                                })}
                            >
                                Clear filters
                            </Link>
                        )
                    }
                />

                {/* The house filter bar: the old rows stay, greyed, while the
                    filtered ones load, instead of a whole-page reload. The
                    header keeps Clear filters, so the bar doesn't repeat it. */}
                <FilterBar action="/audit" active={false}>
                    <FilterText
                        label="Actor ID"
                        name="actorUserId"
                        defaultValue={query.actorUserId}
                    />
                    <FilterText
                        label="Business ID"
                        name="organizationId"
                        defaultValue={query.organizationId}
                    />
                    <FilterText
                        label="Action"
                        name="action"
                        defaultValue={query.action}
                        placeholder="flags.organization.set"
                    />
                </FilterBar>

                <AdminAuditTable page={page} query={query} />
            </PageContainer>
        </>
    );
}

function clean(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed;
}
