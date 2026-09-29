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

/**
 * The Plan Editor's adapter for the editor shell (D6 → D7): D5's draft
 * routes, through the Server Actions in `actions.ts`, with the form turned
 * into the API's values on the way out and back.
 *
 * `onRecord` hears every answer the server gave, so the page can read what
 * the shell doesn't carry: the problems the server found (a name another
 * plan has), which stop Publish.
 */
export function planEditorAdapter(
    onRecord: (record: PlanEditorRecord) => void,
): EditorAdapter<PlanForm> {
    async function read(
        res: Promise<EditorResult<PlanEditorRecord>>,
    ): Promise<EditorResult<ReturnType<typeof editorRecordOf>>> {
        const r = await res;
        if (!r.ok) return r;
        onRecord(r.data);
        return { ok: true, data: editorRecordOf(r.data) };
    }
    return {
        create: (values) => read(createPlanDraft(payloadOf(values))),
        saveDraft: (id, values, revision) =>
            read(savePlanDraft(id, payloadOf(values), revision)),
        publish: (id, revision) => read(publishPlan(id, revision)),
        discard: (id, revision) => read(discardPlanChanges(id, revision)),
        remove: (id, revision) => deletePlanDraft(id, revision),
        load: (id) => read(loadPlanDraft(id)),
    };
}
