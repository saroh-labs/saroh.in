"use client";

import { Button } from "@saroh/ui/button";
import { countLabel, PageHeader } from "@saroh/ui/page-header";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { FollowUpsList } from "@/components/leads/follow-ups-list";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { LeadsView } from "@/components/leads/leads-view";
import { LeadsViewSwitch } from "@/components/leads/leads-view-switch";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { contactName } from "@/lib/crm/format";
import { useLeadsList } from "@/lib/leads/use-leads";

/**
 * Leads on React Query (DEC-259): the same header, tabs, list and
 * follow-ups, from one query (`/api/leads`) that every lead write reads
 * again (`useLeadsSave`). The heading, the Board | List switch, the tabs
 * and New lead (held until what it offers is read) are drawn at once
 * (owner, 25 Nov); the counts are left out and the rows are skeletons
 * until the leads land.
 */
export function LeadsContainer({
    tab,
    canWrite,
    canLog,
    currency,
    initialView,
}: {
    tab: "leads" | "follow-ups";
    /** `lead:write`: without it the list reads as it is. */
    canWrite: boolean;
    /** `activity:write`: marks a follow-up done. */
    canLog: boolean;
    currency: string;
    initialView?: string;
}) {
    const read = useLeadsList();
    const view = read.data;
    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (read.isError && !view) throw read.error;

    return (
        <>
            <PageHeader
                breadcrumb={["Leads"]}
                title="Leads"
                count={
                    view ? (
                        countLabel(view.leads.length, {
                            one: "lead",
                            other: "leads",
                        })
                    ) : (
                        <FigureLoading />
                    )
                }
                description="Opportunities in your pipeline: what they're worth, and how long they've waited."
                meta={<LeadsViewSwitch current="list" />}
                actions={
                    view?.addLead ? (
                        <AddLeadDialog {...view.addLead} header />
                    ) : canWrite && !view ? (
                        // Who and where it can start come with the read.
                        <Button disabled>New lead</Button>
                    ) : undefined
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
                    leadCount={view ? view.leads.length : null}
                    taskCount={view?.tasks?.length ?? null}
                />
                {!view ? (
                    <PageLoading
                        bare
                        width="full"
                        shape="rows"
                        label={
                            tab === "follow-ups"
                                ? "Loading follow-ups"
                                : "Loading leads"
                        }
                    />
                ) : tab === "follow-ups" ? (
                    <FollowUpsList
                        canWrite={canLog}
                        tasks={view.tasks}
                        leads={Object.fromEntries(
                            view.leads.map((l) => [
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
                    <LeadsView
                        leads={view.leads}
                        currency={currency}
                        initialView={initialView}
                        tasks={view.tasks}
                    />
                )}
            </div>
        </>
    );
}
