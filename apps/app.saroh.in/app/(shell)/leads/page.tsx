import { PageHeader } from "@saroh/ui/page-header";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { FollowUpsList } from "@/components/leads/follow-ups-list";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { LeadsView } from "@/components/leads/leads-view";
import { LeadsViewSwitch } from "@/components/leads/leads-view-switch";
import { PageContainer } from "@/components/shared/page-container";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { readOnlyLine } from "@/components/shared/who-can-change";
import { canOrUnknown } from "@/lib/access/require-can";
import { contactName } from "@/lib/crm/format";
import { loadAddLead } from "@/lib/leads/add-lead-data";
import { listLeads, listOpenTasks } from "@/lib/leads/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
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

    const organization = await resolveActiveOrganization();
    // `lead:write` adds a lead and `activity:write` marks a follow-up done
    // (`leads.service.ts`). Someone who reads leads without them gets the
    // list as it is, with no button that would only be refused.
    const canWrite = canOrUnknown(organization, "lead:write");
    const canLog = canOrUnknown(organization, "activity:write");

    const [leads, params, addLead, tasks] = await Promise.all([
        listLeads(),
        searchParams,
        canWrite ? loadAddLead() : Promise.resolve(null),
        listOpenTasks().catch(() => null),
    ]);
    const tab = params.tab === "follow-ups" ? "follow-ups" : "leads";

    return (
        <PageContainer width="wide">
            <PageHeader
                title="Leads"
                description="Opportunities in your pipeline: what they're worth, and how long they've waited."
                actions={
                    <>
                        <LeadsViewSwitch current="list" />
                        {addLead ? <AddLeadDialog {...addLead} /> : null}
                    </>
                }
            />
            <div className="mt-6 flex flex-col gap-5">
                {canWrite ? null : (
                    <ReadOnlyNote className="mb-0">
                        {readOnlyLine("leads", true)}
                    </ReadOnlyNote>
                )}
                <LeadsTabs
                    active={tab}
                    leadCount={leads.length}
                    taskCount={tasks?.length ?? null}
                />
                {tab === "follow-ups" ? (
                    <FollowUpsList
                        canWrite={canLog}
                        tasks={tasks}
                        leads={Object.fromEntries(
                            leads.map((l) => [
                                l.id,
                                {
                                    title: l.title,
                                    who: l.contact
                                        ? contactName(l.contact)
                                        : null,
                                },
                            ]),
                        )}
                    />
                ) : (
                    <LeadsView leads={leads} initialView={viewParam(params)} />
                )}
            </div>
        </PageContainer>
    );
}
