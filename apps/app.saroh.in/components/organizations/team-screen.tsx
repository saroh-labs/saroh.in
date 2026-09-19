"use client";

import {
    Avatar,
    AvatarFallback,
    avatarInitials,
    RoleDot,
    roleRingTone,
} from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, Info, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { NavAction, NavRole } from "@/components/shared/nav-items";
import { navFor, navRoleCan } from "@/components/shared/nav-items";
import {
    inviteMember,
    removeMember,
    revokeInvitation,
    updateMemberRole,
} from "@/lib/organizations/member-actions";
import type {
    OrganizationInvitation,
    OrganizationMember,
} from "@/lib/organizations/members";
import type { OrganizationRole } from "@/lib/organizations/service";

const ROLES: OrganizationRole[] = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"];

const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** What each role is for, in the words a small business would use. */
const ROLE_BLURB: Record<OrganizationRole, string> = {
    OWNER: "Reaches everything, and cannot be locked out. Every business needs one person who can always get back in.",
    ADMIN: "Everything day to day, with the same reach as Owner. The difference is closing the workspace, which only an Owner can do.",
    MEMBER: "The read-only floor: the business, its team and its modules, and every website. Changes nothing.",
    REVIEWER:
        "Narrower rather than beneath Member — the websites they are invited to, and nothing about the business around it.",
};

/** The ring each role wears today. Configurable rings need a server setting. */
const ROLE_RING: Record<OrganizationRole, string> = {
    OWNER: "ink",
    ADMIN: "clay",
    MEMBER: "saffron",
    REVIEWER: "slate",
};

/**
 * The destinations the reach map decides, each named for what it opens. These
 * are the `NavAction` values the rail and the server policy share, so the
 * grid below can be checked against the source line by line.
 */
const REACH_ROWS: {
    action: NavAction;
    label: string;
    note: string;
    needs?: string;
}[] = [
    {
        action: "site:read",
        label: "Website",
        note: "read every site",
        needs: "WEBSITE",
    },
    {
        action: "site:create",
        label: "New website",
        note: "make one",
        needs: "WEBSITE",
    },
    {
        action: "section:write",
        label: "Edit website pages",
        note: "the page builder",
        needs: "WEBSITE",
    },
    { action: "member:read", label: "Team", note: "this screen" },
    { action: "module:read", label: "Modules", note: "what is turned on" },
    { action: "notification:read", label: "Notifications", note: "" },
    {
        action: "org:settings:read",
        label: "Organization settings",
        note: "name, billing",
    },
    {
        action: "provider:read",
        label: "Providers",
        note: "payments, messaging",
    },
];

/** A person's name, or their email while they have not given one. */
function nameOf(person: { name: string | null; email: string }): string {
    return person.name?.trim() ? person.name : person.email;
}

export interface ReviewableSite {
    id: string;
    name: string;
}

/**
 * Team (Settings → People), after the "Saroh Team Roles" design.
 *
 * Two tabs over one business. ROLES explains the four roles — who holds each,
 * what it reaches here, and the ring that marks it. PEOPLE is the roster: a
 * neutral monogram ringed in the role's colour, the role in words beside a
 * dot of the same colour, and an Edit drawer that changes the role or removes
 * the person.
 *
 * Team is business-scoped: there is no storefront anywhere on this screen. A
 * role is held in a business and covers everything that business has, and an
 * invitation adds someone to this business only.
 *
 * Not built, because nothing yet backs them: custom roles, choosing a role's
 * ring colour, and per-person extra permissions. The four roles are an enum in
 * the API; their rings are the design's defaults.
 */
export function TeamScreen({
    organizationName,
    members,
    invitations,
    sites,
    canManage,
    moduleKeys,
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    sites: ReviewableSite[];
    canManage: boolean;
    /** `null` = availability unknown; every capability then reads as on. */
    moduleKeys: string[] | null;
}) {
    const [tab, setTab] = useState<"roles" | "people">("people");
    const [activeRole, setActiveRole] = useState<OrganizationRole>("MEMBER");
    const [editing, setEditing] = useState<OrganizationMember | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);

    // What each role reaches in THIS business: the rail's own filtering, so
    // the number can never disagree with what the rail shows that role.
    const reach = (role: NavRole) => {
        const count = (r: NavRole) =>
            navFor({ role: r, moduleKeys, sites: [] }).reduce(
                (n, g) => n + g.items.length,
                0,
            );
        return { reachable: count(role), total: count("OWNER") };
    };
    const peopleWith = (role: OrganizationRole) =>
        members.filter((m) => m.role === role).length;

    const tabs = [
        { id: "roles" as const, label: "Roles", count: ROLES.length },
        { id: "people" as const, label: "People", count: members.length },
    ];

    return (
        <div className="space-y-[18px]">
            <PageHeader
                breadcrumb={["Workspace", "Team"]}
                title="Team"
                description="Who can reach this business, and what each role may open."
                className="mb-5"
                actions={
                    canManage ? (
                        <Button onClick={() => setInviteOpen(true)}>
                            <Plus className="mr-1.5 size-4" />
                            Invite to {organizationName}
                        </Button>
                    ) : undefined
                }
            />
            <div className="flex items-end gap-3 border-b border-border">
                <div role="group" aria-label="View" className="flex gap-0.5">
                    {tabs.map((t) => {
                        const on = t.id === tab;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    "flex items-center gap-2 rounded-t-md px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                    on
                                        ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                        : "font-medium text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {t.label}
                                <span
                                    className={cn(
                                        "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                        on
                                            ? "bg-muted text-foreground"
                                            : "bg-foreground/[0.04] text-muted-foreground",
                                    )}
                                >
                                    {t.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {tab === "roles" ? (
                <RolesTab
                    activeRole={activeRole}
                    onPick={setActiveRole}
                    reach={reach}
                    peopleWith={peopleWith}
                    moduleKeys={moduleKeys}
                    members={members}
                />
            ) : members.length <= 1 && invitations.length === 0 ? (
                <div className="flex flex-col items-center gap-[9px] rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
                    <Users
                        aria-hidden
                        className="size-8 stroke-[1.7] text-muted-foreground"
                    />
                    <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                        No one else yet
                    </p>
                    <p className="max-w-[46ch] text-[13.5px] leading-[1.55] text-muted-foreground">
                        You are the only person in {organizationName} so far. An
                        invitation adds someone to this business only — it gives
                        them nothing in any other.
                    </p>
                    {canManage ? (
                        <Button
                            className="mt-1"
                            onClick={() => setInviteOpen(true)}
                        >
                            Invite someone
                        </Button>
                    ) : null}
                </div>
            ) : (
                <PeopleTab
                    organizationName={organizationName}
                    members={members}
                    invitations={invitations}
                    canManage={canManage}
                    onEdit={setEditing}
                />
            )}

            <MemberDrawer
                member={editing}
                members={members}
                organizationName={organizationName}
                reach={reach}
                onClose={() => setEditing(null)}
            />
            {canManage ? (
                <InviteDialog
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    organizationName={organizationName}
                    sites={sites}
                />
            ) : null}
        </div>
    );
}

/* ─── Roles ─────────────────────────────────────────────────────────────── */

function RolesTab({
    activeRole,
    onPick,
    reach,
    peopleWith,
    moduleKeys,
    members,
}: {
    activeRole: OrganizationRole;
    onPick: (role: OrganizationRole) => void;
    reach: (role: NavRole) => { reachable: number; total: number };
    peopleWith: (role: OrganizationRole) => number;
    moduleKeys: string[] | null;
    members: OrganizationMember[];
}) {
    const activeReach = reach(activeRole);
    const capOn = (needs?: string) =>
        !needs || moduleKeys === null || moduleKeys.includes(needs);

    return (
        <div className="flex flex-wrap items-start gap-5">
            {/* The four roles. Selecting one is choosing what the panel explains,
                so the chosen row takes Saffron 50 and the 2px marker. */}
            <div className="min-w-0 max-w-[300px] flex-[0_1_262px] overflow-hidden rounded-xl border border-border">
                <p className="border-b border-muted px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Roles
                </p>
                {ROLES.map((role) => {
                    const on = role === activeRole;
                    const n = peopleWith(role);
                    const r = reach(role);
                    return (
                        <button
                            key={role}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onPick(role)}
                            className={cn(
                                "flex w-full items-center gap-[11px] border-t border-border px-[15px] py-2.5 text-left transition-colors duration-fast first-of-type:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                on
                                    ? "bg-brand-subtle shadow-[inset_2px_0_0_hsl(var(--highlight))]"
                                    : "hover:bg-foreground/[0.035]",
                            )}
                        >
                            <RoleDot role={role} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium">
                                    {ROLE_LABEL[role]}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                    {n === 1 ? "1 person" : `${n} people`} ·
                                    reaches {r.reachable} of {r.total}
                                </span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                {role}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="min-w-0 flex-[1_1_420px] overflow-hidden rounded-xl border border-border">
                <div className="border-b border-muted px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-[11px]">
                        <RoleDot role={activeRole} size={13} />
                        <h2 className="font-display text-[18px] font-semibold tracking-[-0.025em]">
                            {ROLE_LABEL[activeRole]}
                        </h2>
                        <span className="rounded-full bg-muted px-2 py-[3px] font-mono text-[11px] text-neutral-700 dark:text-muted-foreground">
                            {activeRole}
                        </span>
                        <span className="ml-auto rounded-full bg-muted px-[9px] py-[3px] text-[11px] font-medium text-neutral-600 dark:text-muted-foreground">
                            Fixed today
                        </span>
                    </div>
                    <p className="mt-[9px] text-[12.5px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                        {ROLE_BLURB[activeRole]}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="mr-[3px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Ring
                        </span>
                        <RoleDot role={activeRole} size={22} />
                        <span className="text-[12px] text-neutral-600 dark:text-muted-foreground">
                            {ROLE_LABEL[activeRole]} wears the{" "}
                            {ROLE_RING[activeRole]} ring.
                        </span>
                    </div>
                    <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground">
                        A ring only reinforces — the role name is always beside
                        it in words, so nothing depends on telling two colours
                        apart.
                    </p>
                    {/* Every ring is a pair: on Ink the dark cut is used,
                        because ink on ink is invisible. `dark` scopes the
                        tokens, so this strip shows the real dark rings. */}
                    <div className="dark mt-[11px] rounded-[10px] bg-[hsl(var(--background))] px-[13px] py-[11px] text-foreground">
                        <p className="mb-[9px] text-[11.5px] leading-[1.5] text-muted-foreground">
                            The same rings on a dark ground:
                        </p>
                        <div className="flex flex-wrap gap-[9px]">
                            {ROLES.map((role) => {
                                const person = members.find(
                                    (m) => m.role === role,
                                );
                                const tone = roleRingTone(role);
                                return (
                                    <Avatar
                                        key={role}
                                        size="row"
                                        ringTone={tone}
                                        className="bg-[#33332E] text-[#F5F2EC] [--card:60_5%_7%]"
                                        title={ROLE_LABEL[role]}
                                    >
                                        <AvatarFallback>
                                            {person
                                                ? avatarInitials(
                                                      person.name,
                                                      person.email,
                                                  )
                                                : ROLE_LABEL[role]
                                                      .slice(0, 2)
                                                      .toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="px-4 pb-3.5 pt-1.5">
                    <div className="grid grid-cols-[minmax(150px,1fr)_176px] items-center gap-3 pb-2 pt-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <span>This role can reach</span>
                        <span className="text-right">
                            {activeReach.reachable} of {activeReach.total} here
                        </span>
                    </div>
                    {REACH_ROWS.map((row) => {
                        const on = navRoleCan(activeRole, row.action);
                        const available = capOn(row.needs);
                        return (
                            <div
                                key={row.action}
                                className="grid grid-cols-[minmax(150px,1fr)_176px] items-center gap-3 border-t border-border py-[9px]"
                            >
                                <div className="min-w-0">
                                    <p className="text-[13px]">{row.label}</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        <span className="font-mono">
                                            {row.action}
                                        </span>
                                        {row.note ? ` · ${row.note}` : null}
                                    </p>
                                </div>
                                {available ? (
                                    <LockedSwitch
                                        on={on}
                                        label={`${row.label}, ${on ? "allowed" : "not allowed"}, fixed today`}
                                    />
                                ) : (
                                    <p className="flex h-8 items-center justify-end text-[12.5px] text-muted-foreground">
                                        Capability off
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="flex items-start gap-[9px] border-t border-muted bg-foreground/[0.03] px-4 py-[13px]">
                    <Info
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                        A role&apos;s reach is fixed today. The rail offers what
                        the role can open, and every destination still checks
                        access itself — typing an address gets the same answer.
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * A switch that shows a fixed state: on is Ink 400 rather than Ink, because it
 * cannot be flipped, and it announces itself as disabled rather than as a
 * control that does nothing.
 */
function LockedSwitch({ on, label }: { on: boolean; label: string }) {
    return (
        <div
            role="switch"
            aria-checked={on}
            aria-disabled
            aria-label={label}
            className="flex h-8 items-center justify-end gap-2.5"
        >
            <span
                className={cn(
                    "text-[12.5px]",
                    on ? "text-foreground" : "text-muted-foreground",
                )}
            >
                {on ? "Allowed" : "Not allowed"}
            </span>
            <span
                aria-hidden
                className={cn(
                    "relative h-6 w-[42px] shrink-0 rounded-full",
                    on ? "bg-input" : "bg-border",
                )}
            >
                <span
                    className={cn(
                        "absolute top-[3px] size-[18px] rounded-full bg-white",
                        on ? "left-[21px]" : "left-[3px]",
                    )}
                />
            </span>
        </div>
    );
}

/* ─── People ────────────────────────────────────────────────────────────── */

function PeopleTab({
    organizationName,
    members,
    invitations,
    canManage,
    onEdit,
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    canManage: boolean;
    onEdit: (member: OrganizationMember) => void;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    async function onWithdraw(invitation: OrganizationInvitation) {
        setBusy(invitation.id);
        const res = await revokeInvitation(invitation.id);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`The invitation to ${invitation.email} was withdrawn.`);
        router.refresh();
    }

    const grid =
        "grid grid-cols-[minmax(190px,1fr)_minmax(0,168px)_92px] items-center";

    return (
        <div className="space-y-3.5">
            <div className="overflow-hidden rounded-xl border border-border">
                <div
                    className={cn(
                        grid,
                        "h-[38px] border-b border-muted bg-foreground/[0.03] px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                    )}
                >
                    <span>Person</span>
                    <span>Role</span>
                    <span />
                </div>
                <ul>
                    {members.map((m) => (
                        <li
                            key={m.userId}
                            className={cn(
                                grid,
                                "border-b border-border px-4 py-[11px] transition-colors duration-fast last:border-b-0 hover:bg-foreground/[0.035]",
                            )}
                        >
                            <div className="flex min-w-0 items-center gap-[11px]">
                                <Avatar
                                    size="row"
                                    ringTone={roleRingTone(m.role)}
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
                                    </p>
                                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                        {m.email}
                                        {m.role === "REVIEWER"
                                            ? ` · ${m.siteIds.length} site${m.siteIds.length === 1 ? "" : "s"}`
                                            : ""}
                                    </p>
                                </div>
                            </div>
                            <div className="flex min-w-0 items-center gap-2">
                                <RoleDot role={m.role} size={9} />
                                <span className="truncate text-[13px]">
                                    {ROLE_LABEL[m.role]}
                                </span>
                            </div>
                            <div className="flex justify-end">
                                {canManage ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onEdit(m)}
                                        aria-label={`Edit ${nameOf(m)}’s role`}
                                    >
                                        Edit
                                    </Button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {canManage && invitations.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                    <p className="border-b border-muted bg-foreground/[0.03] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Invited, not yet joined
                    </p>
                    <ul>
                        {invitations.map((invitation) => (
                            <li
                                key={invitation.id}
                                className={cn(
                                    grid,
                                    "border-b border-border px-4 py-[11px] last:border-b-0",
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-[11px]">
                                    <Avatar
                                        size="row"
                                        ringTone={roleRingTone(invitation.role)}
                                    >
                                        <AvatarFallback>
                                            {avatarInitials(
                                                null,
                                                invitation.email,
                                            )}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate text-[13.5px] font-medium">
                                            {invitation.email}
                                        </p>
                                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                                            Expires{" "}
                                            <span className="font-mono">
                                                {new Date(
                                                    invitation.expiresAt,
                                                ).toLocaleDateString("en-GB")}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    <RoleDot role={invitation.role} size={9} />
                                    <span className="truncate text-[13px]">
                                        {ROLE_LABEL[invitation.role]}
                                    </span>
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy === invitation.id}
                                        onClick={() => onWithdraw(invitation)}
                                    >
                                        Withdraw
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="flex items-start gap-[9px] rounded-[10px] bg-foreground/[0.03] px-[15px] py-3">
                <Info
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                    A person&apos;s role sets what they can reach in{" "}
                    {organizationName}. Leaving this business touches nothing in
                    any other.
                </p>
            </div>
        </div>
    );
}

/* ─── The member drawer ─────────────────────────────────────────────────── */

function MemberDrawer({
    member,
    members,
    organizationName,
    reach,
    onClose,
}: {
    member: OrganizationMember | null;
    members: OrganizationMember[];
    organizationName: string;
    reach: (role: NavRole) => { reachable: number; total: number };
    onClose: () => void;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<OrganizationRole | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const role = draft ?? member?.role ?? "MEMBER";
    const owners = members.filter((m) => m.role === "OWNER").length;
    // The workspace keeps an owner: the last one cannot be changed or removed.
    const lastOwner = member?.role === "OWNER" && owners === 1;
    const changed = !!member && role !== member.role;

    function close() {
        setDraft(null);
        onClose();
    }

    async function save() {
        if (!member || !changed) return;
        // A reviewer holds named sites; making someone one needs sites they
        // already have, or a fresh reviewer invitation.
        if (role === "REVIEWER" && member.siteIds.length === 0) {
            showError(
                "Invite them as a reviewer, with the sites they may review, before making them one.",
            );
            return;
        }
        setSaving(true);
        const res = await updateMemberRole(member.userId, {
            role,
            ...(role === "REVIEWER" ? { siteIds: member.siteIds } : {}),
        });
        setSaving(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            `${nameOf(member)} is now ${ROLE_LABEL[role]} in ${organizationName}.`,
        );
        close();
        router.refresh();
    }

    async function remove() {
        if (!member) return;
        setSaving(true);
        const res = await removeMember(member.userId);
        setSaving(false);
        setConfirmRemove(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            res.data.revokedLinks > 0
                ? `${member.email} was removed, and ${res.data.revokedLinks} share link${res.data.revokedLinks === 1 ? "" : "s"} they made stopped working.`
                : `${member.email} was removed from ${organizationName}.`,
        );
        close();
        router.refresh();
    }

    return (
        <>
            <Sheet
                open={!!member}
                onOpenChange={(open) => {
                    if (!open) close();
                }}
            >
                <SheetContent
                    side="right"
                    className="flex w-[396px] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[396px]"
                >
                    {member ? (
                        <>
                            <div className="flex items-center gap-[11px] border-b border-muted px-[18px] py-4 pr-12">
                                <Avatar
                                    size="panel"
                                    ringTone={roleRingTone(role)}
                                >
                                    <AvatarFallback>
                                        {avatarInitials(
                                            member.name,
                                            member.email,
                                        )}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <SheetTitle className="font-display text-[17px] font-semibold tracking-[-0.025em]">
                                        {nameOf(member)}
                                    </SheetTitle>
                                    <SheetDescription className="mt-0.5 truncate text-[11.5px]">
                                        {member.email}
                                    </SheetDescription>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-[18px]">
                                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                    Role in {organizationName}
                                </p>
                                <div
                                    role="radiogroup"
                                    aria-label="Role"
                                    className="flex flex-col gap-[5px]"
                                >
                                    {ROLES.map((r) => {
                                        const on = r === role;
                                        const rr = reach(r);
                                        return (
                                            <button
                                                key={r}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                disabled={lastOwner}
                                                onClick={() => setDraft(r)}
                                                className={cn(
                                                    "flex items-center gap-[11px] rounded-[9px] border px-3 py-[9px] text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                                                    on
                                                        ? "border-border-strong bg-foreground/[0.03]"
                                                        : "border-muted hover:border-border-strong",
                                                )}
                                            >
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
                                                        {ROLE_LABEL[r]}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                                        reaches {rr.reachable}{" "}
                                                        of {rr.total}{" "}
                                                        destinations here
                                                    </span>
                                                </span>
                                                {on ? (
                                                    <Check
                                                        aria-hidden
                                                        className="size-4 shrink-0"
                                                    />
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-4 flex items-start gap-[9px] rounded-[9px] bg-foreground/[0.03] px-[13px] py-[11px]">
                                    <Info
                                        aria-hidden
                                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                    />
                                    <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                                        {lastOwner
                                            ? `${organizationName} keeps at least one owner. Make someone else an owner before changing or removing this one.`
                                            : `${ROLE_LABEL[role]}: ${ROLE_BLURB[role]}`}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-[9px] border-t border-muted px-[18px] py-3.5">
                                <Button
                                    onClick={save}
                                    disabled={!changed || saving || lastOwner}
                                >
                                    {saving ? "Saving…" : "Save role"}
                                </Button>
                                <Button variant="outline" onClick={close}>
                                    Cancel
                                </Button>
                                {!lastOwner ? (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmRemove(true)}
                                        className="ml-auto rounded-md text-[12.5px] font-semibold text-destructive-subtle-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        Remove from {organizationName}
                                    </button>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>

            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title={`Remove ${member ? nameOf(member) : "them"} from ${organizationName}?`}
                description={`They lose access to ${organizationName} straight away, and any share links they made stop working. Their work stays. Nothing changes in their other businesses. This cannot be undone.`}
                confirmLabel="Remove from team"
                onConfirm={remove}
            />
        </>
    );
}

/* ─── Invite ────────────────────────────────────────────────────────────── */

/**
 * Quick create (brand file §12, A4): a modal of at most four fields, one
 * primary action, Cancel as ghost. An invitation names its business.
 */
function InviteDialog({
    open,
    onOpenChange,
    organizationName,
    sites,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationName: string;
    sites: ReviewableSite[];
}) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<OrganizationRole>("MEMBER");
    const [siteIds, setSiteIds] = useState<string[]>([]);
    const [sending, setSending] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        const res = await inviteMember({
            email: email.trim(),
            role,
            ...(role === "REVIEWER" ? { siteIds } : {}),
        });
        setSending(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            `Invitation sent to ${res.data.email}. It adds them to ${organizationName} only.`,
        );
        setEmail("");
        setSiteIds([]);
        onOpenChange(false);
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[440px]">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                            Invite to {organizationName}
                        </DialogTitle>
                        <DialogDescription>
                            They get an email with a link that adds them to this
                            business only.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-2">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="them@example.com"
                            required
                            disabled={sending}
                        />
                    </div>

                    <fieldset className="grid gap-2">
                        <legend className="mb-2 text-sm font-medium">
                            Role
                        </legend>
                        <div className="grid grid-cols-2 gap-[5px]">
                            {ROLES.map((r) => {
                                const on = r === role;
                                return (
                                    <label
                                        key={r}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-2 text-[13px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                                            on
                                                ? "border-border-strong bg-foreground/[0.03] font-semibold"
                                                : "border-muted font-medium hover:border-border-strong",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="invite-role"
                                            value={r}
                                            checked={on}
                                            onChange={() => setRole(r)}
                                            className="sr-only"
                                        />
                                        <RoleDot role={r} />
                                        {ROLE_LABEL[r]}
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                            {ROLE_BLURB[role]}
                        </p>
                    </fieldset>

                    {role === "REVIEWER" ? (
                        <fieldset className="grid gap-2">
                            <legend className="mb-2 text-sm font-medium">
                                Websites they may review
                            </legend>
                            {sites.length === 0 ? (
                                <p className="text-[12.5px] text-muted-foreground">
                                    You have no websites yet. Make one first,
                                    then invite someone to review it.
                                </p>
                            ) : (
                                sites.map((site) => (
                                    <label
                                        key={site.id}
                                        className="flex items-center gap-2 text-[13px]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={siteIds.includes(site.id)}
                                            onChange={() =>
                                                setSiteIds((current) =>
                                                    current.includes(site.id)
                                                        ? current.filter(
                                                              (s) =>
                                                                  s !== site.id,
                                                          )
                                                        : [...current, site.id],
                                                )
                                            }
                                            disabled={sending}
                                            className="size-4 rounded-[4px] border-border-strong"
                                        />
                                        {site.name}
                                    </label>
                                ))
                            )}
                        </fieldset>
                    ) : null}

                    <DialogFooter className="gap-2 sm:justify-start">
                        <Button type="submit" disabled={sending}>
                            {sending ? "Sending…" : "Send invitation"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
