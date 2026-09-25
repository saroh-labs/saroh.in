"use client";

import { SettingsPanelHeader } from "@/components/settings/settings-panel";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, Info, Mail, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { InviteValues } from "@/lib/organizations/invitations";
import { invitationMeta, inviteSchema } from "@/lib/organizations/invitations";
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
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { OrganizationRole } from "@/lib/organizations/service";
import { TEAM_TAB_PARAM } from "@/lib/settings/search";

import { RolesTab } from "./roles-tab";

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
 * have several owners and never none; an admin lacks only closing the
 * business, so cannot change or remove an owner either; a member reads the
 * day and moves kitchen orders, and sees no money.
 */
const ROLE_BLURB: Record<OrganizationRole, string> = {
    OWNER: "Can open and change everything. A business always has at least one owner, so it can never be locked out.",
    ADMIN: "Can do everything an owner can, except close the business or change or remove an owner.",
    MEMBER: "Sees the day — bookings, contacts and the team — and moves kitchen orders along. Sees no money and can't change settings.",
    REVIEWER:
        "Can look at the websites they're invited to, comment and sign them off. Nothing else in the business.",
};

/** The same, in a few words, under a role's name wherever one is picked. */
const ROLE_PLAIN: Record<OrganizationRole, string> = {
    OWNER: "can open everything",
    ADMIN: "everything except removing an owner",
    MEMBER: "sees the day — no money or settings",
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
}

function isBuiltIn(key: string): key is OrganizationRole {
    return (ROLES as readonly string[]).includes(key);
}

/** The Team screen's two views, as `?view=` names them. */
const TEAM_TABS = ["roles", "people"] as const;

/**
 * Team (Settings → People), after the "Saroh Team Roles" design.
 *
 * Two tabs over one business. ROLES explains the four roles — who holds each,
 * what it opens, and the ring that marks it. PEOPLE is the roster: a
 * neutral monogram ringed in the role's colour, the role in words beside a
 * dot of the same colour, and an Edit drawer that changes the role or removes
 * the person.
 *
 * Team is business-scoped: there is no storefront anywhere on this screen. A
 * role is held in a business and covers everything that business has, and an
 * invitation adds someone to this business only.
 *
 * Roles a business invents live in `RolesTab`, backed by the API's own
 * catalogue. Still not built, because nothing backs them yet: choosing a
 * role's ring colour (the avatar has one token per built-in, so invented roles
 * wear a neutral ring), and per-person extra permissions.
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
}) {
    // In the address, so Search settings can open Roles.
    const [tab, setTab] = useTabParam(TEAM_TAB_PARAM, TEAM_TABS, "people");
    const [editing, setEditing] = useState<OrganizationMember | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);

    const byKey = new Map(roles.map((r) => [r.key, r]));
    const book: RoleBook = {
        all: roles,
        labelOf: (key) =>
            byKey.get(key)?.label ?? (isBuiltIn(key) ? ROLE_LABEL[key] : key),
        blurbOf: (key) => {
            if (isBuiltIn(key)) return ROLE_BLURB[key];
            const n = byKey.get(key)?.actions.length ?? 0;
            return `Made for ${organizationName}. Whoever holds it can do exactly what was ticked for it — ${n === 1 ? "1 permission" : `${n} permissions`}.`;
        },
        plainOf: (key) => {
            if (isBuiltIn(key)) return ROLE_PLAIN[key];
            const n = byKey.get(key)?.actions.length ?? 0;
            return n === 1 ? "1 permission" : `${n} permissions`;
        },
        withinReach: (key) => {
            const role = byKey.get(key);
            // Unknown role or unknown viewer: let the API decide, it will.
            if (!role || myActions === null) return true;
            return role.actions.every((a) => myActions.includes(a));
        },
    };

    // For someone who may look but not change: who can, and who to ask.
    const ownerFirstName = members
        .find((m) => (m.roleKey ?? m.role) === "OWNER" && m.name?.trim())
        ?.name?.trim()
        .split(/\s+/)[0];
    const readOnlyNote = canManage
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
                            <Button onClick={() => setInviteOpen(true)}>
                                <Plus className="mr-1.5 size-4" />
                                Invite someone
                            </Button>
                        ) : undefined
                    }
                    readOnlyNote={readOnlyNote}
                />
                <div className="flex items-end gap-3 border-b border-border">
                    <div
                        role="group"
                        aria-label="View"
                        className="flex gap-0.5"
                    >
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
            </div>

            {tab === "roles" ? (
                <RolesTab
                    roles={roles}
                    catalogue={catalogue}
                    canEdit={canEditRoles}
                    organizationName={organizationName}
                    builtInBlurb={ROLE_BLURB}
                    builtInPlain={ROLE_PLAIN}
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
                    book={book}
                    onEdit={setEditing}
                />
            )}

            <MemberDrawer
                member={editing}
                members={members}
                organizationName={organizationName}
                book={book}
                onClose={() => setEditing(null)}
            />
            {canManage ? (
                <InviteDialog
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    organizationName={organizationName}
                    sites={sites}
                    book={book}
                    members={members}
                    invitations={invitations}
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
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    canManage: boolean;
    book: RoleBook;
    onEdit: (member: OrganizationMember) => void;
}) {
    const grid =
        "grid grid-cols-[minmax(190px,1fr)_minmax(0,168px)_92px] items-center";

    return (
        <div className="space-y-3.5">
            {canManage && invitations.length > 0 ? (
                <PendingInvites invitations={invitations} book={book} />
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border">
                <div
                    className={cn(
                        grid,
                        "h-[38px] border-b border-muted bg-foreground/[0.03] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
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
                                    ringTone={roleRingTone(m.roleKey ?? m.role)}
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
                                <RoleDot role={m.roleKey ?? m.role} size={9} />
                                <span className="truncate text-[13px]">
                                    {book.labelOf(m.roleKey ?? m.role)}
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

/**
 * Invitations sent and not yet answered, above the roster. Hidden when there
 * are none — an empty "not joined yet" box says nothing.
 *
 * Resend is the API's own re-invite: inviting an address that already has an
 * invitation refreshes it in place — a new link, a fresh week, a new email —
 * and the old link stops working. Cancel withdraws it for good; there is no
 * undo, because the link it voided cannot be revived, only replaced.
 */
function PendingInvites({
    invitations,
    book,
}: {
    invitations: OrganizationInvitation[];
    book: RoleBook;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<{
        id: string;
        action: "resend" | "cancel";
    } | null>(null);

    async function resend(invitation: OrganizationInvitation) {
        const role = invitation.roleKey ?? invitation.role;
        setBusy({ id: invitation.id, action: "resend" });
        const res = await inviteMember({
            email: invitation.email,
            role,
            ...(role === "REVIEWER" ? { siteIds: invitation.siteIds } : {}),
        });
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`Invite sent again to ${invitation.email}.`);
        router.refresh();
    }

    async function cancel(invitation: OrganizationInvitation) {
        setBusy({ id: invitation.id, action: "cancel" });
        const res = await revokeInvitation(invitation.id);
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            `Invite to ${invitation.email} cancelled — the link no longer works.`,
        );
        router.refresh();
    }

    return (
        <section
            aria-label="Invited, not joined yet"
            className="overflow-hidden rounded-xl border border-border"
        >
            <p className="flex h-[38px] items-center border-b border-muted bg-foreground/[0.03] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Invited · not joined yet
            </p>
            <ul>
                {invitations.map((invitation, i) => {
                    const role = invitation.roleKey ?? invitation.role;
                    const mine = busy?.id === invitation.id;
                    // The API refuses to re-invite at a role that can do more
                    // than the person sending it.
                    const beyond = !book.withinReach(role);
                    return (
                        <li
                            key={invitation.id}
                            className={cn(
                                "flex flex-wrap items-center gap-3 px-4 py-[11px]",
                                i > 0 && "border-t border-border",
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
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {invitationMeta(invitation)}
                                </p>
                            </div>
                            <span className="text-[12.5px] text-foreground/80">
                                {book.labelOf(role)}
                            </span>
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!busy || beyond}
                                    title={
                                        beyond
                                            ? "Can do more than you can"
                                            : undefined
                                    }
                                    onClick={() => resend(invitation)}
                                    aria-label={`Resend the invite to ${invitation.email}`}
                                >
                                    {mine && busy.action === "resend"
                                        ? "Sending…"
                                        : "Resend"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!busy}
                                    onClick={() => cancel(invitation)}
                                    aria-label={`Cancel the invite to ${invitation.email}`}
                                    className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                                >
                                    {mine && busy.action === "cancel"
                                        ? "Cancelling…"
                                        : "Cancel invite"}
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
    onClose,
}: {
    member: OrganizationMember | null;
    members: OrganizationMember[];
    organizationName: string;
    book: RoleBook;
    onClose: () => void;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const current = member ? (member.roleKey ?? member.role) : "MEMBER";
    const role = draft ?? current;
    const owners = members.filter(
        (m) => (m.roleKey ?? m.role) === "OWNER",
    ).length;
    // The workspace keeps an owner: the last one cannot be changed or removed.
    const lastOwner = current === "OWNER" && owners === 1;
    // Someone who can do more than the viewer cannot be changed by them — the
    // API refuses it, so the drawer says so instead of offering the attempt.
    const outranks = !!member && !book.withinReach(current);
    const locked = lastOwner || outranks;
    const changed = !!member && role !== current;

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
            `${nameOf(member)} is now ${book.labelOf(role)} in ${organizationName}.`,
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
                                    {book.all.map(({ key: r }) => {
                                        const on = r === role;
                                        const beyond = !book.withinReach(r);
                                        return (
                                            <button
                                                key={r}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                disabled={locked || beyond}
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
                                            : outranks
                                              ? `${nameOf(member)} can do more than you can here, so you cannot change their role or remove them.`
                                              : `${book.labelOf(role)}: ${book.blurbOf(role)}`}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-[9px] border-t border-muted px-[18px] py-3.5">
                                <Button
                                    onClick={save}
                                    disabled={!changed || saving || locked}
                                >
                                    {saving ? "Saving…" : "Save role"}
                                </Button>
                                <Button variant="outline" onClick={close}>
                                    Cancel
                                </Button>
                                {!locked ? (
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
 * "Invite to <business>" ("Saroh Settings" design): an email, a role picked
 * from a list that says what each one is for, Cancel and Send invite.
 *
 * Owner is not offered — the design invites people to run the day, and a
 * second owner is made from the Edit drawer once they have joined. Roles the
 * business invented are offered beside the built-ins; one that can do more
 * than the person inviting is shown and disabled, because the API refuses it.
 */
function InviteDialog({
    open,
    onOpenChange,
    organizationName,
    sites,
    book,
    members,
    invitations,
    onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationName: string;
    sites: ReviewableSite[];
    book: RoleBook;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    onSent: () => void;
}) {
    const router = useRouter();
    const schema = inviteSchema({
        memberEmails: members.map((m) => m.email),
        invitedEmails: invitations.map((i) => i.email),
    });
    const form = useForm<InviteValues>({
        resolver: zodResolver(schema),
        defaultValues: { email: "", role: "MEMBER", siteIds: [] },
        mode: "onTouched",
    });
    const sending = form.formState.isSubmitting;
    const role = useWatch({ control: form.control, name: "role" });
    const offered = book.all.filter((r) => r.key !== "OWNER");

    function setOpen(next: boolean) {
        if (!next) form.reset();
        onOpenChange(next);
    }

    async function submit(values: InviteValues) {
        const res = await inviteMember({
            email: values.email.trim().toLowerCase(),
            role: values.role,
            ...(values.role === "REVIEWER" ? { siteIds: values.siteIds } : {}),
        });
        if (!res.ok) {
            // A refusal about the address ("already in this workspace") goes
            // on the field; anything else is a toast.
            if (res.field === "email") {
                form.setError("email", { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess(
            `Invite sent to ${res.data.email} — they join as ${book.labelOf(values.role)}.`,
        );
        setOpen(false);
        onSent();
        router.refresh();
    }

    const errorText =
        "text-[12.5px] font-normal text-destructive-subtle-foreground";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0 sm:rounded-[14px]">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(submit)} noValidate>
                        <DialogHeader className="space-y-1 px-[22px] pb-1 pt-[18px] text-left">
                            <DialogTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                                Invite to {organizationName}
                            </DialogTitle>
                            <DialogDescription className="text-[13px]">
                                They get an email with a link. It adds them to
                                this business only.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid max-h-[60vh] gap-3.5 overflow-y-auto px-[22px] py-3.5">
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
                                                className="h-[38px] rounded-[9px] text-[13.5px] aria-[invalid=true]:border-destructive-subtle-foreground"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage
                                            role="alert"
                                            className={errorText}
                                        />
                                    </FormItem>
                                )}
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
                                        <div
                                            role="radiogroup"
                                            aria-labelledby="invite-role-label"
                                            className="grid gap-1.5"
                                        >
                                            {offered.map(({ key: r }) => (
                                                <RoleChoice
                                                    key={r}
                                                    name={field.name}
                                                    value={r}
                                                    label={book.labelOf(r)}
                                                    blurb={book.blurbOf(r)}
                                                    checked={r === field.value}
                                                    // The API refuses to
                                                    // invite anyone at a role
                                                    // that can do more than
                                                    // the inviter.
                                                    beyond={
                                                        !book.withinReach(r)
                                                    }
                                                    disabled={sending}
                                                    onPick={() =>
                                                        field.onChange(r)
                                                    }
                                                />
                                            ))}
                                        </div>
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
                                                    You have no websites yet.
                                                    Make one first, then invite
                                                    someone to review it.
                                                </p>
                                            ) : (
                                                sites.map((site) => {
                                                    const on =
                                                        field.value.includes(
                                                            site.id,
                                                        );
                                                    return (
                                                        <label
                                                            key={site.id}
                                                            className="flex items-center gap-2 text-[13px]"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={on}
                                                                onChange={() =>
                                                                    field.onChange(
                                                                        on
                                                                            ? field.value.filter(
                                                                                  (
                                                                                      s,
                                                                                  ) =>
                                                                                      s !==
                                                                                      site.id,
                                                                              )
                                                                            : [
                                                                                  ...field.value,
                                                                                  site.id,
                                                                              ],
                                                                    )
                                                                }
                                                                disabled={
                                                                    sending
                                                                }
                                                                className="size-4 rounded-[4px] border-border-strong"
                                                            />
                                                            {site.name}
                                                        </label>
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
                        </div>

                        <DialogFooter className="gap-2 border-t border-muted bg-foreground/[0.03] px-[22px] py-3 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={sending}>
                                {sending ? "Sending…" : "Send invite"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

/** One role in the invite's list: its name, and what it is for. */
function RoleChoice({
    name,
    value,
    label,
    blurb,
    checked,
    beyond,
    disabled,
    onPick,
}: {
    name: string;
    value: string;
    label: string;
    blurb: string;
    checked: boolean;
    beyond: boolean;
    disabled: boolean;
    onPick: () => void;
}) {
    return (
        <label
            title={beyond ? "Can do more than you can" : undefined}
            className={cn(
                "block rounded-[9px] border px-3 py-[9px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                beyond
                    ? "cursor-not-allowed border-border opacity-50"
                    : checked
                      ? "cursor-pointer border-foreground bg-foreground/[0.03] shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                      : "cursor-pointer border-border bg-card hover:border-border-strong",
            )}
        >
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                disabled={beyond || disabled}
                onChange={onPick}
                className="sr-only"
            />
            <span className="block text-[13.5px] font-semibold">{label}</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {blurb}
            </span>
        </label>
    );
}
