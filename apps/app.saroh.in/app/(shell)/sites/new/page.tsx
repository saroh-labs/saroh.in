import { Button } from "@saroh/ui/button";
import { LimitReachedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page/page-container";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { requireCan } from "@/lib/access/require-can";
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
import { templateChoiceOn } from "@/lib/sites/templates-switch";

export const metadata = { title: "New website" };

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. Templates are fetched server-side
 * and handed to the form so the author can pick one to seed the site (U12:
 * suggested for the business first, from its kind and its modules).
 *
 * `?template=<id or slug>` starts the picker on that template, as the
 * gallery's "Use this template" will link.
 *
 * With the template choice switched off (`NEXT_PUBLIC_TEMPLATES`, DEC-135)
 * no template is read, shown or taken from the address: the site starts
 * from the one for what is being set up.
 */
export default async function NewSitePage({
    searchParams,
}: {
    searchParams: Promise<{ template?: string | string[] }>;
}) {
    await requireSession();
    const choice = templateChoiceOn();

    const [templates, organization, sites, modules, params] = await Promise.all(
        [
            // A failed catalogue is said in the form, not a failed page: the
            // site can still be made from the kind's template.
            choice
                ? listTemplates().catch((): Template[] | null => null)
                : Promise.resolve<Template[] | null>([]),
            resolveActiveOrganization(),
            listSites().catch(() => []),
            modulesOrUnknown(),
            searchParams,
        ],
    );

    /*
     * Said before the work, not after it (§30).
     *
     * The API has always refused anyone without `site:create`, but only on
     * submit. A MEMBER or a REVIEWER who reached this page picked a template,
     * named a site, pressed Create and only then learned they could not.
     * Nothing is offered here now, in the rail, the palette or the list
     * (#313); this is for whoever arrives with the address anyway.
     *
     * Asked of the permissions the API resolved, never the role's name: a
     * role the business made with `site:create` ticked makes one, and one
     * without it is told here.
     */
    const access = await requireCan(
        "site:create",
        {
            thing: "New site",
            back: { href: "/sites", label: "Back to Website" },
        },
        organization,
    );
    if (access.denied) return access.denied;

    /*
     * One website per business, on every plan (ADR-006, DEC-094), and the
     * API refuses a second. Nothing links here once there is one; this is for whoever
     * arrives with the address, told before the template picker.
     */
    const existing = sites.at(0);
    if (existing && !mayAddWebsite(sites.length)) {
        const name = existing.name.trim() || "Untitled site";
        return (
            <PageContainer width="form">
                <PageHeader
                    breadcrumb={[
                        <Link key="site" href="/sites">
                            Website
                        </Link>,
                        "New site",
                    ]}
                    title="New site"
                />
                <LimitReachedState
                    icon={<Globe />}
                    title="You already have a website"
                    description="A business has one website. Its pages, posts, look and address are all changed from Website."
                    secondary={
                        // The site's own name: masked in a recording.
                        <Button data-ph-mask="" asChild variant="outline">
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
    const asked =
        choice && typeof params.template === "string" ? params.template : null;

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={[
                    <Link key="site" href="/sites">
                        Website
                    </Link>,
                    "New site",
                ]}
                title="New site"
                description={
                    choice
                        ? "Name your new site, check its web address and pick a template."
                        : "Name your new site and check its web address."
                }
            />
            <CreateSiteForm
                templates={templates}
                choice={choice}
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
