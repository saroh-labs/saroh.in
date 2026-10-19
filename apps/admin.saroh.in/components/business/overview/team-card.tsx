"use client";

import { FailedState } from "@saroh/ui/data-state";

import { EmptyPanel } from "@/components/states/empty-panel";
import { plural } from "@/lib/format";
import type {
    OverviewAccountManager,
    OverviewPanel,
    OverviewTeam,
} from "@/lib/overview-words";
import { managerLine, memberRole } from "@/lib/overview-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { ManagerActions } from "./manager-actions";
import { CardLink, OverviewCard } from "./overview-card";

/**
 * Team (U3, R2): who at Saroh looks after the business (U25, DEC-169), then
 * who is in it, by name and role. Never an email: this card is read without
 * a support session. Staff with `accounts:assign` give the business a
 * manager, move it or end the link from here; the card lights after.
 */
export function TeamCard({
    organizationId,
    team,
    accountManager,
    canAssign,
}: {
    organizationId: string;
    team: OverviewPanel<OverviewTeam>;
    accountManager: OverviewPanel<OverviewAccountManager>;
    /** Holds `accounts:assign`. */
    canAssign: boolean;
}) {
    const feedback = useChangeFeedback();
    // The card stands while either half read; each half says if it didn't.
    const data: OverviewPanel<{
        team: OverviewPanel<OverviewTeam>;
        accountManager: OverviewPanel<OverviewAccountManager>;
    }> =
        team.status === "failed" && accountManager.status === "failed"
            ? { status: "failed" }
            : { status: "ok", data: { team, accountManager } };

    return (
        <OverviewCard
            id="team"
            title="Team"
            data={data}
            highlighted={feedback.isHighlighted("team")}
        >
            {(d) => (
                <div className="grid gap-4 text-sm">
                    <AccountManagerBlock
                        organizationId={organizationId}
                        accountManager={d.accountManager}
                        canAssign={canAssign}
                        onDone={(message) =>
                            feedback.report({ message, rowId: "team" })
                        }
                    />
                    <div className="grid gap-3">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            People in the business
                        </p>
                        {d.team.status === "failed" ? (
                            <FailedState
                                size="inline"
                                title="Couldn't load team members"
                                description="Nothing has been changed. Reload to try again."
                            />
                        ) : (
                            <TeamList team={d.team.data} />
                        )}
                    </div>
                    <CardLink organizationId={organizationId} tab="team">
                        Open Team
                    </CardLink>
                </div>
            )}
        </OverviewCard>
    );
}

/**
 * The business's account manager: their name, how they came to look after
 * it and since when; or "No account manager". One line, then the actions.
 */
function AccountManagerBlock({
    organizationId,
    accountManager,
    canAssign,
    onDone,
}: {
    organizationId: string;
    accountManager: OverviewPanel<OverviewAccountManager>;
    canAssign: boolean;
    onDone: (message: string) => void;
}) {
    return (
        <div className="grid gap-2" data-account-manager>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Account manager
            </p>
            {accountManager.status === "failed" ? (
                <FailedState
                    size="inline"
                    title="Couldn't load the account manager"
                    description="Nothing has been changed. Reload to try again."
                />
            ) : (
                <>
                    {accountManager.data.manager ? (
                        <div className="grid gap-0.5">
                            <span className="font-medium">
                                {accountManager.data.manager.name}
                            </span>
                            <span className="text-muted-foreground">
                                {managerLine(accountManager.data.manager)}
                            </span>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            No account manager
                        </p>
                    )}
                    {canAssign && (
                        <ManagerActions
                            organizationId={organizationId}
                            manager={accountManager.data.manager}
                            onDone={onDone}
                        />
                    )}
                </>
            )}
        </div>
    );
}

function TeamList({ team }: { team: OverviewTeam }) {
    return (
        <>
            {team.members.length === 0 ? (
                <EmptyPanel
                    title="No team yet"
                    description="Nobody has joined this business."
                />
            ) : (
                <ul className="grid gap-1.5">
                    {team.members.map((m, i) => (
                        <li
                            key={`${m.name ?? ""}-${i}`}
                            className="flex flex-wrap justify-between gap-x-3"
                        >
                            <span className="min-w-0">
                                {m.name ?? "No name given"}
                            </span>
                            <span className="text-muted-foreground">
                                {memberRole(m.role)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {team.invitesOpen > 0 && (
                <p className="text-muted-foreground">
                    {plural(team.invitesOpen, "invitation")} open
                </p>
            )}
        </>
    );
}
