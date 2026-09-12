import { PageHeader } from "@saroh/ui/page-header";

import { AccessDenied } from "@/components/shared/access-denied";
import { navRoleCan } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listTemplates } from "@/lib/sites/service";

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. Templates are fetched server-side
 * and handed to the form so the author can pick one to seed the site.
 */
export default async function NewSitePage() {
    await requireSession();

    const [templates, organization] = await Promise.all([
        listTemplates(),
        resolveActiveOrganization(),
    ]);

    /*
     * Said before the work, not after it (§30).
     *
     * `site:create` is OWNER/ADMIN, and the API has always refused everyone
     * else — but only on submit. A MEMBER or a REVIEWER who reached this page
     * picked a template, named a site, pressed Create and only then learned
     * they could not. Nothing is offered here now, in the rail, the palette or
     * the list (#313); this is for whoever arrives with the address anyway.
     */
    if (!navRoleCan(organization?.role ?? null, "site:create")) {
        return (
            <AccessDenied
                title="Only owners and admins can create a site"
                description="You can open and read the websites you have been given access to. An owner or admin can create a new one."
                backHref="/sites"
                backLabel="Back to your sites"
            />
        );
    }

    return (
        <PageContainer width="form">
            <PageHeader
                title="Create a site"
                description="Pick a template and name your new site."
            />
            <CreateSiteForm templates={templates} />
        </PageContainer>
    );
}
