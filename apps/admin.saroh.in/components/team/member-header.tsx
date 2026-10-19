import { Badge } from "@saroh/ui/badge";
import { StatCard } from "@saroh/ui/stat-card";
import Link from "next/link";

import { formatPaise } from "@/lib/billing-words";
import type { EarningsSummary } from "@/lib/commission-words";
import { formatDate, plural } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/roles";
import type { TeamMember } from "@/lib/team-member-words";
import { memberBase } from "@/lib/team-member-words";
import { JOB_LABEL } from "@/lib/team-words";

/**
 * Under a teammate's name (R33): what they work as and their console
 * roles, where they are, since when and whom they report to, then the
 * counts, each linking to its tab. Earnings due only with `team:pay`.
 */
export function MemberFacts({ member }: { member: TeamMember }) {
    const job = member.profile.worksAs;
    const line = [
        member.profile.city,
        member.profile.joinedOn
            ? `joined ${formatDate(`${member.profile.joinedOn}T00:00:00`)}`
            : `on the team since ${formatDate(member.grantedAt)}`,
        member.reportsTo ? `reports to ${member.reportsTo.name}` : null,
    ].filter((part): part is string => Boolean(part));

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">
                {job ? JOB_LABEL[job] : "No job yet"}
            </Badge>
            {member.roles.length > 0 ? (
                member.roles.map((role) => (
                    <Badge key={role.role} variant="secondary">
                        {role.expiresAt
                            ? `${ROLE_LABEL[role.role]} · until ${formatDate(role.expiresAt)}`
                            : ROLE_LABEL[role.role]}
                    </Badge>
                ))
            ) : (
                <Badge variant="warning">No active role</Badge>
            )}
            {member.revokedAt ? (
                <Badge variant="warning">
                    Access ended {formatDate(member.revokedAt)}
                </Badge>
            ) : null}
            <span>{line.join(" · ")}</span>
        </div>
    );
}

export function MemberCounts({
    member,
    earnings,
}: {
    member: TeamMember;
    /** Undefined: not for this reader. Null: couldn't be read. */
    earnings?: EarningsSummary | null;
}) {
    const base = memberBase(member.platformAdminId);
    const { counts } = member;
    return (
        <div
            role="group"
            aria-label="Teammate in numbers"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
            <StatCard
                label="Businesses"
                value={counts.businesses}
                hint={
                    <Link href={`${base}/businesses`} className="underline">
                        {`${counts.broughtIn} brought in`}
                    </Link>
                }
            />
            <StatCard
                label="Open leads"
                value={counts.openLeads}
                hint={
                    counts.overdueFollowUps > 0
                        ? `${plural(counts.overdueFollowUps, "follow-up")} overdue`
                        : "No follow-up overdue"
                }
            />
            <StatCard
                label="Won this month"
                value={counts.wonThisMonth}
                hint="Leads that became businesses"
            />
            {earnings !== undefined ? (
                <StatCard
                    label="Earnings due"
                    value={
                        earnings ? formatPaise(earnings.totals.duePaise) : "—"
                    }
                    hint={
                        earnings ? (
                            <Link
                                href={`${base}/earnings`}
                                className="underline"
                            >
                                {`${formatPaise(earnings.totals.pendingPaise)} not payable yet`}
                            </Link>
                        ) : (
                            "Couldn't read their earnings."
                        )
                    }
                />
            ) : null}
        </div>
    );
}
