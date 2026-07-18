"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
    inviteMember,
    removeMember,
    revokeInvitation,
    updateMemberRole,
} from "@/lib/members/actions";
import type { Invitation, Member, MemberRole } from "@/lib/members/service";

const ROLES: MemberRole[] = ["ADMIN", "MANAGER", "EDITOR", "VIEWER"];

export function MembersManager({
    storeId,
    members,
    invitations,
    canManage,
}: {
    storeId: string;
    members: Member[];
    invitations: Invitation[];
    canManage: boolean;
}) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<MemberRole>("VIEWER");
    const [inviting, setInviting] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    async function onInvite(e: React.FormEvent) {
        e.preventDefault();
        setInviting(true);
        const res = await inviteMember(storeId, email.trim(), role);
        setInviting(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setEmail("");
        setRole("VIEWER");
        toast.success("Invitation sent");
        router.refresh();
    }

    async function onChangeRole(userId: string, next: MemberRole) {
        setBusy(userId);
        const res = await updateMemberRole(storeId, userId, next);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Role updated");
        router.refresh();
    }

    async function onRemove(userId: string) {
        setBusy(userId);
        const res = await removeMember(storeId, userId);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Member removed");
        router.refresh();
    }

    async function onRevoke(invitationId: string) {
        setBusy(invitationId);
        const res = await revokeInvitation(storeId, invitationId);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Invitation revoked");
        router.refresh();
    }

    return (
        <div className="space-y-8">
            {canManage && (
                <form
                    onSubmit={onInvite}
                    className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
                >
                    <div className="grid min-w-[200px] flex-1 gap-2">
                        <Label htmlFor="invite-email">Invite by email</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="teammate@example.com"
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
                                setRole(e.target.value as MemberRole)
                            }
                            disabled={inviting}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            {ROLES.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" disabled={inviting}>
                        {inviting ? "Sending…" : "Send invite"}
                    </Button>
                </form>
            )}

            <section className="space-y-3">
                <h3 className="text-sm font-medium">Team</h3>
                <ul className="divide-y rounded-lg border">
                    {members.map((m) => (
                        <li
                            key={`${m.kind}-${m.userId}`}
                            className="flex flex-wrap items-center justify-between gap-3 p-3"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    {m.name && m.name.length > 0
                                        ? m.name
                                        : m.email}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {m.email}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {m.kind === "owner" ? (
                                    <Badge variant="secondary">
                                        {m.role === "OWNER" ? "Owner" : m.role}
                                    </Badge>
                                ) : canManage ? (
                                    <>
                                        <select
                                            aria-label={`Role for ${m.email}`}
                                            value={m.role}
                                            disabled={busy === m.userId}
                                            onChange={(e) =>
                                                onChangeRole(
                                                    m.userId,
                                                    e.target
                                                        .value as MemberRole,
                                                )
                                            }
                                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                        >
                                            {ROLES.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy === m.userId}
                                            onClick={() => onRemove(m.userId)}
                                        >
                                            Remove
                                        </Button>
                                    </>
                                ) : (
                                    <Badge variant="secondary">{m.role}</Badge>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {canManage && invitations.length > 0 && (
                <section className="space-y-3">
                    <h3 className="text-sm font-medium">Pending invitations</h3>
                    <ul className="divide-y rounded-lg border">
                        {invitations.map((inv) => (
                            <li
                                key={inv.id}
                                className="flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {inv.email}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Invited as {inv.role}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === inv.id}
                                    onClick={() => onRevoke(inv.id)}
                                >
                                    Revoke
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
