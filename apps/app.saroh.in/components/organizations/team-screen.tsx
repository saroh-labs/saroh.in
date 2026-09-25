"use client";

import { SettingsPanelHeader } from "@/components/settings/settings-panel";
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
import { navFor } from "@/components/shared/nav-items";
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

import { RolesTab } from "./roles-tab";

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
    /** How many destinations the rail offers this role here. */
    reachOf: (key: string) => { reachable: number; total: number };
    /**
     * False when the role can do something the viewer cannot. The API refuses
     * to hand out, change or remove such a role; the screen says so first.
     */
    withinReach: (key: string) => boolean;
}

function isBuiltIn(key: string): key is OrganizationRole {
    return (ROLES as readonly string[]).includes(key);
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
    moduleKeys,
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
    /** `null` = availability unknown; every capability then reads as on. */
    moduleKeys: string[] | null;
}) {
    const [tab, setTab] = useState<"roles" | "people">("people");
    const [editing, setEditing] = useState<OrganizationMember | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);

    const byKey = new Map(roles.map((r) => [r.key, r]));
    // What a role reaches in THIS business: the rail's own filtering, fed the
    // role's own permissions, so the number can never disagree with what the
    // rail shows the people who hold it.
    const countNav = (key: string) =>
        navFor({
            role: isBuiltIn(key) ? key : "MEMBER",
            actions: byKey.get(key)?.actions ?? null,
            moduleKeys,
            sites: [],
        }).reduce((n, g) => n + g.items.length, 0);
    const book: RoleBook = {
        all: roles,
        labelOf: (key) =>
            byKey.get(key)?.label ?? (isBuiltIn(key) ? ROLE_LABEL[key] : key),
        blurbOf: (key) => {
            if (isBuiltIn(key)) return ROLE_BLURB[key];
            const n = byKey.get(key)?.actions.length ?? 0;
            return `Made for ${organizationName}. Whoever holds it can do exactly what was ticked for it — ${n === 1 ? "1 permission" : `${n} permissions`}.`;
        },
        reachOf: (key) => ({
            reachable: countNav(key),
            total: countNav("OWNER"),
        }),
        withinReach: (key) => {
            const role = byKey.get(key);
            // Unknown role or unknown viewer: let the API decide, it will.
            if (!role || myActions === null) return true;
            return role.actions.every((a) => myActions.includes(a));
        },
    };

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
                    description={`Everyone in ${organizationName} and what each role can open. It is business-wide — a role isn't held in one shop.`}
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
                                        ringTone={roleRingTone(
                                            invitation.roleKey ??
                                                invitation.role,
                                        )}
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
                                    <RoleDot
                                        role={
                                            invitation.roleKey ??
                                            invitation.role
                                        }
                                        size={9}
                                    />
                                    <span className="truncate text-[13px]">
                                        {book.labelOf(
                                            invitation.roleKey ??
                                                invitation.role,
                                        )}
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
                                        const rr = book.reachOf(r);
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
                                                            : `reaches ${rr.reachable} of ${rr.total} destinations here`}
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
 * Quick create (brand file §12, A4): a modal of at most four fields, one
 * primary action, Cancel as ghost. An invitation names its business.
 */
function InviteDialog({
    open,
    onOpenChange,
    organizationName,
    sites,
    book,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationName: string;
    sites: ReviewableSite[];
    book: RoleBook;
}) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<string>("MEMBER");
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
                            {book.all.map(({ key: r }) => {
                                const on = r === role;
                                // Not offered: the API refuses to invite
                                // anyone at a role that can do more than the
                                // person inviting.
                                const beyond = !book.withinReach(r);
                                return (
                                    <label
                                        key={r}
                                        title={
                                            beyond
                                                ? "Can do more than you can"
                                                : undefined
                                        }
                                        className={cn(
                                            "flex items-center gap-2 rounded-[9px] border px-3 py-2 text-[13px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                                            beyond
                                                ? "cursor-not-allowed border-muted font-medium opacity-50"
                                                : on
                                                  ? "cursor-pointer border-border-strong bg-foreground/[0.03] font-semibold"
                                                  : "cursor-pointer border-muted font-medium hover:border-border-strong",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="invite-role"
                                            value={r}
                                            checked={on}
                                            disabled={beyond}
                                            onChange={() => setRole(r)}
                                            className="sr-only"
                                        />
                                        <RoleDot role={r} />
                                        <span className="truncate">
                                            {book.labelOf(r)}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                            {book.blurbOf(role)}
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
