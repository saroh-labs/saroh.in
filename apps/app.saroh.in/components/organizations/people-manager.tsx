"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

/**
 * What each role means, in the words a small business would use. A select full
 * of shouted enum names tells an owner nothing about who they are letting in.
 */
const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

const ROLE_MEANING: Record<OrganizationRole, string> = {
    OWNER: "Everything, including closing the workspace.",
    ADMIN: "Everything day to day, except closing the workspace.",
    MEMBER: "Can look around, but changes nothing.",
    REVIEWER: "Reads and comments on the sites you choose, and nothing else.",
};

export interface ReviewableSite {
    id: string;
    name: string;
}

/**
 * The workspace roster (#276).
 *
 * A Reviewer is invited to named sites, which is why this screen asks for them
 * rather than handing the role out workspace-wide: "reviewer" must not quietly
 * mean "reads every site this business has".
 */
export function PeopleManager({
    members,
    invitations,
    sites,
    canManage,
}: {
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    sites: ReviewableSite[];
    canManage: boolean;
}) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<OrganizationRole>("MEMBER");
    const [siteIds, setSiteIds] = useState<string[]>([]);
    const [inviting, setInviting] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(
        null,
    );

    const owners = members.filter((m) => m.role === "OWNER").length;

    async function onInvite(e: React.FormEvent) {
        e.preventDefault();
        setInviting(true);
        const res = await inviteMember({
            email: email.trim(),
            role,
            ...(role === "REVIEWER" ? { siteIds } : {}),
        });
        setInviting(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setEmail("");
        setSiteIds([]);
        showSuccess(`Invitation sent to ${res.data.email}.`);
        router.refresh();
    }

    async function onChangeRole(
        member: OrganizationMember,
        next: OrganizationRole,
    ) {
        // A reviewer must be given sites, and this row has none to offer until
        // the invite has been answered — keep them on the sites they hold.
        if (next === "REVIEWER" && member.siteIds.length === 0) {
            showError(
                "Invite them as a reviewer, or choose their sites, before making them one.",
            );
            return;
        }
        setBusy(member.userId);
        const res = await updateMemberRole(member.userId, {
            role: next,
            ...(next === "REVIEWER" ? { siteIds: member.siteIds } : {}),
        });
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`${member.email} is now ${ROLE_LABEL[next]}.`);
        router.refresh();
    }

    async function onRemove(member: OrganizationMember) {
        setBusy(member.userId);
        const res = await removeMember(member.userId);
        setBusy(null);
        setConfirmingRemoval(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            res.data.revokedLinks > 0
                ? `${member.email} was removed, and ${res.data.revokedLinks} share link${res.data.revokedLinks === 1 ? "" : "s"} they made stopped working.`
                : `${member.email} was removed.`,
        );
        router.refresh();
    }

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

    function toggleSite(id: string) {
        setSiteIds((current) =>
            current.includes(id)
                ? current.filter((s) => s !== id)
                : [...current, id],
        );
    }

    return (
        <div className="space-y-8">
            {canManage ? (
                <form
                    onSubmit={onInvite}
                    className="space-y-4 rounded-xl border p-4"
                >
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="grid min-w-[220px] flex-1 gap-2">
                            <Label htmlFor="invite-email">
                                Invite by email
                            </Label>
                            <Input
                                id="invite-email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="them@example.com"
                                required
                                disabled={inviting}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="invite-role">Role</Label>
                            <select
                                id="invite-role"
                                value={role}
                                onChange={(e) =>
                                    setRole(e.target.value as OrganizationRole)
                                }
                                disabled={inviting}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                        {ROLE_LABEL[r]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button
                            type="submit"
                            className="wk-press"
                            disabled={inviting}
                        >
                            {inviting ? "Sending…" : "Send invitation"}
                        </Button>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {ROLE_MEANING[role]}
                    </p>

                    {role === "REVIEWER" ? (
                        <fieldset className="grid gap-2 border-t pt-4">
                            <legend className="text-sm font-medium">
                                Sites they may review
                            </legend>
                            {sites.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    You have no sites yet. Make one first, then
                                    invite someone to review it.
                                </p>
                            ) : (
                                sites.map((site) => (
                                    <label
                                        key={site.id}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={siteIds.includes(site.id)}
                                            onChange={() => toggleSite(site.id)}
                                            disabled={inviting}
                                            className="size-4 rounded border-input"
                                        />
                                        {site.name}
                                    </label>
                                ))
                            )}
                        </fieldset>
                    ) : null}
                </form>
            ) : null}

            <section className="space-y-3">
                <h2 className="text-sm font-medium">In this workspace</h2>
                <ul className="divide-y rounded-xl border">
                    {members.map((m, i) => {
                        // The workspace must keep an owner: with one left, the
                        // controls that could remove them are not offered.
                        const lastOwner = m.role === "OWNER" && owners === 1;
                        return (
                            <li
                                key={m.userId}
                                style={{ "--wk-i": i } as React.CSSProperties}
                                className="wk-item flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {m.name && m.name.length > 0
                                            ? m.name
                                            : m.email}
                                        {m.isSelf ? (
                                            <span className="text-muted-foreground">
                                                {" "}
                                                — you
                                            </span>
                                        ) : null}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {m.email}
                                        {m.role === "REVIEWER"
                                            ? ` · ${m.siteIds.length} site${m.siteIds.length === 1 ? "" : "s"}`
                                            : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {canManage && !lastOwner ? (
                                        <select
                                            aria-label={`Role for ${m.email}`}
                                            value={m.role}
                                            disabled={busy === m.userId}
                                            onChange={(e) =>
                                                onChangeRole(
                                                    m,
                                                    e.target
                                                        .value as OrganizationRole,
                                                )
                                            }
                                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                        >
                                            {ROLES.map((r) => (
                                                <option key={r} value={r}>
                                                    {ROLE_LABEL[r]}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <Badge variant="secondary">
                                            {ROLE_LABEL[m.role]}
                                        </Badge>
                                    )}
                                    {canManage && !lastOwner ? (
                                        confirmingRemoval === m.userId ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={busy === m.userId}
                                                    onClick={() => onRemove(m)}
                                                >
                                                    Remove
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        setConfirmingRemoval(
                                                            null,
                                                        )
                                                    }
                                                >
                                                    Cancel
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    setConfirmingRemoval(
                                                        m.userId,
                                                    )
                                                }
                                            >
                                                Remove
                                            </Button>
                                        )
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {canManage && owners === 1 ? (
                    <p className="text-xs text-muted-foreground">
                        A workspace keeps at least one owner. Make someone else
                        an owner before changing or removing the current one.
                    </p>
                ) : null}
            </section>

            {canManage && invitations.length > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium">
                        Invited, not yet joined
                    </h2>
                    <ul className="divide-y rounded-xl border">
                        {invitations.map((invitation) => (
                            <li
                                key={invitation.id}
                                className="flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {invitation.email}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {ROLE_LABEL[invitation.role]} · expires{" "}
                                        {new Date(
                                            invitation.expiresAt,
                                        ).toLocaleDateString()}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy === invitation.id}
                                    onClick={() => onWithdraw(invitation)}
                                >
                                    Withdraw
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
