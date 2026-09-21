import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { LeadsView } from "@/components/leads/leads-view";
import { PageContainer } from "@/components/shared/page-container";
import { loadAddLead } from "@/lib/leads/add-lead-data";
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

    const [leads, params, addLead] = await Promise.all([
        listLeads(),
        searchParams,
        loadAddLead(),
    ]);

    return (
        <PageContainer width="wide">
            <PageHeader
                title="Leads"
                description="Opportunities in your pipeline — what they're worth, and how long they've waited."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/pipeline">Pipeline board</Link>
                        </Button>
                        <AddLeadDialog {...addLead} />
                    </>
                }
            />
            <div className="mt-6">
                <LeadsView leads={leads} initialView={viewParam(params)} />
            </div>
        </PageContainer>
    );
}
