import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import { MembersManager } from "@/components/stores/members-manager";
import { listInvitations, listMembers } from "@/lib/members/service";
import { requireSession } from "@/lib/session";
import { storefrontHref } from "@/lib/stores/links";
import { getStore } from "@/lib/stores/service";

export const metadata = { title: "Storefront people" };

/**
 * Who may work on one storefront — its catalogue, orders and customers — and
 * the invitations out to it. Separate from Team, which is the whole business:
 * a storefront's own members are what the catalogue's write rules check.
 */
export default async function StorefrontPeoplePage({
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
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Storefronts", href: "/commerce/storefronts" },
                    { label: store.name, href: storefrontHref(store.id) },
                    "People",
                )}
                title="People"
                description={`Who can work on ${store.name}'s catalogue, orders and customers. The business's own team is under Team.`}
            />
            <MembersManager
                storeId={storeId}
                members={members}
                invitations={invitations}
                canManage={canManage}
            />
        </PageContainer>
    );
}
