import { EmptyPanel } from "@/components/states/empty-panel";
import { plural } from "@/lib/format";
import type { OverviewPanel, OverviewTeam } from "@/lib/overview-words";
import { memberRole } from "@/lib/overview-words";

import { CardLink, OverviewCard } from "./overview-card";

/**
 * Team (U3, R2): who is in the business, by name and role. Never an email:
 * this card is read without a support session.
 */
export function TeamCard({
    organizationId,
    team,
}: {
    organizationId: string;
    team: OverviewPanel<OverviewTeam>;
}) {
    return (
        <OverviewCard id="team" title="Team" data={team}>
            {(t) => (
                <div className="grid gap-3 text-sm">
                    {t.members.length === 0 ? (
                        <EmptyPanel
                            title="No team yet"
                            description="Nobody has joined this business."
                        />
                    ) : (
                        <ul className="grid gap-1.5">
                            {t.members.map((m, i) => (
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
                    {t.invitesOpen > 0 && (
                        <p className="text-muted-foreground">
                            {plural(t.invitesOpen, "invitation")} open
                        </p>
                    )}
                    <CardLink organizationId={organizationId} tab="team">
                        Open Team
                    </CardLink>
                </div>
            )}
        </OverviewCard>
    );
}
