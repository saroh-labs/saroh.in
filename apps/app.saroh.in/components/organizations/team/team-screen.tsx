"use client";

import { PausedDiary } from "@/components/billing/paused-diary";
import {
    ROLE_BLURB,
    ROLE_PLAIN,
} from "@/components/organizations/roles/role-words";
import { RolesTab } from "@/components/organizations/roles/roles-tab";
import { SettingsPanelHeader } from "@/components/settings/settings-panel";
import type { PausedTeam } from "@/lib/billing/paused";
import { NONE_PAUSED, teamOverLimit } from "@/lib/billing/paused";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { DiaryPerson } from "@/lib/organizations/calendar-only";
import type { TeamLimit } from "@/lib/organizations/invitations";
import {
    inviteButton,
    inviteRoom,
    teamCountLine,
    teamCounts,
} from "@/lib/organizations/invitations";
import type {
    OrganizationInvitation,
    OrganizationMember,
    StorefrontTeamNoticePerson,
} from "@/lib/organizations/members";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { RolesLock } from "@/lib/organizations/roles-lock";
import {
    STOREFRONT_TEAM_LABEL,
    STOREFRONT_TEAM_ROLE,
} from "@/lib/organizations/storefront-team";
import { TEAM_TAB_PARAM } from "@/lib/settings/search";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { TabStrip } from "@saroh/ui/tabs";
import { showInfo } from "@saroh/ui/toast";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ReviewableSite } from "./invite-sheet";
import { InviteSheet } from "./invite-sheet";
import { MemberDrawer } from "./member-drawer";
import { PeopleTab } from "./people-tab";
import { RemoveMember } from "./remove-member";
import { roleBook } from "./role-book";
import { StorefrontTeamNotice } from "./storefront-team-notice";

/** The Team screen's two tabs, as `?tab=` names them. */
export const TEAM_TABS = ["roles", "people"] as const;

/**
 * Team (Settings → People), after the "Saroh Team Roles" design.
 *
 * Two tabs over one business. ROLES explains the four roles — who holds each,
 * what it opens, and the ring that marks it. PEOPLE is the roster: a
 * neutral monogram ringed in the role's colour, when each person was last
 * active, the role in words beside a dot of the same colour, a Remove on the
 * row and an Edit drawer that changes the role.
 *
 * Team is business-scoped: a role is held in a business and covers
 * everything that business has, and an invitation adds someone to this
 * business only. A storefront's people are on it too (DEC-048, F16): their
 * storefront roles show under their name as a narrower grant on top, and
 * those the storefront backfill added are named once in a notice with
 * Change role.
 *
 * Roles a business invents live in `RolesTab`, backed by the API's own
 * catalogue. Still not built, because nothing backs them yet: choosing a
 * role's ring colour (the avatar has one token per built-in, so invented roles
 * wear a neutral ring), and requiring two-step sign-in: Saroh has none, so
 * the design's row is left out rather than drawn as "Coming soon" (UX-085).
 *
 * A person's extra permissions (F17) are set in the Edit drawer under their
 * role, and People shows an "Extra permissions" column once anyone has one
 * (`member-extras.tsx`, `lib/organizations/extras.ts`).
 */
export function TeamScreen({
    organizationName,
    members,
    invitations,
    sites,
    canManage,
    canEditRoles,
    roles,
    catalogue,
    myActions,
    joinedFromStorefronts = [],
    teamLimit = null,
    rolesLock = null,
    limitNotice = null,
    bookableNoLogin = 0,
    diaryPeople = [],
    paused = NONE_PAUSED,
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    sites: ReviewableSite[];
    canManage: boolean;
    /** May invent and change roles — holds `member:role:update`. */
    canEditRoles: boolean;
    /** Every role the business has, built-in and invented, from the API. */
    roles: Role[];
    /** What a role may be granted; `null` when it could not be read. */
    catalogue: RoleCatalogue | null;
    /** What the viewer may do here; `null` when unknown, and nothing is held back. */
    myActions: string[] | null;
    /**
     * People the storefront backfill put on the team (F16), for the one-time
     * notice. Empty for anyone who may not change roles.
     */
    joinedFromStorefronts?: StorefrontTeamNoticePerson[];
    /**
     * The plan's team-members limit (plans catalogue U14): `full` once the
     * team and its open invites reach it, with the reason the design says.
     */
    teamLimit?: TeamLimit | null;
    /**
     * The plan leaves roles of your own off (UX-030): New role becomes the
     * way up, and extra permissions are locked. Null when it has them.
     */
    rolesLock?: RolesLock | null;
    /** Its 80% / 100% notice, above the tab's content. */
    limitNotice?: ReactNode;
    /**
     * People taking bookings with no login: each uses a team seat too
     * (DEC-105, UX-053), so the count line says them.
     */
    bookableNoLogin?: number;
    /**
     * Those of them the invite can give a login to (#868): they join as
     * Calendar only unless another role is picked.
     */
    diaryPeople?: DiaryPerson[];
    /**
     * Past the plan's team limit (#800): who can't open the business, and
     * which invitations can't be accepted, from `GET …/billing/paused`.
     */
    paused?: PausedTeam;
}) {
    // In the address, so Search settings can open Roles.
    const [tab, setTab] = useTabParam(TEAM_TAB_PARAM, TEAM_TABS, "people", {
        // The tab was `?view=` until every screen's tabs became `?tab=`.
        alias: "view",
    });
    const [editing, setEditing] = useState<OrganizationMember | null>(null);
    const [removing, setRemoving] = useState<OrganizationMember | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    // A full team invites nobody new, at any role (UX-028, DEC-155): the
    // button says why, as the design flashes it — the invite would be
    // refused, invites count too, and where more is.
    const room = inviteRoom(teamLimit);
    // Past the plan's limit (#800): the team is over it, not just at it.
    const over = teamOverLimit(paused);
    // Someone already on the diary takes no extra seat (#868), so a full
    // team can still invite them — unless it is over, when their login
    // would be paused (`inviteButton`).
    const invite = inviteButton(teamLimit, diaryPeople.length, over);
    const invitableDiary = invite.diary ? diaryPeople : [];
    // What the seats count (DEC-155): everyone, and every open invite.
    const counts = teamCounts(members, invitations);
    const openInvite = () => {
        if (invite.refused) {
            showInfo(invite.refused);
            return;
        }
        setInviteOpen(true);
    };

    const book = roleBook({ roles, organizationName, catalogue, myActions });

    // For someone who may look but not change: who can, and who to ask.
    const ownerFirstName = members
        .find((m) => (m.roleKey ?? m.role) === "OWNER" && m.name?.trim())
        ?.name?.trim()
        .split(/\s+/)[0];
    // On Roles, it is the role editor's own permission that counts: a
    // custom role holding `member:role:update` may edit roles (within its
    // reach) without being able to manage people, so it isn't read-only.
    const readOnlyNote = (tab === "roles" ? canEditRoles : canManage)
        ? undefined
        : `Only owners and admins can change this.${ownerFirstName ? ` Ask ${ownerFirstName} if something needs updating.` : ""}`;

    const tabs = [
        { id: "roles" as const, label: "Roles", count: roles.length },
        { id: "people" as const, label: "People", count: members.length },
    ];

    return (
        <div className="space-y-[18px]">
            {/* 12px from the title row to the tabs, then 18px to the
                content, as the design spaces them. */}
            <div className="space-y-3">
                <SettingsPanelHeader
                    title="Team"
                    description="Everyone here works across the whole business."
                    actions={
                        // On People, where the person invited will appear.
                        canManage && tab === "people" ? (
                            <Button onClick={openInvite}>{invite.label}</Button>
                        ) : undefined
                    }
                    readOnlyNote={readOnlyNote}
                    className="mb-0"
                />
                <TabStrip
                    label="Team"
                    idPrefix="team-tab"
                    value={tab}
                    onValueChange={setTab}
                    tabs={tabs.map((t) => ({
                        value: t.id,
                        label: t.label,
                        count: t.count,
                    }))}
                />
            </div>

            {limitNotice}
            {/* What the cap counts, so "full" never sits beside People = 1. */}
            {teamLimit && tab === "people" ? (
                <p className="text-[12.5px] text-muted-foreground">
                    {teamCountLine(
                        counts.people,
                        counts.waiting,
                        bookableNoLogin,
                    )}
                    {over
                        ? ". The team is over its plan's limit."
                        : teamLimit.full
                          ? ". The team is at its plan's limit."
                          : ""}
                </p>
            ) : null}

            {/* Diary people past the plan's team limit (#800). */}
            {tab === "people" ? <PausedDiary people={paused.diary} /> : null}

            {tab === "roles" ? (
                <RolesTab
                    roles={roles}
                    catalogue={catalogue}
                    canEdit={canEditRoles}
                    myActions={myActions}
                    organizationName={organizationName}
                    builtInBlurb={ROLE_BLURB}
                    builtInPlain={ROLE_PLAIN}
                    rolesLock={rolesLock}
                />
            ) : members.length <= 1 && invitations.length === 0 ? (
                <EmptyState
                    data-ph-mask=""
                    icon={<Users />}
                    title="No one else yet"
                    description={`You are the only person in ${organizationName} so far.`}
                    action={
                        canManage ? (
                            <Button onClick={openInvite}>{invite.label}</Button>
                        ) : undefined
                    }
                />
            ) : (
                <PeopleTab
                    organizationName={organizationName}
                    members={members}
                    invitations={invitations}
                    canManage={canManage}
                    book={book}
                    paused={paused}
                    // Changing a role or a person's extras is
                    // `member:role:update`, which a custom role may hold
                    // without inviting anyone (F17).
                    onEdit={canManage || canEditRoles ? setEditing : undefined}
                    onRemove={setRemoving}
                    notice={
                        canEditRoles ? (
                            <StorefrontTeamNotice
                                // Only people still on the roster.
                                people={joinedFromStorefronts.filter((p) =>
                                    members.some((m) => m.userId === p.userId),
                                )}
                                roleLabel={
                                    roles.find(
                                        (r) => r.key === STOREFRONT_TEAM_ROLE,
                                    )?.label ?? STOREFRONT_TEAM_LABEL
                                }
                                onChangeRole={(userId) => {
                                    const member = members.find(
                                        (m) => m.userId === userId,
                                    );
                                    if (member) setEditing(member);
                                }}
                            />
                        ) : null
                    }
                />
            )}

            <MemberDrawer
                member={editing}
                members={members}
                organizationName={organizationName}
                book={book}
                canEditExtras={canEditRoles}
                rolesLock={rolesLock}
                onClose={() => setEditing(null)}
                onRemove={(m) => {
                    setEditing(null);
                    setRemoving(m);
                }}
            />
            <RemoveMember
                member={removing}
                organizationName={organizationName}
                onClose={() => setRemoving(null)}
            />
            {canManage ? (
                <InviteSheet
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    organizationName={organizationName}
                    sites={sites}
                    book={book}
                    members={members}
                    invitations={invitations}
                    seatReason={room.reason}
                    diaryPeople={invitableDiary}
                    // The new invite shows at the top of People.
                    onSent={() => setTab("people")}
                />
            ) : null}
        </div>
    );
}
