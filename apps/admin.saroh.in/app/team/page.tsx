import { Badge } from "@saroh/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import {
    AmendStaff,
    GrantStaff,
    RevokeStaff,
} from "@/components/team/team-actions";
import { can, requireStaff } from "@/lib/console";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLE_PURPOSE } from "@/lib/roles";
import type { StaffMember } from "@/lib/staff";
import { listRoles, listStaff } from "@/lib/staff";

export const metadata = { title: "Team" };

/**
 * Who on the operator's own team may do what (plan U2). Granting, changing
 * and revoking access happen here, never in SQL.
 */
export default async function TeamPage() {
    const gate = await requireStaff("staff:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const canGrant = can(staff, "staff:grant");

    const [members, roles] = await Promise.all([
        listStaff().catch(() => undefined),
        listRoles().catch(() => null),
    ]);
    const active = members?.filter((member) => !member.revokedAt) ?? [];
    const former = members?.filter((member) => member.revokedAt) ?? [];

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Team"]}
                    title="Team"
                    description="Who can use this console, and what each of them may do."
                    actions={canGrant ? <GrantStaff /> : undefined}
                />

                {staff.viaBootstrap && (
                    <p className="max-w-[68ch] text-sm text-muted-foreground">
                        You are signed in through the break-glass allowlist.
                        Grant yourself the Platform owner role here so your own
                        access is recorded and can be taken away like anyone
                        else&rsquo;s.
                    </p>
                )}

                {members === undefined ? (
                    <FailedState title="The team could not be loaded" />
                ) : active.length === 0 ? (
                    <EmptyState
                        title="Nobody has been granted access yet"
                        description="Until someone is, the console is reachable only through the break-glass allowlist."
                    />
                ) : (
                    <div className="grid gap-3">
                        {active.map((member) => (
                            <Member
                                key={member.platformAdminId}
                                member={member}
                                canGrant={canGrant}
                            />
                        ))}
                    </div>
                )}

                {former.length > 0 && (
                    <section className="grid gap-2">
                        <h2 className="text-[15px] font-semibold">
                            No longer on the team
                        </h2>
                        <ul className="grid gap-1 text-sm text-muted-foreground">
                            {former.map((member) => (
                                <li key={member.platformAdminId}>
                                    {member.name ?? member.email} · revoked{" "}
                                    {formatDate(member.revokedAt)}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {roles && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-[15px]">
                                What each role may do
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            {roles.map((definition) => (
                                <div
                                    key={definition.role}
                                    className="grid gap-1.5"
                                >
                                    <p className="text-sm">
                                        <span className="font-medium">
                                            {ROLE_LABEL[definition.role]}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {" "}
                                            — {ROLE_PURPOSE[definition.role]}
                                        </span>
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {definition.permissions.map(
                                            (permission) => (
                                                <Badge
                                                    key={permission}
                                                    variant="tag"
                                                    className="font-mono text-[11px]"
                                                >
                                                    {permission}
                                                </Badge>
                                            ),
                                        )}
                                    </div>
                                </div>
                            ))}
                            <p className="text-[13px] text-muted-foreground">
                                Roles and permissions are part of Saroh&rsquo;s
                                code, the same on every instance. Who holds them
                                is up to this instance.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </PageContainer>
        </AdminShell>
    );
}

function Member({
    member,
    canGrant,
}: {
    member: StaffMember;
    canGrant: boolean;
}) {
    return (
        <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
                <div className="grid min-w-0 gap-1.5">
                    <p className="truncate font-medium">
                        {member.name ?? member.email}
                    </p>
                    {member.name && (
                        <p className="truncate text-sm text-muted-foreground">
                            {member.email}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                        {member.roles.map((role) => (
                            <Badge key={role.assignmentId} variant="info">
                                {ROLE_LABEL[role.role]}
                                {role.expiresAt &&
                                    ` · until ${formatDate(role.expiresAt)}`}
                            </Badge>
                        ))}
                        {member.roles.length === 0 && (
                            <Badge variant="warning">No active role</Badge>
                        )}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                        Since {formatDate(member.grantedAt)}
                        {member.note && ` · ${member.note}`}
                    </p>
                </div>
                {canGrant && (
                    <div className="flex flex-wrap gap-1">
                        <AmendStaff member={member} />
                        <RevokeStaff member={member} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
