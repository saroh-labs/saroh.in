import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { MoveStageControl } from "@/components/crm/move-stage-control";
import { PipelineBoardStart } from "@/components/crm/pipeline-board-start";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { StagesDialog } from "@/components/leads/stages-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { contactName, formatValue } from "@/lib/crm/format";
import { firstStageWithLeads, stageAnchor } from "@/lib/crm/pipeline-board";
import { loadAddLead } from "@/lib/leads/add-lead-data";
import type { LeadListItem, LeadStage } from "@/lib/leads/service";
import { listLeads } from "@/lib/leads/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listPipelines } from "@/lib/pipelines/service";
import { requireSession } from "@/lib/session";

/**
 * Pipeline board for the active organization (S3-005) — the acceptance
 * deliverable "owner views and moves lead stages". One column per Stage (in
 * board order); each Lead card sits under its current stage and carries a
 * move-stage control (a Select of the pipeline's stages) that calls the move
 * server action and refreshes. Deliberately no drag-and-drop — a Select is
 * simple, robust, and accessible.
 *
 * The board shows the org's DEFAULT pipeline (or the first one) when several
 * exist; a full pipeline switcher is a later refinement.
 */
/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
    await requireSession();

    const pipelines = await listPipelines();

    if (pipelines.length === 0) {
        // Adding a lead makes the pipeline (the API's `ensureDefault`), so
        // the empty board offers that rather than a pipeline to create —
        // Home's CRM step ("Add your first lead") lands here (#352).
        const addLead = await loadAddLead(pipelines);
        return (
            <PageContainer width="wide">
                <Header />
                <EmptyState
                    title="No leads yet"
                    description="Add your first lead and your pipeline starts with it. Enquiries from your site arrive here too."
                    action={<AddLeadDialog {...addLead} />}
                />
            </PageContainer>
        );
    }

    // Default pipeline (or the first) drives the board when several exist.
    const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];

    // Leads for this pipeline only; bucket them by stage id for the columns.
    const [leads, addLead, organization] = await Promise.all([
        listLeads({ pipelineId: pipeline.id }),
        loadAddLead(pipelines),
        resolveActiveOrganization(),
    ]);
    // From what the API resolved this person may do; the role's name only as
    // the fallback for a response that predates permissions.
    const mayManage = organization?.actions
        ? organization.actions.includes("pipeline:manage")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
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
        <PageContainer width="wide" className="max-w-full">
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
                        <AddLeadDialog {...addLead} />
                    </>
                }
            />

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
                                    <AddLeadDialog
                                        {...addLead}
                                        stageId={stage.id}
                                        label="Add"
                                        ariaLabel={`Add a lead to ${stage.name}`}
                                        variant="ghost"
                                        size="sm"
                                    />
                                </span>
                            </div>

                            <div className="flex flex-col gap-3">
                                {stageLeads.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        No leads
                                    </p>
                                ) : (
                                    stageLeads.map((lead) => {
                                        const amount = formatValue(lead.value);
                                        return (
                                            <article
                                                key={lead.id}
                                                className="rounded-md border bg-background p-3 shadow-sm"
                                            >
                                                <Link
                                                    href={`/leads/${lead.id}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {lead.title}
                                                </Link>
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
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </PageContainer>
    );
}

/** The board header with a title + list-view link. */
function Header({
    pipelineName,
    action,
}: {
    pipelineName?: string;
    action?: React.ReactNode;
}) {
    return (
        <PageHeader
            title="Pipeline"
            description={pipelineName}
            actions={
                <>
                    <Button asChild variant="outline">
                        <Link href="/leads">List view</Link>
                    </Button>
                    {action}
                </>
            }
        />
    );
}
