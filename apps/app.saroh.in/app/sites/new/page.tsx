import Link from "next/link";

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
        <main className="mx-auto max-w-4xl p-8">
            <Link
                href="/sites"
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to sites
            </Link>
            <h1 className="mb-6 mt-4 text-2xl font-semibold">Create a site</h1>
            <CreateSiteForm templates={templates} />
        </main>
    );
}
