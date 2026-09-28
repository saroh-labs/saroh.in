"use server";

import { revalidatePath } from "next/cache";

import * as drafts from "./pack-drafts";
import type { PackValues } from "./pack-editor";

/*
 * The Pack Editor's Server Actions (E18), which the editor shell's adapter
 * calls. Thin: E14's routes decide who may, and what a pack may be. Kept
 * apart from `actions.ts` (the Packs list and the desk's sale).
 *
 * Publish, Discard and Delete draft refresh Packs, whose cards show a draft
 * and "Changes not published". An autosave refreshes nothing: re-rendering
 * the editor's own page under someone typing would gain nothing, and Packs
 * is read fresh whenever it is opened.
 */

function refresh(id?: string) {
    revalidatePath("/class-packs");
    if (id) revalidatePath(`/class-packs/${id}`);
}

async function then<T extends { ok: boolean }>(
    res: Promise<T>,
    id?: string,
): Promise<T> {
    const r = await res;
    if (r.ok) refresh(id);
    return r;
}

/** Read a pack for the editor, and again for Reload after a conflict. */
export async function loadPackDraft(id: string) {
    return drafts.loadPackDraft(id);
}
export async function createPackDraft(values: Partial<PackValues>) {
    return drafts.createPackDraft(values);
}
export async function savePackDraft(
    id: string,
    values: Partial<PackValues>,
    revision: number,
) {
    return drafts.savePackDraft(id, values, revision);
}
export async function publishPack(id: string, revision: number) {
    return then(drafts.publishPack(id, revision), id);
}
export async function discardPackChanges(id: string, revision: number) {
    return then(drafts.discardPackChanges(id, revision), id);
}
export async function deletePackDraft(id: string, revision: number) {
    return then(drafts.deletePackDraft(id, revision));
}
