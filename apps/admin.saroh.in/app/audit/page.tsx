import { getServerSession } from "@saroh/auth/next";
import { Button, buttonVariants } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminAuditTable } from "@/components/admin-audit-table";
import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { accountsLoginUrl } from "@/lib/admin-access";
import { getStaffIdentity, listAudit } from "@/lib/control-plane";

export const metadata = { title: "Platform audit" };

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
    const session = await getServerSession(await headers());
    if (!session) redirect(accountsLoginUrl);

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
            <main className="mx-auto max-w-7xl p-6 sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Governance
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                            Platform audit
                        </h1>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            Immutable staff activity across the control plane.
                            Sensitive request metadata is never displayed.
                        </p>
                    </div>
                    {(query.actorUserId !== undefined ||
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
                    )}
                </div>

                <form
                    action="/audit"
                    className="my-6 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
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
            </main>
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
