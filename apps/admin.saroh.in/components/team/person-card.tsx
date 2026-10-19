import { Badge } from "@saroh/ui/badge";

import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/roles";
import type { StaffInvite, StaffMember } from "@/lib/staff";
import { accessEnds, JOB_LABEL, looksAfterBusinesses } from "@/lib/team-words";

import { LoadBar } from "./load-bar";
import {
    AmendStaff,
    ResendInvite,
    RevokeStaff,
    WithdrawInvite,
} from "./team-actions";

/**
 * One person on the Team, the same facts whether drawn as a card or a
 * table row (R30): name and email, what they work as, their console roles
 * (each with its end date), since when, when their access ends, and the
 * businesses they look after against their capacity. An invite shows when
 * it was sent and when its link runs out, with Resend and Withdraw.
 */

export type Person =
    | { kind: "member"; member: StaffMember }
    | { kind: "invite"; invite: StaffInvite };

/** The facts both layouts show, in words. */
export function personFacts(person: Person) {
    if (person.kind === "invite") {
        const { invite } = person;
        return {
            id: `invite:${invite.id}`,
            name: invite.name,
            email: invite.email,
            job: JOB_LABEL[invite.worksAs],
            roles: invite.roles.map((role) => ({
                key: role,
                text: ROLE_LABEL[role],
            })),
            since:
                invite.state === "expired"
                    ? `Invite sent ${formatDate(invite.sentAt)}, link ran out`
                    : `Invite sent ${formatDate(invite.sentAt)}`,
            ends: `Link works until ${formatDate(invite.expiresAt)}`,
            status:
                invite.state === "expired"
                    ? ({ tone: "warning", text: "Invite ran out" } as const)
                    : ({ tone: "info", text: "Invited" } as const),
            load: null,
            note: null,
        };
    }
    const { member } = person;
    const job = member.profile?.worksAs ?? null;
    const businesses = member.businesses ?? 0;
    const ending = accessEnds(member.roles);
    return {
        id: member.platformAdminId,
        name: member.name ?? member.email,
        email: member.email,
        job: job ? JOB_LABEL[job] : "No job yet",
        roles: member.roles.map((role) => ({
            key: role.assignmentId,
            text: role.expiresAt
                ? `${ROLE_LABEL[role.role]} · until ${formatDate(role.expiresAt)}`
                : ROLE_LABEL[role.role],
        })),
        since: `Since ${formatDate(member.grantedAt)}`,
        ends: ending
            ? `Access ends ${formatDate(ending)}`
            : "Access never ends",
        status:
            member.roles.length === 0
                ? ({ tone: "warning", text: "No active role" } as const)
                : null,
        load: looksAfterBusinesses({
            job,
            roles: member.roles.map((role) => role.role),
            businesses,
        })
            ? { count: businesses, capacity: member.profile?.capacity ?? null }
            : null,
        note: member.note,
    };
}

/** Change and Revoke for a teammate; Resend and Withdraw for an invite. */
export function PersonActions({
    person,
    onDone,
}: {
    person: Person;
    onDone: (message: string) => void;
}) {
    if (person.kind === "invite") {
        return (
            <div className="flex flex-wrap gap-1">
                <ResendInvite invite={person.invite} onDone={onDone} />
                <WithdrawInvite invite={person.invite} onDone={onDone} />
            </div>
        );
    }
    return (
        <div className="flex flex-wrap gap-1">
            <AmendStaff member={person.member} />
            <RevokeStaff member={person.member} />
        </div>
    );
}

export function PersonCard({
    person,
    canGrant,
    onDone,
}: {
    person: Person;
    canGrant: boolean;
    onDone: (message: string) => void;
}) {
    const facts = personFacts(person);
    return (
        <article
            aria-label={facts.name}
            className="grid content-start gap-3 rounded-xl border bg-card p-4"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                    <h3 className="truncate font-medium">{facts.name}</h3>
                    {facts.email !== facts.name && (
                        <p className="break-all text-[13px] text-muted-foreground">
                            {facts.email}
                        </p>
                    )}
                    <p className="text-[13px] text-muted-foreground">
                        {facts.job}
                    </p>
                </div>
                {facts.status && (
                    <Badge variant={facts.status.tone}>
                        {facts.status.text}
                    </Badge>
                )}
            </div>
            {facts.load ? (
                <LoadBar
                    count={facts.load.count}
                    capacity={facts.load.capacity}
                />
            ) : person.kind === "member" ? (
                <p className="text-[13px] text-muted-foreground">
                    Doesn&rsquo;t look after businesses.
                </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
                {facts.roles.map((role) => (
                    <Badge key={role.key} variant="neutral">
                        {role.text}
                    </Badge>
                ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
                {facts.since} · {facts.ends}
                {facts.note && ` · ${facts.note}`}
            </p>
            {canGrant && <PersonActions person={person} onDone={onDone} />}
        </article>
    );
}
