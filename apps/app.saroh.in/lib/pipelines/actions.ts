"use server";

import type { CrmResult } from "@/lib/api/http";
import {
    addStage as addStageApi,
    deleteStage as deleteStageApi,
    updateStage as updateStageApi,
} from "@/lib/pipelines/service";

export interface StageChange {
    /** Absent for a stage being added. */
    id?: string;
    name: string;
    /** Its place after the change, from 0. */
    order: number;
    /** What it was, to send only what moved. */
    was?: { name: string; order: number };
}

/**
 * Apply a pipeline's edited stages in one go — what the Stages dialog's Save
 * sends. Removals first (so a freed position is free), then renames and
 * moves, then additions. Stops at the first failure and says which change it
 * was, because the ones before it have already landed.
 */
export async function saveStages(
    pipelineId: string,
    stages: StageChange[],
    removed: string[],
): Promise<CrmResult<{ changed: number }>> {
    let changed = 0;
    for (const id of removed) {
        const res = await deleteStageApi(pipelineId, id);
        if (!res.ok) return res;
        changed++;
    }
    for (const s of stages) {
        if (!s.id || !s.was) continue;
        const input = {
            ...(s.name !== s.was.name ? { name: s.name } : {}),
            ...(s.order !== s.was.order ? { order: s.order } : {}),
        };
        if (Object.keys(input).length === 0) continue;
        const res = await updateStageApi(pipelineId, s.id, input);
        if (!res.ok) return { ok: false, error: `${s.name}: ${res.error}` };
        changed++;
    }
    for (const s of stages) {
        if (s.id) continue;
        const res = await addStageApi(pipelineId, {
            name: s.name,
            order: s.order,
        });
        if (!res.ok) return { ok: false, error: `${s.name}: ${res.error}` };
        changed++;
    }
    return { ok: true, data: { changed } };
}
