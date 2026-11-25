import { Button } from "@saroh/ui/button";
import { LimitReachedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";

import { PageContainer } from "@/components/shared/page/page-container";
import { NewSiteScreen } from "@/components/sites/new-site/new-site-screen";
import { requireCan } from "@/lib/access/require-can";
import { mayAddWebsite } from "@/lib/business-limits";
import { kindDefaults } from "@/lib/organizations/kind";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { tradeOf } from "@/lib/organizations/trade";
import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";
import { templateChoiceOn } from "@/lib/sites/templates-switch";

export const metadata = { title: "New website" };

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. On React Query (DEC-259): the
 * page says its refusals (no `site:create`, a website already there) and
 * hands the business's kind and trade to the screen, which reads the
 * templates (DEC-216: suggested for the business's trade first, else from
 * its kind and its modules) and the suggested address in the browser.
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

    const [organization, sites, params] = await Promise.all([
        resolveActiveOrganization(),
        listSites().catch(() => []),
        searchParams,
    ]);

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
                        <IntentLink data-ph-unmask="" key="site" href="/sites">
                            Website
                        </IntentLink>,
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
                            <IntentLink href={`/sites/${existing.id}/pages`}>
                                Go to {name}
                            </IntentLink>
                        </Button>
                    }
                />
            </PageContainer>
        );
    }

    const kind = organization?.kind;
    // `?template=`, else the one picked in the gallery at sign-up (DEC-216).
    const asked = !choice
        ? null
        : typeof params.template === "string"
          ? params.template
          : (organization?.startTemplate ?? null);

    return (
        <NewSiteScreen
            choice={choice}
            // The kind's template, picked to start with (DEC-070, K15).
            defaultTemplateId={kindDefaults(kind).starterTemplate}
            asked={asked}
            trade={tradeOf(organization?.trade)}
            tradeOther={organization?.tradeOther ?? null}
            kind={kind}
            canSetTrade={organization?.actions?.includes("org:update") ?? false}
        />
    );
}
