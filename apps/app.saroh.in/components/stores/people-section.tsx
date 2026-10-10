"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import { Section as Rows } from "@/components/sites/settings-rows";
import {
    removeMember,
    revokeInvitation,
    updateMemberRole,
} from "@/lib/members/actions";
import type { MemberRole } from "@/lib/members/service";
import { LOCATION_SECTIONS } from "@/lib/stores/location-readiness";
import type { LocationPeople } from "@/lib/stores/people";
import {
    LOCATION_ROLES,
    onlyOwnerHere,
    onlyOwnerWords,
    personName,
    roleLabel,
    shownInvitations,
} from "@/lib/stores/people";

import { InvitePersonSheet } from "./invite-person-sheet";
import { Note, Section } from "./storefront-section";

/** One person or invitation: who on the left, what can be done on the right. */
const PERSON =
    "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3";

const ROLE_OPTIONS = LOCATION_ROLES.map((r) => ({
    value: r,
    label: roleLabel(r),
}));

/**
 * People: who works at this location, read first (owner, 10 Oct; it was a
 * page of its own that led with a boxed invite form). One line on what
 * being here means, then the people as rows (name, email, role) and, under
 * them, the invitations still out. "Invite someone" is the tab's one
 * action and opens a side sheet, as Delivery's Edit does.
 *
 * What each person may do is unchanged from that page: the location's owner
 * changes roles, removes people and revokes invitations; inviting also
 * needs the team's invite, because whoever accepts joins the team (DEC-048,
 * F16). A roster that couldn't be read says so here, on its own tab.
 */
export function PeopleSection({
    store,
    people,
}: {
    store: { id: string; name: string };
    /** `null` when the roster couldn't be read. */
    people: LocationPeople | null;
}) {
    const router = useRouter();
    const [inviting, setInviting] = useState(false);
    // Removing someone cannot be undone from here (bringing them back means
    // a new invitation they have to accept), so it asks first.
    const [removing, setRemoving] = useState<{
        userId: string;
        name: string;
    } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const frame = (children: React.ReactNode) => (
        <Section
            title={LOCATION_SECTIONS.people.label}
            id={LOCATION_SECTIONS.people.id}
        >
            {children}
        </Section>
    );

    if (!people) {
        return frame(
            <FailedState
                title="The people here could not be loaded"
                description="Who works at this location could not be read, so nobody is shown rather than guessed. Nothing has been changed."
                action={
                    <Button variant="outline" onClick={() => router.refresh()}>
                        Try again
                    </Button>
                }
            />,
        );
    }
    if (people.members.length === 0) {
        // The API shows a location's people to its owner and to those who
        // work here, and answers anyone else with none.
        return frame(
            <PermissionDeniedState
                data-ph-mask=""
                title="You can't see who works here"
                description={`${store.name}'s people are shown to its owner and to the people who work here.`}
                note="Its owner can invite you to this location."
            />,
        );
    }

    const { members, canManage, canInvite } = people;
    const invitations = shownInvitations(people);
    const alone = onlyOwnerHere(people);

    async function onChangeRole(userId: string, next: MemberRole) {
        setBusy(userId);
        const res = await updateMemberRole(store.id, userId, next);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Role updated");
        router.refresh();
    }

    async function onRemove(userId: string) {
        setBusy(userId);
        const res = await removeMember(store.id, userId);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Member removed");
        router.refresh();
    }

    async function onRevoke(invitationId: string) {
        setBusy(invitationId);
        const res = await revokeInvitation(store.id, invitationId);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Invitation revoked");
        router.refresh();
    }

    const invite = canInvite ? (
        <Button
            id="invite-someone"
            variant="brand"
            size="sm"
            aria-haspopup="dialog"
            onClick={() => setInviting(true)}
        >
            Invite someone
        </Button>
    ) : null;

    return frame(
        <>
            {/* The line, the action at its right, then the roster. On a
                phone the action sits under the roster, where the thumb is. */}
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <Note>
                    Who can work on {store.name}&apos;s catalogue, orders and
                    customers. Everyone here is also on your team, under Team.
                </Note>
                {invite && !alone ? (
                    <div className="order-last sm:order-none">{invite}</div>
                ) : null}
                <div className="grid min-w-0 gap-5 sm:col-span-2">
                    {canManage && !canInvite ? (
                        <p
                            role="note"
                            className="text-pretty rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-[1.5]"
                        >
                            Inviting someone here also adds them to your team,
                            and your role can&apos;t invite people to the team.
                            Ask an owner or admin to invite them.
                        </p>
                    ) : null}

                    {alone ? (
                        <EmptyState
                            data-ph-mask=""
                            title="No one else works here yet"
                            description={onlyOwnerWords(people, store.name)}
                            action={invite ?? undefined}
                        />
                    ) : (
                        <Rows title="At this location">
                            <ul
                                data-testid="location-people"
                                className="divide-y divide-border"
                            >
                                {members.map((m) => {
                                    const name = personName(m);
                                    return (
                                        <li
                                            key={`${m.kind}-${m.userId}`}
                                            className={PERSON}
                                        >
                                            <div className="min-w-0 flex-[1_1_180px]">
                                                <p className="text-sm font-medium [overflow-wrap:anywhere]">
                                                    {name}
                                                </p>
                                                {name === m.email ? null : (
                                                    <p className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
                                                        {m.email}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {m.kind === "owner" ||
                                                !canManage ? (
                                                    <Badge variant="neutral">
                                                        {roleLabel(m.role)}
                                                    </Badge>
                                                ) : (
                                                    <>
                                                        <OptionSelect
                                                            aria-label={`Role for ${m.email}`}
                                                            size="sm"
                                                            value={
                                                                m.role as MemberRole
                                                            }
                                                            disabled={
                                                                busy ===
                                                                m.userId
                                                            }
                                                            onValueChange={(
                                                                v,
                                                            ) =>
                                                                onChangeRole(
                                                                    m.userId,
                                                                    v,
                                                                )
                                                            }
                                                            options={
                                                                ROLE_OPTIONS
                                                            }
                                                            className="w-32 coarse:h-11"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={`Remove ${name}`}
                                                            disabled={
                                                                busy ===
                                                                m.userId
                                                            }
                                                            onClick={() =>
                                                                setRemoving({
                                                                    userId: m.userId,
                                                                    name,
                                                                })
                                                            }
                                                        >
                                                            Remove
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Rows>
                    )}

                    {invitations.length > 0 ? (
                        <Rows title="Invited">
                            <ul
                                data-testid="location-invited"
                                className="divide-y divide-border"
                            >
                                {invitations.map((inv) => (
                                    <li key={inv.id} className={PERSON}>
                                        <div className="min-w-0 flex-[1_1_180px]">
                                            <p className="text-sm font-medium [overflow-wrap:anywhere]">
                                                {inv.email}
                                            </p>
                                            <p className="text-[12.5px] text-muted-foreground">
                                                Invited as{" "}
                                                {roleLabel(
                                                    inv.role,
                                                ).toLowerCase()}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="shrink-0"
                                            aria-label={`Revoke the invitation to ${inv.email}`}
                                            disabled={busy === inv.id}
                                            onClick={() => onRevoke(inv.id)}
                                        >
                                            Revoke
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </Rows>
                    ) : null}
                </div>
            </div>

            {canInvite ? (
                <InvitePersonSheet
                    storeId={store.id}
                    locationName={store.name}
                    open={inviting}
                    onOpenChange={setInviting}
                />
            ) : null}
            {removing ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setRemoving(null);
                    }}
                    title={`Remove ${removing.name}?`}
                    description="They lose access to this location's catalogue, orders and customers straight away. They stay on your team; remove them there to take that away too. Bringing them back here means inviting them again."
                    confirmLabel="Remove"
                    onConfirm={() => {
                        const r = removing;
                        setRemoving(null);
                        void onRemove(r.userId);
                    }}
                />
            ) : null}
        </>,
    );
}
