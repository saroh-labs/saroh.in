"use client";

import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { count } from "@/lib/format/plural";
import { removeMember } from "@/lib/organizations/member-actions";
import type { OrganizationMember } from "@/lib/organizations/members";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { nameOf } from "./role-book";

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
export function RemoveMember({
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
