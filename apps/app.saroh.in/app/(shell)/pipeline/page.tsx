import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { MoveStageControl } from "@/components/crm/move-stage-control";
import { contactName, formatValue } from "@/lib/crm/format";
import type { LeadListItem, LeadStage } from "@/lib/leads/service";
import { listLeads } from "@/lib/leads/service";
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
        return (
            <main className="mx-auto max-w-7xl p-8">
                <Header />
                <EmptyState
                    title="No pipeline yet"
                    description="One is created automatically with your first enquiry or hand-created lead."
                />
            </main>
        );
    }

    // Default pipeline (or the first) drives the board when several exist.
    const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];

    // Leads for this pipeline only; bucket them by stage id for the columns.
    const leads = await listLeads({ pipelineId: pipeline.id });
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
        <main className="mx-auto max-w-full p-8">
            <Header pipelineName={pipeline.name} />

            <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
                {pipeline.stages.map((stage) => {
                    const stageLeads = byStage.get(stage.id) ?? [];
                    return (
                        <section
                            key={stage.id}
                            className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40 p-3"
                            aria-label={`Stage ${stage.name}`}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-semibold">
                                    {stage.name}
                                </h2>
                                <Badge variant="outline">
                                    {stageLeads.length}
                                </Badge>
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
        </main>
    );
}

/** The board header with a title + list-view link. */
function Header({ pipelineName }: { pipelineName?: string }) {
    return (
        <PageHeader
            title="Pipeline"
            description={pipelineName}
            actions={
                <Button asChild variant="outline">
                    <Link href="/leads">List view</Link>
                </Button>
            }
        />
    );
}
