import type { EditorAdapter, EditorResult } from "@/lib/editor-shell/types";

import {
    createPlanDraft,
    deletePlanDraft,
    discardPlanChanges,
    loadPlanDraft,
    publishPlan,
    savePlanDraft,
} from "./actions";
import type { PlanEditorRecord } from "./plan-drafts";
import type { PlanForm } from "./plan-editor";
import { editorRecordOf, payloadOf } from "./plan-editor";
import type { RenewalChange } from "./renewal-change";

/** The shell's adapter, and what the last publish did to the plan's members. */
export interface PlanEditorAdapter extends EditorAdapter<PlanForm> {
    /**
     * The read's `renewalChange` as it stood just before the last publish:
     * what that publish did to the next renewal of the members on the
     * plan. A publish's own answer has none left, and its toast says it.
     */
    publishedRenewal: () => RenewalChange | null;
}

/**
 * The Plan Editor's adapter for the editor shell (D6 → D7): D5's draft
 * routes, through the Server Actions in `actions.ts`, with the form turned
 * into the API's values on the way out and back.
 *
 * `onRecord` hears every answer the server gave, so the page can read what
 * the shell doesn't carry: the problems the server found (a name another
 * plan has), which stop Publish, whether GST is asked, and what publishing
 * the GST does to the members on the plan (`renewalChange`).
 *
 * `renewal` is that last as the page first read it. The adapter follows it
 * through every answer, so a save flushed just before a publish counts.
 */
export function planEditorAdapter(
    onRecord: (record: PlanEditorRecord) => void,
    renewal: RenewalChange | null = null,
): PlanEditorAdapter {
    let last = renewal;
    let published: RenewalChange | null = null;
    async function read(
        res: Promise<EditorResult<PlanEditorRecord>>,
        publishing = false,
    ): Promise<EditorResult<ReturnType<typeof editorRecordOf>>> {
        const r = await res;
        if (!r.ok) return r;
        if (publishing) published = last;
        last = r.data.renewalChange ?? null;
        onRecord(r.data);
        return { ok: true, data: editorRecordOf(r.data) };
    }
    return {
        create: (values) => read(createPlanDraft(payloadOf(values))),
        saveDraft: (id, values, revision) =>
            read(savePlanDraft(id, payloadOf(values), revision)),
        publish: (id, revision) => read(publishPlan(id, revision), true),
        discard: (id, revision) => read(discardPlanChanges(id, revision)),
        remove: (id, revision) => deletePlanDraft(id, revision),
        load: (id) => read(loadPlanDraft(id)),
        publishedRenewal: () => published,
    };
}
