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
import type { SubscriptionSave } from "./use-subscriptions";

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
 *
 * Each write takes the tab's business last (`save.orgId`); a draft saved
 * marks the Plans tab and the plan's page stale (`save.drafted`).
 */
export function planEditorAdapter(
    onRecord: (record: PlanEditorRecord) => void,
    renewal: RenewalChange | null,
    save: Pick<SubscriptionSave, "orgId" | "drafted">,
): PlanEditorAdapter {
    const { orgId } = save;
    let last = renewal;
    let published: RenewalChange | null = null;
    async function read(
        res: Promise<EditorResult<PlanEditorRecord>>,
        publishing = false,
        drafting = false,
    ): Promise<EditorResult<ReturnType<typeof editorRecordOf>>> {
        const r = await res;
        if (!r.ok) return r;
        if (drafting) save.drafted();
        if (publishing) published = last;
        last = r.data.renewalChange ?? null;
        onRecord(r.data);
        return { ok: true, data: editorRecordOf(r.data) };
    }
    return {
        create: (values) =>
            read(createPlanDraft(payloadOf(values), orgId), false, true),
        saveDraft: (id, values, revision) =>
            read(
                savePlanDraft(id, payloadOf(values), revision, orgId),
                false,
                true,
            ),
        publish: (id, revision) => read(publishPlan(id, revision, orgId), true),
        discard: (id, revision) =>
            read(discardPlanChanges(id, revision, orgId)),
        remove: (id, revision) => deletePlanDraft(id, revision, orgId),
        load: (id) => read(loadPlanDraft(id)),
        publishedRenewal: () => published,
    };
}
