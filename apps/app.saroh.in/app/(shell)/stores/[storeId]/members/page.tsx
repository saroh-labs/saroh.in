import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { MembersManager } from "@/components/stores/members-manager";
import { listInvitations, listMembers } from "@/lib/members/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

/**
 * Members section. Owner-gated like the rest of the per-store shell. Loads the
 * team + pending invitations from api and hands them to the client manager.
 * `canManage` is true only when the signed-in user is an owner — non-owner
 * members see the roster read-only.
 */
export default async function StoreMembersPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    const session = await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [members, invitations] = await Promise.all([
        listMembers(storeId),
        listInvitations(storeId),
    ]);

    const canManage = members.some(
        (m) => m.kind === "owner" && m.userId === session.user.id,
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Members"
                description="Invite teammates and manage their access to this store."
            />
            <MembersManager
                storeId={storeId}
                members={members}
                invitations={invitations}
                canManage={canManage}
            />
        </div>
    );
}
