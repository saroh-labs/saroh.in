"use client";

import { formatMoney } from "@/lib/format/money";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { PageHeader } from "@saroh/ui/page-header";
import { Inbox, Settings2 } from "lucide-react";

import { MoveStageControl } from "@/components/crm/move-stage-control";
import { PipelineBoardStart } from "@/components/crm/pipeline-board-start";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { LeadsViewSwitch } from "@/components/leads/leads-view-switch";
import { StagesDialog } from "@/components/leads/stages-dialog";
import { PageLoading } from "@/components/shared/page/page-loading";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { contactName } from "@/lib/crm/format";
import { firstStageWithLeads, stageAnchor } from "@/lib/crm/pipeline-board";
import type { LeadListItem, LeadStage } from "@/lib/leads/service";
import { usePipeline } from "@/lib/leads/use-leads";

/**
 * The Pipeline board on React Query (DEC-259): the same columns, cards and
 * controls, from one query (`/api/pipeline`) that a stage move, a new lead
 * or a stage edit reads again (`useLeadsSave`). The heading, the Board |
 * List switch and the header's buttons (held until what they offer is
 * read) are drawn at once (owner, 25 Nov); the board is a skeleton until
 * the pipeline lands.
 */
export function PipelineContainer({
    canWrite,
    mayManage,
    currency,
}: {
    /** `lead:write` adds a lead and moves its stage. */
    canWrite: boolean;
    /** `pipeline:manage`: the Stages dialog. */
    mayManage: boolean;
    currency: string;
}) {
    const read = usePipeline();
    const view = read.data;
    // A failed read is the page failing (`error.tsx`).
    if (read.isError && !view) throw read.error;
    if (!view) {
        return (
            <>
                <Header
                    action={
                        <>
                            {mayManage ? (
                                <Button variant="outline" disabled>
                                    <Settings2 className="mr-1.5 size-4" />
                                    Stages
                                </Button>
                            ) : null}
                            {canWrite ? (
                                <Button disabled>New lead</Button>
                            ) : null}
                        </>
                    }
                />
                {canWrite ? null : <ReadOnly />}
                <div className="mt-6">
                    <PageLoading
                        bare
                        width="full"
                        shape="rows"
                        label="Loading the pipeline"
                    />
                </div>
            </>
        );
    }
    const { pipeline, leads, addLead } = view;

    if (!pipeline) {
        // Adding a lead makes the pipeline (the API's `ensureDefault`), so
        // the empty board offers that rather than a pipeline to create —
        // Home's CRM step ("Add your first lead") lands here (#352).
        return (
            <>
                <Header />
                <EmptyState
                    icon={<Inbox />}
                    title="No leads yet"
                    description={
                        addLead
                            ? "Add your first lead and your pipeline starts with it. Enquiries from your site arrive here too."
                            : "Enquiries from your site arrive here, and so do the leads your team adds."
                    }
                    action={
                        addLead ? <AddLeadDialog {...addLead} /> : undefined
                    }
                />
            </>
        );
    }

    // Leads for this pipeline only; bucket them by stage id for the columns.
    const byStage = new Map<string, LeadListItem[]>();
    for (const stage of pipeline.stages) byStage.set(stage.id, []);
    for (const lead of leads) {
        const bucket = byStage.get(lead.stageId);
        if (bucket) bucket.push(lead);
    }

    const stages: LeadStage[] = pipeline.stages.map((s) => ({
        id: s.id,
        name: s.name,
        order: s.order,
    }));

    return (
        <>
            <Header
                pipelineName={pipeline.name}
                action={
                    <>
                        {mayManage ? (
                            <StagesDialog
                                pipelineId={pipeline.id}
                                pipelineName={pipeline.name}
                                stages={pipeline.stages.map((st) => ({
                                    id: st.id,
                                    name: st.name,
                                    leads: byStage.get(st.id)?.length ?? 0,
                                }))}
                            />
                        ) : null}
                        {addLead ? <AddLeadDialog {...addLead} header /> : null}
                    </>
                }
            />
            {canWrite ? null : <ReadOnly />}

            {/* On a phone the board shows one column at a time (UX-077):
                every stage and its count, to jump to, and the board opens
                on the first one with a lead. */}
            <nav
                aria-label="Stages"
                className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden"
            >
                {pipeline.stages.map((stage) => (
                    <a
                        key={stage.id}
                        href={`#${stageAnchor(stage.id)}`}
                        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm"
                    >
                        {stage.name}
                        <span className="tabular-nums text-muted-foreground">
                            {byStage.get(stage.id)?.length ?? 0}
                        </span>
                    </a>
                ))}
            </nav>
            <PipelineBoardStart
                stageId={firstStageWithLeads(
                    pipeline.stages,
                    new Map(
                        pipeline.stages.map((s) => [
                            s.id,
                            byStage.get(s.id)?.length ?? 0,
                        ]),
                    ),
                )}
            />

            <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
                {pipeline.stages.map((stage) => {
                    const stageLeads = byStage.get(stage.id) ?? [];
                    return (
                        <section
                            key={stage.id}
                            id={stageAnchor(stage.id)}
                            className="flex w-72 shrink-0 snap-start flex-col rounded-lg bg-muted/40 p-3"
                            aria-label={`Stage ${stage.name}`}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-semibold">
                                    {stage.name}
                                </h2>
                                <span className="flex items-center gap-1">
                                    <Badge variant="outline">
                                        {stageLeads.length}
                                    </Badge>
                                    {addLead ? (
                                        <AddLeadDialog
                                            {...addLead}
                                            stageId={stage.id}
                                            label="Add"
                                            ariaLabel={`Add a lead to ${stage.name}`}
                                            variant="ghost"
                                            size="sm"
                                        />
                                    ) : null}
                                </span>
                            </div>

                            <div className="flex flex-col gap-3">
                                {stageLeads.length === 0 ? (
                                    <EmptyState
                                        size="inline"
                                        className="text-xs"
                                        title="No leads at this stage"
                                    />
                                ) : (
                                    stageLeads.map((lead) => {
                                        const amount = formatMoney(
                                            lead.value,
                                            currency,
                                            { decimals: "always" },
                                        );
                                        return (
                                            <article
                                                key={lead.id}
                                                className="rounded-md border bg-background p-3 shadow-sm"
                                            >
                                                <IntentLink
                                                    href={`/leads/${lead.id}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {lead.title}
                                                </IntentLink>
                                                <p className="text-xs text-muted-foreground">
                                                    {lead.contact
                                                        ? contactName(
                                                              lead.contact,
                                                          )
                                                        : "Unknown contact"}
                                                    {amount
                                                        ? ` · ${amount}`
                                                        : ""}
                                                </p>
                                                {canWrite ? (
                                                    <div className="mt-2">
                                                        <MoveStageControl
                                                            leadId={lead.id}
                                                            currentStageId={
                                                                lead.stageId
                                                            }
                                                            stages={stages}
                                                            compact
                                                        />
                                                    </div>
                                                ) : null}
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </>
    );
}

/** Someone who reads the board without changing it. */
function ReadOnly() {
    return (
        <ReadOnlyNote className="mb-0 mt-4">
            {readOnlyLine("leads", true)}
        </ReadOnlyNote>
    );
}

/** The board header: its title, the Board | List switch and the actions. */
function Header({
    pipelineName,
    action,
}: {
    pipelineName?: string;
    action?: React.ReactNode;
}) {
    return (
        <PageHeader
            breadcrumb={["Pipeline"]}
            holdsData="description"
            title="Pipeline"
            description={pipelineName}
            meta={<LeadsViewSwitch current="board" />}
            actions={action}
        />
    );
}
