"use client";

import { ChangedRow } from "@/components/changed-row";
import {
    ChangeRole,
    ConfirmOwnerChange,
    InvitationActions,
    RemoveMember,
} from "@/components/people/person-actions";
import { EmptyPanel } from "@/components/states/empty-panel";
import { ROLE_CHOICES, roleCan } from "@/lib/business-words";
import type { OwnerChangeRow } from "@/lib/businesses";
import { formatDate, plural } from "@/lib/format";
import { memberRole } from "@/lib/overview-words";
import { changeMemberRoleAction } from "@/lib/people-actions";
import { undoReason } from "@/lib/releases";
import { useChangeFeedback } from "@/lib/use-change-feedback";

/** One person in the business, as the Team tab draws them. */
export interface TeamMemberRow {
    /** Stable for the row: the membership id, or a position. */
    key: string;
    /** Present inside a support session: what the actions act on. */
    userId?: string;
    name: string | null;
    /** Only where the API let the operator read it (personal data). */
    email?: string | null;
    emailVerified?: boolean;
    role: string;
}

export interface TeamInvitationRow {
    id: string;
    email: string | null;
    role: string;
    expiresAt: string;
}

/**
 * The Team tab's rows (admin plan U6, R8): each person by name, their role
 * and what that role can do there, and Change role… and Remove… for an
 * operator who may change the business's people. Rows stack on a phone.
 *
 * An email shows only where the API returned one, which it does only for
 * staff holding `organization:pii:read` inside a support session. A role
 * change lights its row and offers Undo (R9); a removal can't be undone,
 * so it says so in its dialog and only confirms.
 */
export function TeamRows({
    organizationId,
    businessName,
    members,
    invitations = [],
    ownerChanges = [],
    staffUserId,
    canChange,
}: {
    organizationId: string;
    businessName: string;
    members: TeamMemberRow[];
    invitations?: TeamInvitationRow[];
    /** Owner changes waiting for a second staff member (review F3). */
    ownerChanges?: OwnerChangeRow[];
    /** Who is looking: the one who asked for a change can't confirm it. */
    staffUserId?: string;
    /** Holds `organization:people:write` and `organization:pii:read`. */
    canChange: boolean;
}) {
    const feedback = useChangeFeedback();
    const asked = () =>
        feedback.report({
            message: "Asked. A second staff member has to confirm it.",
            description: "Nothing changes until they do.",
        });
    const nameOf = (userId: string) => {
        const member = members.find((m) => m.userId === userId);
        return member?.name ?? member?.email ?? "this person";
    };

    if (members.length === 0 && invitations.length === 0) {
        return (
            <EmptyPanel
                size="inline"
                title="No team yet"
                description="Nobody has joined this business."
            />
        );
    }

    return (
        <div className="grid gap-4">
            <ul className="grid" aria-label="People in the business">
                {members.map((member) => {
                    const label = member.name ?? member.email ?? "this person";
                    const userId = member.userId;
                    return (
                        <ChangedRow
                            as="li"
                            key={member.key}
                            changed={feedback.isHighlighted(member.key)}
                            data-member={member.key}
                            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b py-3 last:border-0"
                        >
                            <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
                                <span className="break-words text-sm font-medium">
                                    {member.name ?? (
                                        <span className="text-muted-foreground">
                                            No name given
                                        </span>
                                    )}
                                </span>
                                {member.email && (
                                    <span className="break-all text-[13px] text-muted-foreground">
                                        {member.email}
                                        {member.emailVerified === false &&
                                            " · not verified"}
                                    </span>
                                )}
                                <span className="text-[13px] text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                        {memberRole(member.role)}
                                    </span>
                                    {" · "}
                                    <span>{roleCan(member.role)}</span>
                                </span>
                            </div>
                            {canChange && userId && (
                                <div className="flex flex-wrap gap-1">
                                    <ChangeRole
                                        organizationId={organizationId}
                                        userId={userId}
                                        name={label}
                                        role={member.role}
                                        trigger="Change role…"
                                        roles={ROLE_CHOICES}
                                        onPending={asked}
                                        onChanged={({ from, to, reason }) => {
                                            if (from === to) return;
                                            feedback.report({
                                                rowId: member.key,
                                                message: `${label} is now ${memberRole(to)}.`,
                                                undo: async () => {
                                                    const undone =
                                                        await changeMemberRoleAction(
                                                            organizationId,
                                                            userId,
                                                            {
                                                                reason: undoReason(
                                                                    reason,
                                                                ),
                                                                idempotencyKey:
                                                                    crypto.randomUUID(),
                                                                role: from,
                                                            },
                                                        );
                                                    return undone.ok
                                                        ? { ok: true }
                                                        : {
                                                              ok: false,
                                                              description:
                                                                  undone.error,
                                                          };
                                                },
                                            });
                                        }}
                                    />
                                    <RemoveMember
                                        organizationId={organizationId}
                                        userId={userId}
                                        name={label}
                                        business={businessName}
                                        trigger="Remove…"
                                        onPending={asked}
                                        onRemoved={() =>
                                            feedback.report({
                                                message: `${label} removed from ${businessName}.`,
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </ChangedRow>
                    );
                })}
            </ul>
            {ownerChanges.length > 0 && (
                <div className="grid gap-2">
                    <p className="text-sm font-medium">
                        Waiting for a second staff member
                    </p>
                    <ul className="grid gap-1.5">
                        {ownerChanges.map((change) => {
                            const name = nameOf(change.userId);
                            const what =
                                change.kind === "REMOVE"
                                    ? `Remove ${name}, an Owner`
                                    : change.role === "OWNER"
                                      ? `Make ${name} an Owner`
                                      : `Make ${name} ${memberRole(change.role ?? "")}, not an Owner`;
                            return (
                                <li
                                    key={change.id}
                                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                >
                                    <span className="min-w-0 break-words">
                                        {what} · asked{" "}
                                        {formatDate(change.createdAt)} ·{" "}
                                        <span className="text-muted-foreground">
                                            {change.reason}
                                        </span>
                                    </span>
                                    {canChange &&
                                        (change.requestedByUserId ===
                                        staffUserId ? (
                                            <span className="text-[13px] text-muted-foreground">
                                                You asked: another staff member
                                                confirms
                                            </span>
                                        ) : (
                                            <ConfirmOwnerChange
                                                organizationId={organizationId}
                                                requestId={change.id}
                                                what={what}
                                            />
                                        ))}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            {invitations.length > 0 && (
                <div className="grid gap-2">
                    <p className="text-sm font-medium">
                        {plural(invitations.length, "invitation")} waiting
                    </p>
                    <ul className="grid gap-1.5">
                        {invitations.map((invite) => (
                            <li
                                key={invite.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                                <span className="min-w-0 break-all">
                                    {invite.email ?? "Someone"} as{" "}
                                    {memberRole(invite.role)} · ends{" "}
                                    {formatDate(invite.expiresAt)}
                                </span>
                                {canChange && (
                                    <InvitationActions
                                        organizationId={organizationId}
                                        invitationId={invite.id}
                                        label={invite.email ?? "this person"}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
