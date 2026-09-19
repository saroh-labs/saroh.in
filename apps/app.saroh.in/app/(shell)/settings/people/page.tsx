import { TeamScreen } from "@/components/organizations/team-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listModules } from "@/lib/modules/service";
import { listInvitations, listMembers } from "@/lib/organizations/members";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";

/**
 * Settings → People (#276).
 *
 * Until this page a Saroh workspace had exactly one member: the owner created
 * at onboarding. Nothing anywhere could add a second person, which is why the
 * Review feature — built for the person who signs work off rather than writes
 * it — had nobody to invite.
 *
 * Everyone may see who is in their workspace; only an owner or admin may
 * change it. The API enforces both, and this page hides what it can so a
 * member is not offered controls that would refuse them.
 */
export const metadata = { title: "Team" };

export default async function PeoplePage() {
    await requireSession();

    const organization = await resolveActiveOrganization();
    const canManage =
        organization?.role === "OWNER" || organization?.role === "ADMIN";

    const [members, invitations, sites, moduleKeys] = await Promise.all([
        listMembers(),
        // Empty for anyone who may not see them, rather than an error: this is
        // one page and a member should still get the roster.
        canManage ? listInvitations() : Promise.resolve([]),
        // Only to name the sites a reviewer can be invited to.
        canManage ? listSites() : Promise.resolve([]),
        // What each role reaches depends on what this business has turned on;
        // unknown on failure, so every capability reads as on.
        listModules()
            .then((modules) =>
                modules
                    .filter((m) => m.readiness !== "DISABLED")
                    .map((m) => m.key),
            )
            .catch(() => null),
    ]);

    return (
        <PageContainer>
            <TeamScreen
                organizationName={organization?.name ?? "this business"}
                members={members}
                invitations={invitations}
                sites={sites.map((s) => ({ id: s.id, name: s.name }))}
                canManage={canManage}
                moduleKeys={moduleKeys}
            />
        </PageContainer>
    );
}
