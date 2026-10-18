import { SessionTab } from "@/components/business/session-tab";
import { Panel } from "@/components/panel";
import {
    ChangeRole,
    InvitationActions,
    RemoveMember,
} from "@/components/people/person-actions";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";
import { can } from "@/lib/console";
import { asWords, formatDate, plural } from "@/lib/format";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Team", organizationId) };
}

/**
 * Team (admin plan U2): who belongs to this business and their role in it,
 * its waiting invitations, and Change role… and Remove… for an operator
 * who may change its people and read their details. U6 rebuilds it.
 */
export default async function TeamTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const peopleWrite =
        can(staff, "organization:people:write") &&
        can(staff, "organization:pii:read");
    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const { facts } = view;
                const id = facts.id;
                return (
                    <Panel
                        title="People"
                        description="Who belongs to this business, and their role in it."
                        data={view.people}
                    >
                        {(people) => (
                            <div className="grid gap-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                                <th className="py-2 pr-3 font-semibold">
                                                    Person
                                                </th>
                                                <th className="py-2 pr-3 font-semibold">
                                                    Role
                                                </th>
                                                <th className="py-2 pr-3 font-semibold">
                                                    Email
                                                </th>
                                                {peopleWrite && (
                                                    <th className="py-2 font-semibold">
                                                        <span className="sr-only">
                                                            Actions
                                                        </span>
                                                    </th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {people.members.map((member) => {
                                                const label =
                                                    member.name ??
                                                    member.email ??
                                                    "this person";
                                                return (
                                                    <tr
                                                        key={
                                                            member.membershipId
                                                        }
                                                        className="border-b last:border-0"
                                                    >
                                                        <td className="py-2 pr-3">
                                                            {member.name ?? (
                                                                <span className="text-muted-foreground">
                                                                    No name
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-3">
                                                            {asWords(
                                                                member.role,
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-3">
                                                            {member.email ? (
                                                                <span className="break-all">
                                                                    {
                                                                        member.email
                                                                    }
                                                                    {!member.emailVerified && (
                                                                        <span className="text-muted-foreground">
                                                                            {" "}
                                                                            ·
                                                                            not
                                                                            verified
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    Hidden
                                                                </span>
                                                            )}
                                                        </td>
                                                        {peopleWrite && (
                                                            <td className="py-1">
                                                                <div className="flex justify-end gap-1">
                                                                    <ChangeRole
                                                                        organizationId={
                                                                            id
                                                                        }
                                                                        userId={
                                                                            member.userId
                                                                        }
                                                                        name={
                                                                            label
                                                                        }
                                                                        role={
                                                                            member.role
                                                                        }
                                                                    />
                                                                    <RemoveMember
                                                                        organizationId={
                                                                            id
                                                                        }
                                                                        userId={
                                                                            member.userId
                                                                        }
                                                                        name={
                                                                            label
                                                                        }
                                                                        business={
                                                                            facts.name
                                                                        }
                                                                    />
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {people.invitations.length > 0 && (
                                    <div className="grid gap-2">
                                        <p className="text-sm font-medium">
                                            {plural(
                                                people.invitations.length,
                                                "invitation",
                                            )}{" "}
                                            waiting
                                        </p>
                                        <ul className="grid gap-1.5">
                                            {people.invitations.map(
                                                (invite) => (
                                                    <li
                                                        key={invite.id}
                                                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                                    >
                                                        <span className="min-w-0 break-all">
                                                            {invite.email ??
                                                                "Hidden"}{" "}
                                                            as{" "}
                                                            {asWords(
                                                                invite.role,
                                                            )}{" "}
                                                            · expires{" "}
                                                            {formatDate(
                                                                invite.expiresAt,
                                                            )}
                                                        </span>
                                                        {peopleWrite && (
                                                            <InvitationActions
                                                                organizationId={
                                                                    id
                                                                }
                                                                invitationId={
                                                                    invite.id
                                                                }
                                                                label={
                                                                    invite.email ??
                                                                    "this person"
                                                                }
                                                            />
                                                        )}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </Panel>
                );
            }}
        </SessionTab>
    );
}
