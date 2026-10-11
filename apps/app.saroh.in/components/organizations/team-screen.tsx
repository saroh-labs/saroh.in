"use client";

import { PausedNote } from "@/components/billing/paused-banner";
import { PausedDiary } from "@/components/billing/paused-diary";
import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { SettingsPanelHeader } from "@/components/settings/settings-panel";
import { useBusinessZone } from "@/components/shared/business-zone";
import type { PausedTeam } from "@/lib/billing/paused";
import { NONE_PAUSED, pausedWords, teamOverLimit } from "@/lib/billing/paused";
import { count } from "@/lib/format/plural";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Avatar,
    AvatarFallback,
    avatarInitials,
    RoleDot,
    roleRingTone,
} from "@saroh/ui/avatar";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { showError, showInfo, showSuccess } from "@saroh/ui/toast";
import { Check, Info, Mail, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { LeaveBusiness } from "@/components/organizations/leave-business";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormSheet } from "@/components/shared/form-sheet";
import { useHold } from "@/components/shared/use-hold";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { DiaryPerson } from "@/lib/organizations/calendar-only";
import {
    CALENDAR_ONLY_BLURB,
    CALENDAR_ONLY_PLAIN,
    CALENDAR_ONLY_ROLE,
    roleAfterDiaryPick,
} from "@/lib/organizations/calendar-only";
import {
    anyoneHasExtras,
    beyondViewer,
    extraLabels,
    roleGrants,
} from "@/lib/organizations/extras";
import type { InviteValues, TeamLimit } from "@/lib/organizations/invitations";
import {
    invitationMeta,
    inviteButton,
    inviteRoom,
    inviteSchema,
    teamCountLine,
    teamCounts,
    usesSeat,
} from "@/lib/organizations/invitations";
import { isOnlyOwner, onlyOwnerLine } from "@/lib/organizations/leave-business";
import {
    inviteMember,
    removeMember,
    revokeInvitation,
    setMemberExtraActions,
    updateMemberRole,
} from "@/lib/organizations/member-actions";
import type {
    OrganizationInvitation,
    OrganizationMember,
    StorefrontTeamNoticePerson,
} from "@/lib/organizations/members";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { RolesLock } from "@/lib/organizations/roles-lock";
import type { OrganizationRole } from "@/lib/organizations/service";
import {
    STOREFRONT_TEAM_LABEL,
    STOREFRONT_TEAM_ROLE,
    storefrontRolesLine,
} from "@/lib/organizations/storefront-team";
import { TEAM_TAB_PARAM } from "@/lib/settings/search";

import { CheckRow } from "@/components/shared/check-row";
import { ChoiceGroup } from "@/components/shared/choice-group";
import {
    ListTable,
    listTable,
    ListTableHead,
} from "@/components/shared/list-toolbar";
import { runAction } from "@/lib/api/run-action";
import { TabStrip } from "@saroh/ui/tabs";
import { Tip } from "@saroh/ui/tooltip";
import { InviteDiaryPerson } from "./invite-diary-person";
import { LastActiveLine } from "./last-active-line";
import {
    ExtraPermissions,
    ExtrasCell,
    ExtrasLine,
    useMemberExtras,
} from "./member-extras";
import { RolesTab } from "./roles-tab";
import { StorefrontTeamNotice } from "./storefront-team-notice";

const ROLES: OrganizationRole[] = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"];

const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/**
 * What each role is for, in the words a small business would use — and only
 * what the API's policy grants (`organization-policy.ts`): a business may
 * have several owners and never none; an admin lacks closing the
 * business and changing what it pays Saroh (the plan, DEC-131 amended
 * 2026-10-11), so cannot change or remove an owner either; a member runs the
 * day — reads it and moves orders along — sees the business's settings
 * without changing them, and sees no money.
 */
const ROLE_BLURB: Record<OrganizationRole, string> = {
    OWNER: "Can open and change everything. A business always has at least one owner, so it can never be locked out.",
    ADMIN: "Can do everything an owner can, except close the business, change the Saroh plan, or change or remove an owner.",
    MEMBER: "Runs the day: sees bookings, contacts and the team, and moves orders along as they're prepared. No money, and no business settings.",
    REVIEWER:
        "Can look at the websites they're invited to, comment and sign them off. Nothing else in the business.",
};

/** The same, in a few words, under a role's name wherever one is picked. */
const ROLE_PLAIN: Record<OrganizationRole, string> = {
    OWNER: "can open everything",
    ADMIN: "everything except the Saroh plan and removing an owner",
    MEMBER: "runs the day, no money or settings",
    REVIEWER: "invited websites, nothing else",
};

/** A person's name, or their email while they have not given one. */
function nameOf(person: { name: string | null; email: string }): string {
    return person.name?.trim() ? person.name : person.email;
}

export interface ReviewableSite {
    id: string;
    name: string;
}

/**
 * Every role the business has, and the questions the roster asks of one.
 *
 * One object rather than four helpers passed separately, because all three
 * places a person gets a role — the roster row, the edit drawer and the
 * invite dialog — must answer these the same way. Two answers to "what is
 * this role called" is how a Stock clerk shows as "Member" in one place.
 */
interface RoleBook {
    all: Role[];
    labelOf: (key: string) => string;
    blurbOf: (key: string) => string;
    /** What it opens, in a few words ("can open everything"). */
    plainOf: (key: string) => string;
    /**
     * False when the role can do something the viewer cannot. The API refuses
     * to hand out, change or remove such a role; the screen says so first.
     */
    withinReach: (key: string) => boolean;
    /** Everything the role grants, implied holds included (F17). */
    grantsOf: (key: string) => ReadonlySet<string>;
    /** The same question of a person: their role and their extras (F17). */
    personWithinReach: (member: OrganizationMember) => boolean;
    /** Names for extra permissions; null when the list could not be read. */
    catalogue: RoleCatalogue | null;
    /** What the viewer holds; null when unknown, and nothing is held back. */
    myActions: string[] | null;
}

function isBuiltIn(key: string): key is OrganizationRole {
    return (ROLES as readonly string[]).includes(key);
}

/** The Team screen's two tabs, as `?tab=` names them. */
const TEAM_TABS = ["roles", "people"] as const;

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
    // Full seats still invite someone view-only, who takes no seat (UX-028,
    // DEC-105). With both caps reached, it says why, as the design flashes
    // it: the invite would be refused, invites count too, and where more is.
    const room = inviteRoom(teamLimit);
    // Past the plan's limit (#800): the team is over it, not just at it.
    const over = teamOverLimit(paused);
    // Someone already on the diary takes no extra seat (#868), so a full
    // team can still invite them — unless it is over, when their login
    // would be paused (`inviteButton`).
    const invite = inviteButton(teamLimit, diaryPeople.length, over);
    const invitableDiary = invite.diary ? diaryPeople : [];
    // What the seats count (DEC-105), from what the API says each uses.
    const counts = teamCounts(members, invitations);
    const openInvite = () => {
        if (invite.refused) {
            showInfo(invite.refused);
            return;
        }
        setInviteOpen(true);
    };

    const byKey = new Map(roles.map((r) => [r.key, r]));
    const book: RoleBook = {
        all: roles,
        labelOf: (key) =>
            byKey.get(key)?.label ?? (isBuiltIn(key) ? ROLE_LABEL[key] : key),
        blurbOf: (key) => {
            if (isBuiltIn(key)) return ROLE_BLURB[key];
            if (key === CALENDAR_ONLY_ROLE) return CALENDAR_ONLY_BLURB;
            const n = byKey.get(key)?.actions.length ?? 0;
            return `Made for ${organizationName}. Whoever holds it can do exactly what was ticked for it: ${count(n, "permission")}.`;
        },
        plainOf: (key) => {
            if (isBuiltIn(key)) return ROLE_PLAIN[key];
            if (key === CALENDAR_ONLY_ROLE) return CALENDAR_ONLY_PLAIN;
            const n = byKey.get(key)?.actions.length ?? 0;
            return count(n, "permission");
        },
        withinReach: (key) => {
            const role = byKey.get(key);
            // Unknown role or unknown viewer: let the API decide, it will.
            if (!role || myActions === null) return true;
            return role.actions.every((a) => myActions.includes(a));
        },
        grantsOf: (key) => roleGrants(byKey.get(key)),
        personWithinReach: (m) =>
            book.withinReach(m.roleKey ?? m.role) &&
            !beyondViewer(new Set(), m.extraActions ?? [], myActions),
        catalogue,
        myActions,
    };

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
                        counts.viewOnly,
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
                                    byKey.get(STOREFRONT_TEAM_ROLE)?.label ??
                                    STOREFRONT_TEAM_LABEL
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
                    seatReason={room.seatReason}
                    viewOnlyReason={room.viewOnlyReason}
                    diaryPeople={invitableDiary}
                    // The new invite shows at the top of People.
                    onSent={() => setTab("people")}
                />
            ) : null}
        </div>
    );
}

/* ─── People ────────────────────────────────────────────────────────────── */

function PeopleTab({
    organizationName,
    members,
    invitations,
    canManage,
    book,
    onEdit,
    onRemove,
    notice,
    paused,
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    canManage: boolean;
    book: RoleBook;
    paused: PausedTeam;
    /** Absent for a viewer who can neither manage people nor change roles. */
    onEdit?: (member: OrganizationMember) => void;
    onRemove: (member: OrganizationMember) => void;
    /** The storefront-people notice (F16), above the roster. */
    notice?: React.ReactNode;
}) {
    // The design's columns need about 600px; the panel is that wide only
    // once the settings list sits beside it on a wide screen. Narrower, a
    // row is the person — role and extras under their name — and their
    // buttons. The Extra permissions column shows only once someone has
    // one (F15, F17): a column that says "—" for everyone says nothing.
    const withExtras = anyoneHasExtras(members);
    // The only owner can't leave: no button on their row, and why below.
    const onlyOwner = isOnlyOwner(members) === true;
    const grid = withExtras
        ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 xl:grid-cols-[minmax(170px,1.3fr)_112px_minmax(0,210px)_150px]"
        : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 xl:grid-cols-[minmax(170px,1.3fr)_112px_150px]";
    const rowButton = "text-[12.5px]";
    // A page of people at a time, at the size this list was last shown at.
    const { rows: paged, paging } = useLocalPages("team", members, {
        label: "Pages of people",
    });

    return (
        <div className="space-y-3.5">
            {notice}

            {paused.userIds.length > 0 || paused.invitationIds.length > 0 ? (
                <PausedNote>{pausedWords("person")}</PausedNote>
            ) : null}

            {canManage && invitations.length > 0 ? (
                <PendingInvites
                    invitations={invitations}
                    book={book}
                    pausedIds={paused.invitationIds}
                />
            ) : null}

            <ListTable>
                <ListTableHead className={cn(grid, "hidden xl:grid")}>
                    <span>Person</span>
                    <span>Role</span>
                    {withExtras ? <span>Extra permissions</span> : null}
                    <span />
                </ListTableHead>
                <ul>
                    {paged.map((m) => {
                        const role = m.roleKey ?? m.role;
                        const extras = extraLabels(
                            m.extraActions ?? [],
                            book.catalogue,
                        );
                        // An owner is moved to another role first (Edit), and
                        // no one is removed by someone they outrank, by role
                        // or by extras. Leaving is not removing yourself: it
                        // is on your own row, whatever your role.
                        const canRemove =
                            canManage &&
                            role !== "OWNER" &&
                            !m.isSelf &&
                            book.personWithinReach(m);
                        return (
                            <li
                                key={m.userId}
                                className={cn(grid, listTable.row)}
                            >
                                <div className="flex min-w-0 items-center gap-[11px]">
                                    <Avatar
                                        size="row"
                                        ringTone={roleRingTone(role)}
                                    >
                                        <AvatarFallback>
                                            {avatarInitials(m.name, m.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate text-[13.5px] font-medium">
                                            {m.name && m.name.length > 0
                                                ? m.name
                                                : m.email}
                                            {m.isSelf ? (
                                                <span className="font-normal text-muted-foreground">
                                                    {" "}
                                                    · you
                                                </span>
                                            ) : null}
                                            {paused.userIds.includes(
                                                m.userId,
                                            ) ? (
                                                <Badge
                                                    variant="warning"
                                                    className="ml-1.5 align-middle"
                                                >
                                                    Paused
                                                </Badge>
                                            ) : null}
                                        </p>
                                        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                            {m.email}
                                            {m.role === "REVIEWER"
                                                ? ` · ${count(m.siteIds.length, "site")}`
                                                : ""}
                                        </p>
                                        {m.storefronts &&
                                        m.storefronts.length > 0 ? (
                                            <p className="mt-px truncate text-[11.5px] text-muted-foreground">
                                                {storefrontRolesLine(
                                                    m.storefronts,
                                                )}
                                            </p>
                                        ) : null}
                                        {/* The role, where there is no Role
                                            column to hold it. */}
                                        <p className="mt-px flex min-w-0 items-center gap-1.5 text-[11.5px] xl:hidden">
                                            <RoleDot role={role} size={9} />
                                            <span className="truncate">
                                                {book.labelOf(role)}
                                            </span>
                                        </p>
                                        <ExtrasLine labels={extras} />
                                        <LastActiveLine at={m.lastActiveAt} />
                                    </div>
                                </div>
                                <div className="hidden min-w-0 items-center gap-2 xl:flex">
                                    <RoleDot role={role} size={9} />
                                    <span className="truncate text-[13px]">
                                        {book.labelOf(role)}
                                    </span>
                                </div>
                                {withExtras ? (
                                    <div className="hidden min-w-0 xl:block">
                                        <ExtrasCell labels={extras} />
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap justify-end gap-1.5">
                                    {m.isSelf && !onlyOwner ? (
                                        <LeaveBusiness
                                            business={organizationName}
                                            onlyOwner={false}
                                            locations={(
                                                m.storefronts ?? []
                                            ).map((s) => s.name)}
                                            size="sm"
                                            className={rowButton}
                                        />
                                    ) : null}
                                    {canRemove ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onRemove(m)}
                                            aria-label={`Remove ${nameOf(m)} from ${organizationName}`}
                                            className={cn(
                                                rowButton,
                                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                                            )}
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                    {onEdit ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onEdit(m)}
                                            aria-label={`Edit ${nameOf(m)}’s role and permissions`}
                                            className={rowButton}
                                        >
                                            Edit
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </ListTable>
            {paging}

            <div className="flex items-start gap-[9px] rounded-[10px] bg-foreground/[0.03] px-[15px] py-3">
                <Info
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                    A person&apos;s role sets what they can reach in{" "}
                    {organizationName}. Leaving this business touches nothing in
                    any other.
                    {onlyOwner ? ` ${onlyOwnerLine(organizationName)}` : null}
                </p>
            </div>
        </div>
    );
}

/**
 * Invitations sent and not yet answered, above the roster. Hidden when there
 * are none — an empty "not joined yet" box says nothing.
 *
 * Resend is the API's own re-invite: inviting an address that already has an
 * invitation refreshes it in place — a new link, a fresh week, a new email —
 * and the old link stops working. Cancel withdraws it for good, and the
 * link it voids cannot be revived, only replaced. So it is held: the row
 * goes at once with Undo, and it is cancelled when the ten seconds are up
 * (`useHold`). Resend tells someone, so it waits its ten seconds too.
 */
function PendingInvites({
    invitations,
    book,
    pausedIds = [],
}: {
    invitations: OrganizationInvitation[];
    book: RoleBook;
    /** Invitations past the plan's limit (#800): can't be accepted yet. */
    pausedIds?: string[];
}) {
    const router = useRouter();
    const zone = useBusinessZone();
    const { hold, send, pending } = useHold();
    const [cancelled, setCancelled] = useState<readonly string[]>([]);
    const shown = invitations.filter((i) => !cancelled.includes(i.id));

    function resend(invitation: OrganizationInvitation) {
        const role = invitation.roleKey ?? invitation.role;
        send(`resend:${invitation.id}`, {
            description: `A new link goes to ${invitation.email}. The old one stops working.`,
            run: () =>
                inviteMember({
                    email: invitation.email,
                    role,
                    ...(role === "REVIEWER"
                        ? { siteIds: invitation.siteIds }
                        : {}),
                }),
            sent: `Sent to ${invitation.email}.`,
            onSent: () => router.refresh(),
        });
    }

    function cancel(invitation: OrganizationInvitation) {
        const back = () =>
            setCancelled((ids) => ids.filter((id) => id !== invitation.id));
        setCancelled((ids) => [...ids, invitation.id]);
        hold(
            `invitation:${invitation.id}`,
            "Invitation cancelled.",
            async () => {
                const res = await revokeInvitation(invitation.id);
                if (!res.ok) {
                    showError("The invitation wasn't cancelled.", res.error);
                    back();
                }
                router.refresh();
            },
            back,
            { description: "Its link no longer works." },
        );
    }

    if (shown.length === 0) return null;

    return (
        <section
            aria-label="Invited, not joined yet"
            className={listTable.card}
        >
            <p className={cn(listTable.head, "flex")}>
                Invited · not joined yet
            </p>
            <ul>
                {shown.map((invitation) => {
                    const role = invitation.roleKey ?? invitation.role;
                    const resending = pending.includes(
                        `resend:${invitation.id}`,
                    );
                    // The API refuses to re-invite at a role that can do more
                    // than the person sending it.
                    const beyond = !book.withinReach(role);
                    return (
                        <li
                            key={invitation.id}
                            className={cn(
                                "flex flex-wrap items-center gap-3",
                                listTable.rowStill,
                            )}
                        >
                            <span
                                aria-hidden
                                className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground"
                            >
                                <Mail className="size-3.5 stroke-[1.9]" />
                            </span>
                            <div className="min-w-0 flex-[1_1_200px]">
                                <p className="text-[13.5px] font-medium [overflow-wrap:anywhere]">
                                    {invitation.email}
                                    {pausedIds.includes(invitation.id) ? (
                                        <Badge
                                            variant="warning"
                                            className="ml-1.5 align-middle"
                                        >
                                            Paused · can&rsquo;t be accepted yet
                                        </Badge>
                                    ) : null}
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {invitationMeta(invitation, zone)}
                                    {invitation.staff
                                        ? ` · for ${invitation.staff.name} on the diary`
                                        : ""}
                                </p>
                            </div>
                            <span className="text-[12.5px] text-foreground/80">
                                {book.labelOf(role)}
                            </span>
                            <div className="flex gap-1.5">
                                <Tip
                                    label={
                                        beyond
                                            ? "Can do more than you can"
                                            : undefined
                                    }
                                >
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={beyond}
                                        onClick={() => resend(invitation)}
                                        aria-label={`Resend the invite to ${invitation.email}`}
                                        busy={resending}
                                        busyLabel="Sending…"
                                    >
                                        Resend
                                    </Button>
                                </Tip>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => cancel(invitation)}
                                    aria-label={`Cancel the invitation to ${invitation.email}`}
                                    className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                                >
                                    Cancel invitation
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/* ─── The member drawer ─────────────────────────────────────────────────── */

function MemberDrawer({
    member,
    members,
    organizationName,
    book,
    canEditExtras,
    rolesLock,
    onClose,
    onRemove,
}: {
    member: OrganizationMember | null;
    members: OrganizationMember[];
    organizationName: string;
    book: RoleBook;
    /** Holds `member:role:update`, which also sets extras (F17). */
    canEditExtras: boolean;
    /** The plan leaves extras off (UX-030); null when it has them. */
    rolesLock: RolesLock | null;
    onClose: () => void;
    /** Hands an owner to the one Remove confirmation; see below. */
    onRemove: (member: OrganizationMember) => void;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const current = member ? (member.roleKey ?? member.role) : "MEMBER";
    const role = draft ?? current;
    const owners = members.filter(
        (m) => (m.roleKey ?? m.role) === "OWNER",
    ).length;
    // The workspace keeps an owner: the last one cannot be changed or removed.
    const lastOwner = current === "OWNER" && owners === 1;
    // Someone who can do more than the viewer, by role or by extras, cannot
    // be changed by them — the API refuses it, so the drawer says so instead
    // of offering the attempt.
    const outranks = !!member && !book.personWithinReach(member);
    const locked = lastOwner || outranks;
    const extras = useMemberExtras({
        extras: member?.extraActions,
        currentGrants: book.grantsOf(current),
        draftGrants: book.grantsOf(role),
        draftRoleLabel: book.labelOf(role),
        reviewer: role === "REVIEWER",
        isSelf: !!member?.isSelf,
        canEdit: canEditExtras,
        beyond: outranks,
        name: member ? nameOf(member) : "",
        catalogue: book.catalogue,
        myActions: book.myActions,
        planLocked: rolesLock?.line ?? null,
    });
    const roleChanged = !!member && role !== current;
    const changed = roleChanged || extras.changed;

    function close() {
        setDraft(null);
        extras.reset();
        onClose();
    }

    async function save() {
        if (!member) return;
        // A reviewer holds named sites; making someone one needs sites they
        // already have, or a fresh reviewer invitation.
        if (role === "REVIEWER" && member.siteIds.length === 0) {
            showError(
                "Invite them as a reviewer, with the sites they may review, before making them one.",
            );
            return;
        }
        const userId = member.userId;
        const siteIds = member.siteIds;
        const saved = await runAction(
            async () => {
                // The role first: the extras are judged against the role
                // they'll sit on top of.
                const res = roleChanged
                    ? await updateMemberRole(userId, {
                          role,
                          ...(role === "REVIEWER" ? { siteIds } : {}),
                      })
                    : null;
                const extrasRes =
                    (res === null || res.ok) && extras.changed
                        ? await setMemberExtraActions(userId, extras.chosen)
                        : null;
                return { res, extrasRes };
            },
            { setBusy: setSaving },
        );
        if (!saved) return;
        const { res, extrasRes } = saved;
        const failed = [res, extrasRes].find((r) => r && !r.ok);
        if (failed && !failed.ok) {
            showError(failed.error);
            // A role that saved before the extras were refused is still new.
            if (res?.ok) router.refresh();
            return;
        }
        showSuccess(
            roleChanged ? "Role saved." : "Permissions saved.",
            roleChanged
                ? `${nameOf(member)} is now ${book.labelOf(role)} in ${organizationName}.`
                : undefined,
        );
        close();
        router.refresh();
    }

    return (
        <FormSheet
            open={!!member}
            eyebrow={member?.email}
            title={member ? nameOf(member) : "Team member"}
            description={`Their role in ${organizationName}, and anything extra they may do. It applies as soon as you save.`}
            pending={saving}
            dirty={changed}
            saveOff={outranks}
            extra={
                /* Everyone else is removed from their row. An owner has no
                   Remove there, so this is the one way to remove a second
                   owner. The viewer leaves from their own row. */
                member && !locked && current === "OWNER" && !member.isSelf ? (
                    <Button
                        data-ph-mask=""
                        type="button"
                        variant="ghost"
                        className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                        disabled={saving}
                        onClick={() => {
                            // A role picked and not saved must not follow
                            // the sheet to the next person it opens for.
                            setDraft(null);
                            onRemove(member);
                        }}
                    >
                        Remove from {organizationName}
                    </Button>
                ) : null
            }
            onClose={close}
            onSubmit={save}
        >
            {member ? (
                <>
                    <div>
                        <p className="label mb-2.5">
                            Role in {organizationName}
                        </p>
                        <ChoiceGroup
                            label="Role"
                            className="flex flex-col gap-[5px]"
                            value={role}
                            onChange={setDraft}
                            disabled={locked}
                            choices={book.all.map(({ key: r }) => {
                                const on = r === role;
                                const beyond = !book.withinReach(r);
                                return {
                                    value: r,
                                    disabled: beyond,
                                    label: (
                                        <>
                                            <RoleDot role={r} />
                                            <span className="min-w-0 flex-1">
                                                <span
                                                    className={cn(
                                                        "block text-[13px]",
                                                        on
                                                            ? "font-semibold"
                                                            : "font-medium",
                                                    )}
                                                >
                                                    {book.labelOf(r)}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                                    {beyond
                                                        ? "Can do more than you can"
                                                        : book.plainOf(r)}
                                                </span>
                                            </span>
                                            {on ? (
                                                <Check
                                                    aria-hidden
                                                    className="size-4 shrink-0"
                                                />
                                            ) : null}
                                        </>
                                    ),
                                };
                            })}
                            itemClassName={(on, choice) =>
                                cn(
                                    "flex items-center gap-[11px] rounded-[9px] border px-3 py-[9px] text-left coarse:min-h-11",
                                    on
                                        ? "border-border-strong bg-foreground/[0.03]"
                                        : cn(
                                              "border-muted",
                                              !choice.disabled &&
                                                  "hover:border-border-strong active:bg-accent-active",
                                          ),
                                )
                            }
                        />

                        <ExtraPermissions
                            roleLabel={book.labelOf(role)}
                            groups={extras.groups}
                            lockedReason={extras.lockedReason}
                            disabled={saving}
                            onToggle={extras.toggle}
                        />

                        <div className="mt-4 flex items-start gap-[9px] rounded-[9px] bg-foreground/[0.03] px-[13px] py-[11px]">
                            <Info
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                                {lastOwner
                                    ? `${organizationName} keeps at least one owner. Make someone else an owner before changing or removing this one.`
                                    : outranks
                                      ? `${nameOf(member)} can do more than you can here, so you cannot change their role or remove them.`
                                      : (extras.summary ??
                                        `${book.labelOf(role)}: ${book.blurbOf(role)}`)}
                            </p>
                        </div>
                    </div>
                </>
            ) : null}
        </FormSheet>
    );
}

/**
 * The one confirmation for removing someone, from their row or — for an
 * owner — from the Edit drawer.
 *
 * The design removes at once and offers Undo. The API has no way to put a
 * membership back (a removed person comes back only through a new
 * invitation, and the share links revoked with them stay revoked), so an
 * Undo would be a promise it cannot keep. It asks once instead, and says
 * plainly that the access goes now.
 */
function RemoveMember({
    member,
    organizationName,
    onClose,
}: {
    member: OrganizationMember | null;
    organizationName: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const name = member ? nameOf(member) : "They";

    async function remove(): Promise<ConfirmResult> {
        if (!member) return;
        const res = await removeMember(member.userId);
        if (!res.ok) return { ok: false, error: res.error };
        const links = res.data.revokedLinks;
        showSuccess(
            `${name} removed.`,
            links > 0
                ? `They can no longer open ${organizationName}, and ${count(links, "share link")} they made stopped working.`
                : `They can no longer open ${organizationName}.`,
        );
        router.refresh();
    }

    return (
        <ConfirmDialog
            open={!!member}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            title={`Remove ${name} from ${organizationName}?`}
            description={`${name} loses access to ${organizationName} now, and any share links they made stop working.${
                member?.storefronts && member.storefronts.length > 0
                    ? ` They come off ${new Intl.ListFormat("en", { type: "conjunction" }).format(member.storefronts.map((s) => s.name))} too.`
                    : ""
            } Their work stays, and nothing changes in their other businesses. To bring them back, invite them again. This cannot be undone.`}
            confirmLabel="Remove from team"
            keepLabel="Keep on team"
            onConfirm={remove}
        />
    );
}

/* ─── Invite ────────────────────────────────────────────────────────────── */

/**
 * "Invite to <business>" ("Saroh Settings" design): an email, a role picked
 * from a list that says what each one is for, Cancel and Send invite. A
 * side sheet, as inviting someone to a location is (`InvitePersonSheet`).
 *
 * An invite tells someone, so it waits ten seconds with Undo (`useHold`):
 * the sheet closes, keeping what was typed, and a refusal or an Undo
 * opens it again with that.
 *
 * Owner is not offered — the design invites people to run the day, and a
 * second owner is made from the Edit drawer once they have joined. Roles the
 * business invented are offered beside the built-ins; one that can do more
 * than the person inviting is shown and disabled, because the API refuses it.
 */
function InviteSheet({
    open,
    onOpenChange,
    organizationName,
    sites,
    book,
    members,
    invitations,
    seatReason,
    viewOnlyReason,
    diaryPeople,
    onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationName: string;
    sites: ReviewableSite[];
    book: RoleBook;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    /** The seats are full (UX-028): only someone view-only, and why. */
    seatReason: string | null;
    /** The view-only people are full (DEC-105): only a seat, and why. */
    viewOnlyReason: string | null;
    /** Who on the diary could be given a login (#868). */
    diaryPeople: DiaryPerson[];
    onSent: () => void;
}) {
    const router = useRouter();
    const schema = inviteSchema({
        memberEmails: members.map((m) => m.email),
        invitedEmails: invitations.map((i) => i.email),
    });
    const offered = book.all.filter((r) => r.key !== "OWNER");
    // Why a role can't be picked for want of room on the plan: by whether
    // holding it uses a seat (DEC-105), never by its name.
    const roomFor = (r: Role): string | null =>
        usesSeat(r) ? seatReason : viewOnlyReason;
    // Picked to start with: Member, or with the seats full the first
    // view-only role the inviter may give.
    const startRole =
        (seatReason
            ? offered.find(
                  (r) => roomFor(r) === null && book.withinReach(r.key),
              )?.key
            : undefined) ?? "MEMBER";
    const form = useForm<InviteValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: "",
            role: startRole,
            siteIds: [],
            staffId: "",
        },
        mode: "onTouched",
    });
    const sending = form.formState.isSubmitting;
    const { send } = useHold();
    const role = useWatch({ control: form.control, name: "role" });
    const staffId = useWatch({ control: form.control, name: "staffId" });
    // Someone already on the diary takes bookings, so holds a seat
    // whatever the role: the invite adds nobody to either cap (#868).
    const noRoom = (r: Role): string | null => (staffId ? null : roomFor(r));

    function pickDiaryPerson(next: string) {
        form.setValue("staffId", next);
        form.setValue(
            "role",
            roleAfterDiaryPick({
                staffId: next,
                current: form.getValues("role"),
                start: startRole,
                hasCalendarOnly: offered.some(
                    (r) => r.key === CALENDAR_ONLY_ROLE,
                ),
            }),
        );
    }

    const blank = () =>
        form.reset({
            email: "",
            role: startRole,
            siteIds: [],
            staffId: "",
        });

    function close() {
        blank();
        onOpenChange(false);
    }

    function submit(values: InviteValues) {
        const email = values.email.trim().toLowerCase();
        // What the API said, for when the sheet opens again.
        let onEmail: string | null = null;
        let planned = false;
        // Closed with what was typed kept: a refusal or an Undo needs it.
        onOpenChange(false);
        send(`invite:${email}`, {
            description: `${email} joins as ${book.labelOf(values.role)}.`,
            run: async () => {
                const res = await inviteMember({
                    email,
                    role: values.role,
                    ...(values.role === "REVIEWER"
                        ? { siteIds: values.siteIds }
                        : {}),
                    ...(values.staffId ? { staffId: values.staffId } : {}),
                });
                if (res.ok) return { ok: true };
                // The plan's team limit (U13): its notice, not a toast.
                if (res.plan) {
                    planned = true;
                    showPlanRefusal(res.plan);
                    return { ok: false, error: "", said: true };
                }
                // A refusal about the address ("already in this business")
                // goes on the field; anything else is a toast.
                if (res.field === "email") onEmail = res.error;
                return {
                    ok: false,
                    error: res.error,
                    said: res.field === "email",
                };
            },
            sent: `Sent to ${email}.`,
            onSent: () => {
                blank();
                onSent();
                router.refresh();
            },
            onBack: () => {
                if (planned) return blank();
                onOpenChange(true);
                if (onEmail) form.setError("email", { message: onEmail });
            },
        });
    }

    const errorText =
        "text-[12.5px] font-normal text-destructive-subtle-foreground";

    return (
        <Form {...form}>
            <FormSheet
                open={open}
                title={`Invite to ${organizationName}`}
                description="They get an email with a link. It adds them to this business only."
                pending={sending}
                saveLabel="Send invite"
                savingLabel="Sending…"
                fieldsClassName="gap-3.5"
                onClose={close}
                onSubmit={(e) => void form.handleSubmit(submit)(e)}
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem className="space-y-1.5">
                            <FormLabel className="text-[12.5px] font-medium">
                                Email
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    autoComplete="off"
                                    placeholder="name@example.in"
                                    disabled={sending}
                                    className="aria-[invalid=true]:border-destructive-subtle-foreground"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage role="alert" className={errorText} />
                        </FormItem>
                    )}
                />

                <InviteDiaryPerson
                    people={diaryPeople}
                    value={staffId ?? ""}
                    disabled={sending}
                    onPick={pickDiaryPerson}
                />

                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem className="space-y-1.5">
                            <p
                                id="invite-role-label"
                                className="text-[12.5px] font-medium"
                            >
                                Role
                            </p>
                            {!staffId && (seatReason ?? viewOnlyReason) ? (
                                <p className="text-[12px] leading-[1.45] text-muted-foreground">
                                    {seatReason ?? viewOnlyReason}
                                </p>
                            ) : null}
                            <ChoiceGroup
                                labelledBy="invite-role-label"
                                className="grid gap-1.5"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={sending}
                                choices={offered.map((offer) => {
                                    const r = offer.key;
                                    // The API refuses to invite anyone
                                    // at a role that can do more than
                                    // the inviter.
                                    const beyond = !book.withinReach(r);
                                    // Full seats take no one who needs
                                    // one; full view-only places take no
                                    // one view-only.
                                    const full = noRoom(offer);
                                    const off = beyond || full !== null;
                                    const checked = r === field.value;
                                    return {
                                        value: r,
                                        disabled: off,
                                        tip: beyond
                                            ? "Can do more than you can"
                                            : (full ?? undefined),
                                        label: (
                                            <>
                                                <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold">
                                                    {book.labelOf(r)}
                                                    {/* Which one is picked, beyond the border (UX-029). */}
                                                    {checked && !off ? (
                                                        <Check
                                                            aria-hidden
                                                            className="size-4 shrink-0"
                                                        />
                                                    ) : null}
                                                </span>
                                                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                                    {book.blurbOf(r)}
                                                </span>
                                            </>
                                        ),
                                    };
                                })}
                                itemClassName={(on, choice) =>
                                    cn(
                                        "block w-full rounded-[9px] border px-3 py-[9px] text-left coarse:min-h-11",
                                        choice.disabled
                                            ? "border-border opacity-50"
                                            : on
                                              ? "border-foreground bg-foreground/[0.03] shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                                              : "border-border bg-card hover:border-border-strong",
                                    )
                                }
                            />
                        </FormItem>
                    )}
                />

                {role === "REVIEWER" ? (
                    <FormField
                        control={form.control}
                        name="siteIds"
                        render={({ field }) => (
                            <FormItem className="space-y-1.5">
                                <p className="text-[12.5px] font-medium">
                                    Websites they may review
                                </p>
                                {sites.length === 0 ? (
                                    <p className="text-[12.5px] text-muted-foreground">
                                        You have no websites yet. Make one
                                        first, then invite someone to review it.
                                    </p>
                                ) : (
                                    sites.map((site) => {
                                        const on = field.value.includes(
                                            site.id,
                                        );
                                        return (
                                            <CheckRow
                                                key={site.id}
                                                checked={on}
                                                disabled={sending}
                                                onChange={() =>
                                                    field.onChange(
                                                        on
                                                            ? field.value.filter(
                                                                  (s) =>
                                                                      s !==
                                                                      site.id,
                                                              )
                                                            : [
                                                                  ...field.value,
                                                                  site.id,
                                                              ],
                                                    )
                                                }
                                            >
                                                {site.name}
                                            </CheckRow>
                                        );
                                    })
                                )}
                                <FormMessage
                                    role="alert"
                                    className={errorText}
                                />
                            </FormItem>
                        )}
                    />
                ) : null}
            </FormSheet>
        </Form>
    );
}
