import { redirect } from "next/navigation";

import { navCan } from "@/components/shared/navigation/nav-items";
import { SiteOverviewContainer } from "@/components/sites/area/site-screens";
import { mayReadForms } from "@/components/sites/shell/group-map";
import { businessZone } from "@/lib/format/business-zone";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

export const metadata = { title: "Overview · Website" };

/**
 * A site's Overview (plan 2026-11-18-001 U4): address and status, what the
 * site brought in, what needs doing and activity. On a phone the four
 * groups come right after the status, each with one line of how it stands
 * (the site home). With the Website area off it forwards to the Pages tab.
 *
 * On React Query (DEC-259): the page awaits only its gates (the switch,
 * the session, what this person may do, the business's zone); the overview
 * loads in the browser, and a failed read costs only its own region.
 */
export default async function SiteOverviewPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    if (!(await websiteAreaOn())) redirect(`/sites/${siteId}/pages`);
    await requireSession();
    const organization = await resolveActiveOrganization();
    const actor = {
        role: organization?.role ?? null,
        actions: organization?.actions,
    };
    return (
        <SiteOverviewContainer
            siteId={siteId}
            access={{
                canEdit: permits(organization, "section:write"),
                mayReadForms: mayReadForms(organization),
                mayBusiness: navCan(actor, "org:settings:read"),
                mayTeam: navCan(actor, "member:read"),
            }}
            timeZone={businessZone(organization)}
        />
    );
}
