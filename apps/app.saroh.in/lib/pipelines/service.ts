import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

/**
 * CRM Pipelines data access for app.saroh.in (S3-005). Org-scoped reads (the
 * board loads pipelines + their ordered stages) plus structural mutations,
 * reached only through api.saroh.in (the app never touches the DB).
 * Server-only: the underlying HTTP plumbing imports next/headers.
 */

export interface Stage {
    id: string;
    name: string;
    order: number;
    pipelineId: string;
}

export interface Pipeline {
    id: string;
    name: string;
    isDefault: boolean;
    stages: Stage[];
    createdAt: string;
}

export interface CreatePipelineInput {
    name: string;
    stages?: { name: string }[];
}

/** The org's pipelines, each with ordered stages. Empty on any failure. */
export async function listPipelines(): Promise<Pipeline[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/pipelines`);
    if (!res.ok) return [];
    return (await res.json()) as Pipeline[];
}

/** Create a pipeline (with initial stages). */
export function createPipeline(
    input: CreatePipelineInput,
): Promise<CrmResult<Pipeline>> {
    return mutate<Pipeline>(
        "/pipelines",
        "POST",
        input,
        "Could not create the pipeline",
    );
}

/** Append a stage to a pipeline. */
export function addStage(
    pipelineId: string,
    input: { name: string; order?: number },
): Promise<CrmResult<Stage>> {
    return mutate<Stage>(
        `/pipelines/${pipelineId}/stages`,
        "POST",
        input,
        "Could not add the stage",
    );
}

/** Rename / reorder a stage. */
export function updateStage(
    pipelineId: string,
    stageId: string,
    input: { name?: string; order?: number },
): Promise<CrmResult<Stage>> {
    return mutate<Stage>(
        `/pipelines/${pipelineId}/stages/${stageId}`,
        "PATCH",
        input,
        "Could not update the stage",
    );
}
