import { Button, buttonVariants } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminAuditTable } from "@/components/admin-audit-table";
import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { getStaffIdentity, listAudit } from "@/lib/control-plane";
import { requireSession } from "@/lib/session";

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
    const session = await requireSession();

    const staff = await getStaffIdentity();
    if (!staff?.permissions.includes("audit:read")) {
        return <NotAuthorized email={session.user.email} />;
    }

    const rawQuery = (await searchParams) ?? {};
    const query = {
        cursor: clean(rawQuery.cursor),
        actorUserId: clean(rawQuery.actorUserId),
        organizationId: clean(rawQuery.organizationId),
        action: clean(rawQuery.action),
    };
    const page = await listAudit({ ...query, limit: 50 });
    if (!page) return <NotAuthorized email={session.user.email} />;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Instance", "Audit trail"]}
                    title="What operators did"
                    description="Every operator action on this instance, and none can be edited. Sensitive request details are never shown."
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

                <form
                    action="/audit"
                    className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
                >
                    <FilterField
                        label="Actor ID"
                        name="actorUserId"
                        defaultValue={query.actorUserId}
                    />
                    <FilterField
                        label="Organization ID"
                        name="organizationId"
                        defaultValue={query.organizationId}
                    />
                    <FilterField
                        label="Action"
                        name="action"
                        defaultValue={query.action}
                        placeholder="flags.organization.set"
                    />
                    <Button type="submit" className="self-end">
                        Apply filters
                    </Button>
                </form>

                <AdminAuditTable page={page} query={query} />
            </PageContainer>
        </AdminShell>
    );
}

function clean(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed;
}

function FilterField({
    label,
    name,
    defaultValue,
    placeholder,
}: {
    label: string;
    name: string;
    defaultValue?: string;
    placeholder?: string;
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={name} className="text-xs text-muted-foreground">
                {label}
            </Label>
            <Input
                id={name}
                type="search"
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                className="min-w-0"
            />
        </div>
    );
}
