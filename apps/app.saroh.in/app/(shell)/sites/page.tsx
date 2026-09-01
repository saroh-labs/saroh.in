import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { env } from "@/env";
import { requireSession } from "@/lib/session";
import type { SiteSummary } from "@/lib/sites/service";
import { listSites } from "@/lib/sites/service";

/**
 * Where a merchant's subdomain lives. Falls back to the production host so a
 * developer without the variable set still sees a plausible address rather than
 * "northwind.undefined" — the renderer defaults the same way.
 */
const ROOT_DOMAIN = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

/**
 * The one most consequential true thing about a site (#191).
 *
 * Ranked, not concatenated: a name and an address look identical whether a site
 * is live, never published, or waiting on a DNS record, and those last two are
 * exactly the states that strand a site invisibly. Four tags on a card would
 * turn a list into a dashboard, so this says the thing that matters most and
 * stops.
 *
 * "Never published" outranks everything: that site does not exist to the public,
 * which no other state is as consequential as.
 */
function siteState(site: SiteSummary): {
    label: string;
    tone: "live" | "draft" | "attention";
} {
    if (!site.currentPublicationId) {
        return { label: "Never published", tone: "draft" };
    }
    if (site.pendingDomain) {
        // Published, but the domain they think they connected routes nowhere.
        return { label: "Live · domain pending", tone: "attention" };
    }
    if (site.hasUnpublishedChanges) {
        return { label: "Live · unpublished changes", tone: "attention" };
    }
    return { label: "Live", tone: "live" };
}

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
                    {sites.map((site, index) => {
                        const state = siteState(site);
                        return (
                            <Link key={site.id} href={`/sites/${site.id}`}>
                                <Card
                                    className="wk-surface h-full"
                                    style={
                                        {
                                            "--wk-i": index,
                                        } as React.CSSProperties
                                    }
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-3">
                                            <CardTitle className="min-w-0">
                                                {site.name}
                                            </CardTitle>
                                            {/*
                                             * Whether the public can reach this
                                             * site is the first thing a
                                             * merchant wants from a list of
                                             * sites, and the card used to show
                                             * only a name and an address —
                                             * which a draft has too.
                                             *
                                             * The badge now carries the RANKED
                                             * state (#191) rather than just
                                             * live/draft: a published site
                                             * whose domain never verified reads
                                             * "Live" under the old rule, which
                                             * is the exact over-claim this list
                                             * exists to remove. Colour maps to
                                             * tokens, not badge variants, for
                                             * the same reason Home's severity
                                             * does — `default` is the luminous
                                             * action colour in two skins.
                                             */}
                                            <Badge
                                                className={cn(
                                                    "shrink-0",
                                                    state.tone === "live" &&
                                                        "bg-success text-success-foreground",
                                                    state.tone ===
                                                        "attention" &&
                                                        "bg-highlight text-highlight-foreground",
                                                    state.tone === "draft" &&
                                                        "border border-border bg-transparent text-muted-foreground",
                                                )}
                                            >
                                                {state.label}
                                            </Badge>
                                        </div>
                                        <CardDescription>
                                            {site.subdomain
                                                ? `${site.subdomain}.${ROOT_DOMAIN}`
                                                : `/${site.slug}`}
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
