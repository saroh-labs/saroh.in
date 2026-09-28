"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import {
    isSettled,
    joinAnd,
    leaveCopy,
    publishState,
    shellActions,
    statePill,
    statusLine,
    unsavedFields,
} from "@/lib/editor-shell/state";
import type {
    EditorAdapter,
    EditorCopy,
    EditorProblem,
    EditorRecord,
} from "@/lib/editor-shell/types";

import { LeaveDialog, useEditorLeaveGuard } from "./leave-guard";
import { PhoneActionBar, PublishBanner } from "./publish-banner";
import { useAutosave } from "./use-autosave";

/** What a record type's sections are handed to draw and change the record. */
export interface EditorFields<V> {
    values: V;
    /** Change some fields; the shell autosaves them. */
    set: (patch: Partial<V>) => void;
    /** The message to show beside each field, by field name. */
    errors: Partial<Record<string, string>>;
    /** Null until the first save creates it. */
    record: EditorRecord<V> | null;
    /** Nothing can be changed: no permission, or an action is out. */
    disabled: boolean;
}

export interface EditorShellProps<V extends Record<string, unknown>> {
    adapter: EditorAdapter<V>;
    copy: EditorCopy;
    /** Null while creating. */
    initial: EditorRecord<V> | null;
    /** A new record's starting values. */
    emptyValues: V;
    canEdit: boolean;
    /** The read-only note's first sentence, when `canEdit` is false. */
    readOnlyText?: string;
    /** The crumbs bar over the header (`PaymentsCrumbs` for a plan). */
    crumbs?: ReactNode;
    /** The header's title: the name typed so far, or "New plan". */
    titleOf: (values: V, record: EditorRecord<V> | null) => string;
    /**
     * Every rule the values break; any stops Publish and marks its field.
     * The record is what the server last answered (null before the first
     * save), for a rule that compares with what is live.
     */
    problemsOf: (values: V, record: EditorRecord<V> | null) => EditorProblem[];
    /** Why the values can't be saved at all yet ("Add a name to save the draft"). */
    blockerOf: (values: V) => string | null;
    /** "price ₹1,200 → ₹1,500 for new sign-ups", one per change. */
    changesOf: (published: V, values: V) => string[];
    /** Said after "When you publish: …" ("The 12 already on it keep…"). */
    changesNote?: (record: EditorRecord<V>) => string;
    /** A field's name in words, for the leave dialog ("price"). */
    fieldLabels: Partial<Record<keyof V & string, string>>;
    /** The record's edit page, which a new record's address becomes. */
    hrefFor: (id: string) => string;
    /** The record's own page ("View plan"). */
    viewHrefFor: (id: string) => string;
    /**
     * Whether "View" shows for this record; every saved record when left
     * out. The Pack Editor shows "View pack" only once it is live (E18).
     */
    viewable?: (record: EditorRecord<V>) => boolean;
    /** Where Delete draft goes. */
    afterDeleteHref: string;
    /** The toast after Publish ("Monthly is open for sign-ups."). */
    publishedMessage: (record: EditorRecord<V>, wasLive: boolean) => string;
    /** The side column (At a glance). */
    aside?: (fields: EditorFields<V>) => ReactNode;
    /** The record's sections. */
    children: (fields: EditorFields<V>) => ReactNode;
    /** Tests shorten it; about 800 ms otherwise. */
    autosaveDelayMs?: number;
}

/**
 * The workspace's editor for a record that is published (D6, DEC-043):
 * autosave, the publish banner, Publish / Publish changes / Discard changes
 * / Delete draft, a failed-save and a conflict state, and a guard on
 * leaving with unsaved work. The Plan Editor (D7) and the Pack Editor (E18)
 * each give it an adapter, their words, their rules and their sections.
 *
 * Nothing here knows about plans or packs. The rules are pure, in
 * `lib/editor-shell/state.ts`, and the autosave in `autosave.ts`.
 */
export function EditorShell<V extends Record<string, unknown>>(
    props: EditorShellProps<V>,
) {
    const {
        adapter,
        copy,
        initial,
        emptyValues,
        canEdit,
        readOnlyText,
        crumbs,
        titleOf,
        problemsOf,
        blockerOf,
        changesOf,
        changesNote,
        fieldLabels,
        hrefFor,
        viewHrefFor,
        viewable,
        afterDeleteHref,
        publishedMessage,
        aside,
        children,
        autosaveDelayMs,
    } = props;
    const router = useRouter();
    const editor = useAutosave<V>({
        adapter,
        initial,
        emptyValues,
        ready: (v) => blockerOf(v) === null,
        hrefFor,
        delayMs: autosaveDelayMs,
    });
    const { record, values, save } = editor;
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
    // A publish refused on a field ("There's already a plan called …").
    const [refused, setRefused] = useState<{
        field: string;
        message: string;
    } | null>(null);

    const problems = problemsOf(values, record);
    const blocker = blockerOf(values);
    const actions = shellActions({ save, record, problems, busy });
    const pill = statePill(record, copy);
    const line = statusLine({
        save,
        record,
        copy,
        blocker,
        firstSave: editor.firstSave,
    });
    const title = titleOf(values, record);
    const changes =
        record?.published && publishState(record) !== "draft"
            ? changesOf(record.published, values)
            : [];
    const changesText =
        changes.length > 0 && record
            ? `When you publish: ${changes.join(" · ")}.${
                  changesNote ? ` ${changesNote(record)}` : ""
              }`
            : null;

    // Problems show once something is typed, or the record exists: a new,
    // empty page isn't wrong yet.
    const errors: Partial<Record<string, string>> = {};
    if (record || save.edits > 0) {
        for (const p of problems) errors[p.field] ??= p.message;
    }
    if (save.phase === "failed" && save.errorField && save.error) {
        errors[save.errorField] = save.error;
    }
    if (refused) errors[refused.field] = refused.message;

    const settled = isSettled(save);
    const guard = useEditorLeaveGuard({
        unsettled: canEdit && !settled,
        flush: editor.flush,
    });
    const leave = leaveCopy({
        save,
        fields: unsavedFields(editor.lastSaved(), values, fieldLabels),
        created: record !== null,
        noun: copy.noun,
    });

    const set = (patch: Partial<V>) => {
        setRefused(null);
        editor.edit(patch);
    };

    async function publish() {
        if (!actions.publishOn) return;
        const wasLive = publishState(record) !== "draft" && record !== null;
        setBusy(true);
        try {
            const res = await editor.publish();
            if (!res) {
                // The save before it didn't go; the status line says why.
                return;
            }
            if (!res.ok) {
                if (res.conflict) return;
                if (res.field) {
                    setRefused({ field: res.field, message: res.error });
                }
                showError(res.error);
                return;
            }
            showSuccess(publishedMessage(res.data, wasLive));
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    async function discard() {
        setConfirm(null);
        setBusy(true);
        try {
            const res = await editor.discard();
            if (!res) return;
            if (!res.ok) {
                if (!res.conflict) showError(res.error);
                return;
            }
            setRefused(null);
            showSuccess("Changes discarded.");
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setConfirm(null);
        setBusy(true);
        const res = await editor.remove();
        if (res?.ok) {
            showSuccess("Draft deleted.");
            router.push(afterDeleteHref);
            router.refresh();
            return;
        }
        setBusy(false);
        if (res && !res.conflict) showError(res.error);
    }

    async function reload() {
        setBusy(true);
        try {
            const res = await editor.reload();
            if (res && !res.ok) showError(res.error);
            else setRefused(null);
        } finally {
            setBusy(false);
        }
    }

    const handlers = {
        onPublish: () => void publish(),
        onDiscard: () => setConfirm("discard"),
        onDelete: () => setConfirm("delete"),
        onRetry: () => void editor.retry(),
        onReload: () => void reload(),
    };
    const fields: EditorFields<V> = {
        values,
        set,
        errors,
        record,
        disabled: !canEdit || busy,
    };
    const discarded = record?.published
        ? changesOf(record.published, values)
        : [];

    return (
        <main className="w-full pb-8">
            {crumbs}
            <PublishBanner
                title={title}
                pill={pill}
                line={line}
                actions={actions}
                handlers={handlers}
                busy={busy}
                canEdit={canEdit}
                view={
                    record && (viewable?.(record) ?? true)
                        ? {
                              href: viewHrefFor(record.id),
                              label: copy.viewLabel,
                          }
                        : null
                }
                changesText={changesText}
            />
            {canEdit ? null : (
                <ReadOnlyNote className="mx-6 mb-0 mt-3 max-[759px]:mx-4">
                    {readOnlyText}
                </ReadOnlyNote>
            )}
            <fieldset
                disabled={!canEdit || busy}
                // Leaving a field saves what it holds now, not in 800 ms.
                onBlur={() => void editor.flush()}
                className="m-0 flex min-w-0 flex-wrap items-start gap-4 border-0 px-6 pb-7 pt-4 max-[759px]:px-4"
            >
                <legend className="sr-only">{title}</legend>
                <div className="grid min-w-0 flex-[1_1_420px] gap-3.5">
                    {children(fields)}
                </div>
                {aside ? (
                    <aside className="grid min-w-0 max-w-full flex-[0_0_300px] gap-3.5">
                        {aside(fields)}
                    </aside>
                ) : null}
            </fieldset>
            {canEdit ? (
                <PhoneActionBar
                    actions={actions}
                    handlers={handlers}
                    busy={busy}
                />
            ) : null}

            <ConfirmDialog
                open={confirm === "discard"}
                onOpenChange={(open) => setConfirm(open ? "discard" : null)}
                title={`Discard changes to ${title}?`}
                description={`${
                    discarded.length
                        ? `These go: ${joinAnd(discarded)}.`
                        : "Your unpublished changes go."
                } What's live stays as it is. This cannot be undone.`}
                confirmLabel="Discard changes"
                cancelLabel="Keep changes"
                icon={RotateCcw}
                onConfirm={() => void discard()}
            />
            <ConfirmDialog
                open={confirm === "delete"}
                onOpenChange={(open) => setConfirm(open ? "delete" : null)}
                title={`Delete ${title}?`}
                description={`The draft goes, with everything typed into it. It was never published, so nobody loses anything. This cannot be undone.`}
                confirmLabel="Delete draft"
                cancelLabel="Keep draft"
                onConfirm={() => void remove()}
            />
            <LeaveDialog
                open={guard.leaveTo !== null}
                title={leave.title}
                body={leave.body}
                onStay={guard.stay}
                onLeave={guard.leave}
            />
        </main>
    );
}
