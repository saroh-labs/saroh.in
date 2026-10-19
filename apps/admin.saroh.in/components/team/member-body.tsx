import { buttonVariants } from "@saroh/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

import { NoAccessPanel } from "@/components/not-authorized";
import type { EarningsSummary } from "@/lib/commission-words";
import type { MemberAccess, TeamMember } from "@/lib/team-member-words";

import { MemberCounts, MemberFacts } from "./member-header";
import { MemberLink } from "./member-link";
import { MemberTabs } from "./member-tabs";

/**
 * A teammate's page under its header (R33): who they are, the counts,
 * their manager link and code, then the tabs over the open tab. When the
 * API refused the read (an Account manager opening someone else's page)
 * it is the no-access panel and nothing else.
 */
export function MemberBody({
    member,
    email,
    access,
    earnings,
    siteUrl,
    backToTeam,
    children,
}: {
    /** Null: the API refused this reader. */
    member: TeamMember | null;
    /** The reader's email, for the no-access panel. */
    email: string;
    access: MemberAccess;
    /** Undefined without `team:pay`; null when it couldn't be read. */
    earnings?: EarningsSummary | null;
    siteUrl: string;
    /** Whether the reader may open the Team list (`team:read`). */
    backToTeam: boolean;
    children: ReactNode;
}) {
    if (!member) return <NoAccessPanel email={email} />;
    return (
        <div className="grid min-w-0 gap-4">
            {backToTeam ? (
                <div>
                    <Link
                        href="/team"
                        className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                        })}
                    >
                        ‹ Team
                    </Link>
                </div>
            ) : null}
            <MemberFacts member={member} />
            <MemberCounts
                member={member}
                earnings={access.pay ? (earnings ?? null) : undefined}
            />
            <MemberLink
                code={member.profile.managerCode}
                siteUrl={siteUrl}
                isManager={member.roles.some(
                    (role) => role.role === "ACCOUNT_MANAGER",
                )}
                self={member.self}
            />
            <MemberTabs
                platformAdminId={member.platformAdminId}
                seesLeads={member.leads !== null}
                pay={access.pay}
                counts={{
                    businesses: member.counts.businesses,
                    openLeads: member.counts.openLeads,
                }}
            />
            {children}
        </div>
    );
}
