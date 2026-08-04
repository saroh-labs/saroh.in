import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";

/**
 * Sites index for the active organization (S2-004). Lists the org's CMS sites
 * with a call-to-action to create the first one; each card links to the
 * site editor. Mirrors the dashboard home list-page shell (app/page.tsx).
 */
/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Website" };

export default async function SitesPage() {
    await requireSession();

    const sites = await listSites();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Your sites"
                description="Websites you publish for this organization."
                actions={
                    sites.length > 0 ? (
                        <Button asChild variant="brand">
                            <Link href="/sites/new">New site</Link>
                        </Button>
                    ) : undefined
                }
            />

            {sites.length === 0 ? (
                <EmptyState
                    title="No sites yet"
                    description="Create your first site to start editing and previewing sections."
                    action={
                        <Button asChild variant="brand">
                            <Link href="/sites/new">Create a site</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {sites.map((site) => (
                        <Link key={site.id} href={`/sites/${site.id}`}>
                            <Card className="transition-colors hover:bg-muted/40">
                                <CardHeader>
                                    <CardTitle>{site.name}</CardTitle>
                                    <CardDescription>
                                        {site.subdomain
                                            ? `${site.subdomain}.saroh.in`
                                            : `/${site.slug}`}
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
