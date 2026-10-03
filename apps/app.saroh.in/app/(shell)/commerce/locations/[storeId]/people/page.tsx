import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import { MembersManager } from "@/components/stores/members-manager";
import { listInvitations, listMembers } from "@/lib/members/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { storefrontHref } from "@/lib/stores/links";
import { getStore } from "@/lib/stores/service";

export const metadata = { title: "Location people" };

/**
 * Who may work on one storefront — its catalogue, orders and customers — and
 * the invitations out to it. One roster underneath (DEC-048, F16): everyone
 * here is also on the business's Team, and someone invited here joins it as
 * Storefront team unless they're on it already. Their storefront role is a
 * narrower grant on top, and is what the catalogue's write rules check.
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

    const [members, invitations, organization] = await Promise.all([
        listMembers(storeId),
        listInvitations(storeId),
        resolveActiveOrganization(),
    ]);
    const canManage = members.some(
        (m) => m.kind === "owner" && m.userId === session.user.id,
    );
    // Inviting here also adds someone to the team, so it needs the team's
    // invite too; the API refuses it without. From what the API resolved,
    // falling back to the role's name for a response without permissions.
    const canInvite =
        canManage &&
        (organization?.actions
            ? organization.actions.includes("member:invite")
            : organization?.role === "OWNER" || organization?.role === "ADMIN");

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Location", href: "/commerce/locations" },
                    { label: store.name, href: storefrontHref(store.id) },
                    "People",
                )}
                title="People"
                description={`Who can work on ${store.name}'s catalogue, orders and customers. Everyone here is also on your team, under Team.`}
            />
            <MembersManager
                storeId={storeId}
                members={members}
                invitations={invitations}
                canManage={canManage}
                canInvite={canInvite}
            />
        </PageContainer>
    );
}
