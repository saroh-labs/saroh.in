"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import * as drafts from "./pack-drafts";
import type { PackValues } from "./pack-editor";

/*
 * The Pack Editor's Server Actions (E18), which the editor shell's adapter
 * calls. Thin: E14's routes decide who may, and what a pack may be. Kept
 * apart from `actions.ts` (the Packs list and the desk's sale).
 *
 * Each write takes the tab's business last (`writeAsOrg`), refusing a tab
 * whose business has since changed, and revalidates nothing: Publish,
 * Discard and Delete draft have the editor mark Class packs' reads stale
 * (`useClassPackSave`); an autosave changes nothing anyone else reads.
 */

/** Read a pack for the editor, and again for Reload after a conflict. */
export async function loadPackDraft(id: string) {
    return drafts.loadPackDraft(id);
}
export async function createPackDraft(
    values: Partial<PackValues>,
    orgId: string,
) {
    return writeAsOrg(orgId, () => drafts.createPackDraft(values));
}
export async function savePackDraft(
    id: string,
    values: Partial<PackValues>,
    revision: number,
    orgId: string,
) {
    return writeAsOrg(orgId, () => drafts.savePackDraft(id, values, revision));
}
export async function publishPack(id: string, revision: number, orgId: string) {
    return writeAsOrg(orgId, () => drafts.publishPack(id, revision));
}
export async function discardPackChanges(
    id: string,
    revision: number,
    orgId: string,
) {
    return writeAsOrg(orgId, () => drafts.discardPackChanges(id, revision));
}
export async function deletePackDraft(
    id: string,
    revision: number,
    orgId: string,
) {
    return writeAsOrg(orgId, () => drafts.deletePackDraft(id, revision));
}
