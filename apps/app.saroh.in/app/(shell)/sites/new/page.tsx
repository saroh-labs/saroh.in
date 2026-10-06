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
import { modulesOrUnknown } from "@/lib/modules/guard";
import { kindDefaults } from "@/lib/organizations/kind";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import type { Template } from "@/lib/sites/service";
import {
    getNewSiteDefaults,
    listSites,
    listTemplates,
} from "@/lib/sites/service";
import {
    moduleStates,
    startingTemplate,
    suggestedTemplates,
} from "@/lib/sites/template-picker";

export const metadata = { title: "New site" };

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. Templates are fetched server-side
 * and handed to the form so the author can pick one to seed the site (U12:
 * suggested for the business first, from its kind and its modules).
 *
 * `?template=<id or slug>` starts the picker on that template, as the
 * gallery's "Use this template" will link.
 */
export default async function NewSitePage({
    searchParams,
}: {
    searchParams: Promise<{ template?: string | string[] }>;
}) {
    await requireSession();

    const [templates, organization, sites, modules, params] = await Promise.all(
        [
            // A failed catalogue is said in the form, not a failed page: the
            // site can still be made from the kind's template.
            listTemplates().catch((): Template[] | null => null),
            resolveActiveOrganization(),
            listSites().catch(() => []),
            modulesOrUnknown(),
            searchParams,
        ],
    );

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

    // The business's own address, or a free one like it (DEC-069, L5).
    const defaults = await getNewSiteDefaults();

    const kind = organization?.kind;
    // The kind's template, picked to start with (DEC-070, K15).
    const kindTemplate = kindDefaults(kind).starterTemplate;
    const states = moduleStates(modules);
    const listed = templates ?? [];
    const asked = typeof params.template === "string" ? params.template : null;

    return (
        <PageContainer width="form">
            <PageHeader
                title="Create a site"
                description="Name your new site, check its web address and pick a template."
            />
            <CreateSiteForm
                templates={templates}
                defaults={defaults}
                defaultTemplateId={kindTemplate}
                startTemplateId={startingTemplate(listed, asked, kindTemplate)}
                suggested={suggestedTemplates(
                    listed,
                    kind,
                    states,
                    kindTemplate,
                ).map((t) => t.id)}
                modules={states}
            />
        </PageContainer>
    );
}
