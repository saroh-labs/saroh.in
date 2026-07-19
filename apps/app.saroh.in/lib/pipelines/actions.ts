"use server";

import type { CreatePipelineInput } from "./service";
import {
    addStage as addStageApi,
    createPipeline as createPipelineApi,
    updateStage as updateStageApi,
} from "./service";

/**
 * Server Actions for CRM Pipeline mutations (S3-005). Thin wrappers that
 * forward the session cookie + active-org header to api.saroh.in (via the
 * service); the api resolves the caller from the session and enforces
 * `pipeline:manage`. Client components call these — never the api or the DB
 * directly.
 */

export async function createPipeline(input: CreatePipelineInput) {
    return createPipelineApi(input);
}

export async function addStage(
    pipelineId: string,
    input: { name: string; order?: number },
) {
    return addStageApi(pipelineId, input);
}

export async function updateStage(
    pipelineId: string,
    stageId: string,
    input: { name?: string; order?: number },
) {
    return updateStageApi(pipelineId, stageId, input);
}
