import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { TeamScreen } from "@/components/organizations/team-screen";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { rowNotice } from "@/lib/billing/access";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { shownCatalogue } from "@/lib/organizations/catalogue-shown";
import {
    getStorefrontTeamNotice,
    listInvitations,
    listMembers,
} from "@/lib/organizations/members";
import { getRoleCatalogue, listRoles } from "@/lib/organizations/roles";
import { rolesLock } from "@/lib/organizations/roles-lock";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
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
    /*
     * From what the API resolved the actor may do, not from the role's name:
     * a role this business invented maps to MEMBER by name and may still have
     * been granted the roster or the roles. The name is only the fallback for
     * a response that predates permissions being sent.
     */
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const canManage = may("member:invite");
    const canEditRoles = may("member:role:update");

    const [
        members,
        invitations,
        sites,
        roles,
        fullCatalogue,
        joinedFromStorefronts,
        modules,
    ] = await Promise.all([
        listMembers(),
        // Empty for anyone who may not see them, rather than an error: this is
        // one page and a member should still get the roster.
        canManage ? listInvitations() : Promise.resolve([]),
        // Only to name the sites a reviewer can be invited to.
        canManage ? listSites() : Promise.resolve([]),
        listRoles(),
        // The permission list the owner ticks from; `null` renders as "could
        // not be loaded" rather than as an empty list that looks like a role
        // with no powers available to it.
        getRoleCatalogue().catch(() => null),
        // The storefront people the F16 backfill added, for whoever can
        // change their role (DEC-048); empty for everyone else.
        canEditRoles ? getStorefrontTeamNotice() : Promise.resolve([]),
        // To leave out a hidden module's permissions (DEC-073); null, when
        // they can't be read, holds nothing back.
        modulesOrUnknown(),
    ]);
    // The plan, for whoever changes the team or its roles.
    const access =
        canManage || canEditRoles ? await billingAccessOrNull() : null;
    // The plan's team seats (U14, DEC-105): people who can change something
    // plus such invites, as the API counts.
    const team = canManage ? rowNotice(access, "members") : null;
    // View-only people have their own cap (DEC-105): full seats still
    // invite one, and the other way round. A soft cap never stops an invite.
    const reviewers = canManage ? rowNotice(access, "reviewers") : null;
    const seats = team?.on && !team.soft ? team : null;
    const viewOnly =
        reviewers?.on && !reviewers.soft && reviewers.full ? reviewers : null;
    const teamLimit =
        seats || viewOnly
            ? {
                  full: seats?.full === true,
                  why: seats?.why ?? "",
                  reviewersFull: viewOnly !== null,
                  reviewersWhy: viewOnly?.why,
              }
            : null;
    const catalogue = shownCatalogue(fullCatalogue, modules);

    return (
        <SettingsPanel>
            <TeamScreen
                organizationName={organization?.name ?? "this business"}
                members={members}
                invitations={invitations}
                sites={sites.map((s) => ({ id: s.id, name: s.name }))}
                canManage={canManage}
                canEditRoles={canEditRoles}
                roles={roles}
                catalogue={catalogue}
                myActions={organization?.actions ?? null}
                joinedFromStorefronts={joinedFromStorefronts}
                teamLimit={teamLimit}
                rolesLock={canEditRoles ? rolesLock(access) : null}
                limitNotice={
                    canManage ? <PlanLimitNotice moduleId="members" /> : null
                }
            />
        </SettingsPanel>
    );
}
