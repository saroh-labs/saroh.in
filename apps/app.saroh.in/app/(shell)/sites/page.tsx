import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { navRoleCan } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";

/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Website" };

/**
 * Website, from the rail.
 *
 * The rail's Website row lands here, and a business with a site is sent
 * straight to it: the workspace design has no list of sites to pass through,
 * because the Website screen's own picker says which sites there are and what
 * state each is in. A business with none is shown the way to make one.
 *
 * To the first site's Pages, which sends a reader on to Review — the one
 * redirect decides for every role, rather than this screen guessing.
 */
export default async function SitesPage() {
    await requireSession();

    const [sites, organization] = await Promise.all([
        listSites(),
        resolveActiveOrganization(),
    ]);
    const first = sites.at(0);
    if (first) redirect(`/sites/${first.id}/pages`);

    const role = organization?.role ?? null;
    const mayCreate = navRoleCan(role, "site:create");

    /*
     * Three roles reach this screen with nothing on it, and it said the same
     * thing to all of them. A REVIEWER is waiting to be asked to look at one;
     * a MEMBER cannot make one (#313).
     */
    const nothingHere =
        role === "REVIEWER"
            ? {
                  title: "Nothing to review yet",
                  description:
                      "A website appears here when someone asks you to look at it.",
              }
            : {
                  title: "No website yet",
                  description: mayCreate
                      ? "Pages, posts and an address — make one and it is yours to edit before anyone can see it."
                      : "An owner or admin creates the first one.",
              };

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader title="Website" className="mb-0" />
                <EmptyState
                    icon={<Globe />}
                    title={nothingHere.title}
                    description={nothingHere.description}
                    action={
                        mayCreate ? (
                            <Button asChild>
                                <Link href="/sites/new">
                                    <Plus className="mr-1.5 size-4" />
                                    New site
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            </div>
        </PageContainer>
    );
}
