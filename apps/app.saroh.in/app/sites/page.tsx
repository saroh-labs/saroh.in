import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";

/**
 * Sites index for the active organization (S2-004). Lists the org's CMS sites
 * with a call-to-action to create the first one; each card links to the
 * site editor. Mirrors the dashboard home list-page shell (app/page.tsx).
 */
export default async function SitesPage() {
    await requireSession();

    const sites = await listSites();

    return (
        <main className="mx-auto max-w-4xl p-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Your sites</h1>
                {sites.length > 0 && (
                    <Button asChild>
                        <Link href="/sites/new">New site</Link>
                    </Button>
                )}
            </div>

            {sites.length === 0 ? (
                <Card className="border-dashed">
                    <CardHeader className="items-center text-center">
                        <CardTitle>No sites yet</CardTitle>
                        <CardDescription>
                            Create your first site to start editing and
                            previewing sections.
                        </CardDescription>
                        <div className="pt-4">
                            <Button asChild>
                                <Link href="/sites/new">Create a site</Link>
                            </Button>
                        </div>
                    </CardHeader>
                </Card>
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
