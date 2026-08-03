import { PageHeader } from "@saroh/ui/page-header";

import { CreateSiteForm } from "@/components/sites/create-site-form";
import { requireSession } from "@/lib/session";
import { listTemplates } from "@/lib/sites/service";

/**
 * New-site page (S2-004). Mirrors the create-store page: a back link, a
 * heading, and the client CreateSiteForm. Templates are fetched server-side
 * and handed to the form so the author can pick one to seed the site.
 */
export default async function NewSitePage() {
    await requireSession();

    const templates = await listTemplates();

    return (
        <main className="mx-auto max-w-2xl p-8">
            <PageHeader
                title="Create a site"
                description="Pick a template and name your new site."
            />
            <CreateSiteForm templates={templates} />
        </main>
    );
}
