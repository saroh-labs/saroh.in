"use client";

import { useBusinessZone } from "@/components/shared/business-zone";
import { listTable } from "@/components/shared/list-toolbar";
import { useHold } from "@/components/shared/use-hold";
import { invitationMeta } from "@/lib/organizations/invitations";
import {
    inviteMember,
    revokeInvitation,
} from "@/lib/organizations/member-actions";
import type { OrganizationInvitation } from "@/lib/organizations/members";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Tip } from "@saroh/ui/tooltip";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RoleBook } from "./role-book";

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
export function PendingInvites({
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
