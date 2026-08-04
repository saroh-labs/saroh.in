import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { LeadsView } from "@/components/leads/leads-view";
import { listLeads } from "@/lib/leads/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Leads index for the active organization (S3-005).
 *
 * The page fetches; `LeadsView` decides how to render. Sorting, search, the
 * status filters and the density toggle all live in the shared `DataView`, so
 * this file stays a data boundary. `?view=` is read here rather than in the
 * client component so the primitive needs no Suspense boundary — and this is
 * the destination Home's "Open leads" tile links to.
 */
export const metadata = { title: "Leads" };

export default async function LeadsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [leads, params] = await Promise.all([listLeads(), searchParams]);

    return (
        <main className="mx-auto w-full max-w-7xl p-6 sm:p-8">
            <PageHeader
                title="Leads"
                description="Opportunities in your pipeline — what they're worth, and how long they've waited."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/pipeline">Pipeline board</Link>
                    </Button>
                }
            />
            <div className="mt-6">
                <LeadsView leads={leads} initialView={viewParam(params)} />
            </div>
        </main>
    );
}
