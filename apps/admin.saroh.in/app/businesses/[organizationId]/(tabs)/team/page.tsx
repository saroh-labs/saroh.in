import { PermissionDeniedState } from "@saroh/ui/data-state";
import { notFound } from "next/navigation";

import { OpenAccessCard } from "@/components/business/open-access";
import { TeamRows } from "@/components/business/team-rows";
import { Panel } from "@/components/panel";
import { FailedPanel } from "@/components/states/failed-panel";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readOverview,
    readSummary,
    readView,
    tabTitle,
} from "@/lib/business-page";
import { can } from "@/lib/console";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Team", organizationId) };
}

const DESCRIPTION = "Who belongs to this business, and what each role can do.";

/**
 * Team (admin plan U6, R8): each person, their role and what it can do.
 *
 * Names and roles come from the Overview's read, so they show without a
 * support session (R10). Inside one, the rows come from the business's
 * own read: emails where the operator may read personal data, waiting
 * invitations, and Change role… and Remove… for an operator who may
 * change its people and read their details.
 */
export default async function TeamTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const canViewAs = can(staff, "organization:view-as");
    const canChange =
        can(staff, "organization:people:write") &&
        can(staff, "organization:pii:read");

    const [summary, result] = await Promise.all([
        readSummary(organizationId),
        canViewAs ? readView(organizationId) : null,
    ]);
    if (result?.status === "not-found") notFound();
    const businessName = summary?.name ?? "this business";

    if (result?.status === "ok") {
        const { view } = result;
        return (
            <Panel title="Team" description={DESCRIPTION} data={view.people}>
                {(people) => (
                    <TeamRows
                        organizationId={view.facts.id}
                        businessName={view.facts.name}
                        members={people.members.map((m) => ({
                            key: m.membershipId,
                            userId: m.userId,
                            name: m.name,
                            email: m.email,
                            emailVerified: m.emailVerified,
                            role: m.role,
                        }))}
                        invitations={people.invitations}
                        canChange={canChange}
                    />
                )}
            </Panel>
        );
    }

    // No support session: names and roles from the Overview's read.
    let overview;
    try {
        overview = await readOverview(organizationId);
    } catch {
        overview = undefined;
    }
    return (
        <div className="grid gap-5">
            {overview === undefined ? (
                <FailedPanel
                    things="the team"
                    reassurance="The rest of the page is current."
                />
            ) : overview === null ? (
                <PermissionDeniedState
                    title="This business isn't one of yours"
                    description="Your access covers the businesses you look after."
                />
            ) : (
                <Panel
                    title="Team"
                    description={DESCRIPTION}
                    data={overview.team}
                >
                    {(team) => (
                        <TeamRows
                            organizationId={organizationId}
                            businessName={businessName}
                            members={team.members.map((m, i) => ({
                                key: `member-${i}`,
                                name: m.name,
                                role: m.role,
                            }))}
                            canChange={false}
                        />
                    )}
                </Panel>
            )}
            {result?.status === "needs-access" && (
                <OpenAccessCard
                    organizationId={organizationId}
                    lead="Their emails, waiting invitations and the controls to change their roles need support access."
                />
            )}
        </div>
    );
}
