import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/shared/access-denied";
import { navRoleCan } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { mayAddWebsite } from "@/lib/business-limits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listSites, listTemplates } from "@/lib/sites/service";

export const metadata = { title: "New site" };

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. Templates are fetched server-side
 * and handed to the form so the author can pick one to seed the site.
 */
export default async function NewSitePage() {
    await requireSession();

    const [templates, organization, sites] = await Promise.all([
        listTemplates(),
        resolveActiveOrganization(),
        listSites().catch(() => []),
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
                backLabel="Back to Website"
            />
        );
    }

    /*
     * One website per business for now (ADR-006), and the API refuses a
     * second. Nothing links here once there is one; this is for whoever
     * arrives with the address, told before the template picker.
     */
    const existing = sites.at(0);
    if (existing && !mayAddWebsite(sites.length)) {
        const name = existing.name.trim() || "Untitled site";
        return (
            <PageContainer width="form">
                <PageHeader title="Create a site" />
                <EmptyState
                    icon={<Globe />}
                    title={`${name} is this business's website`}
                    description="A business has one website for now. Its pages, posts, look and address are all changed from Website."
                    action={
                        <Button asChild variant="outline">
                            <Link href={`/sites/${existing.id}/pages`}>
                                Go to {name}
                            </Link>
                        </Button>
                    }
                />
            </PageContainer>
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
