"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Autosave } from "@/lib/editor-shell/autosave";
import type { SaveState } from "@/lib/editor-shell/state";
import { initialSave } from "@/lib/editor-shell/state";
import type {
    EditorAdapter,
    EditorRecord,
    EditorResult,
} from "@/lib/editor-shell/types";

/**
 * One record in the editor: its values, its autosave and the actions that
 * replace the screen with the server's copy (D6).
 *
 * The autosave's rules live in `lib/editor-shell/autosave.ts`; this hook
 * only binds them to React state and to the record type's adapter. The
 * first save of a new record creates it as a Draft, and the address becomes
 * the record's own edit page without a reload.
 */
export function useAutosave<V>({
    adapter,
    initial,
    emptyValues,
    ready,
    hrefFor,
    delayMs,
}: {
    adapter: EditorAdapter<V>;
    /** Null while creating. */
    initial: EditorRecord<V> | null;
    emptyValues: V;
    /** Enough to save at all: a new record needs a name. */
    ready: (values: V) => boolean;
    /** The record's edit page, which a new record's address becomes. */
    hrefFor: (id: string) => string;
    delayMs?: number;
}) {
    const [record, setRecord] = useState(initial);
    const [values, setValues] = useState<V>(initial?.values ?? emptyValues);
    const [firstSave, setFirstSave] = useState(false);
    const [save, setSave] = useState<SaveState>(() =>
        initialSave(initial?.revision ?? null),
    );
    // The latest of each, for the save closure the controller holds.
    const recordRef = useRef(initial);
    const live = useRef({ adapter, ready, hrefFor });
    useEffect(() => {
        live.current = { adapter, ready, hrefFor };
    });

    const [ctrl] = useState(
        () =>
            new Autosave<V, EditorRecord<V>>({
                values: initial?.values ?? emptyValues,
                revision: initial?.revision ?? null,
                delayMs,
                onState: setSave,
            }),
    );

    // What a save calls, bound once the page has mounted: nothing is sent
    // before an edit, and an edit needs a mounted page.
    useEffect(() => {
        ctrl.connect({
            ready: (v) => live.current.ready(v),
            send: (v, revision) => {
                const r = recordRef.current;
                const a = live.current.adapter;
                return r
                    ? a.saveDraft(r.id, v, revision ?? r.revision)
                    : a.create(v);
            },
            onSaved: (next) => {
                const created = recordRef.current === null;
                recordRef.current = next;
                // The record's facts only: the values on screen may
                // already be ahead of what this save carried.
                setRecord(next);
                if (created) {
                    setFirstSave(true);
                    window.history.replaceState(
                        null,
                        "",
                        live.current.hrefFor(next.id),
                    );
                }
            },
        });
        return () => ctrl.dispose();
    }, [ctrl]);

    const edit = useCallback(
        (patch: Partial<V>) => {
            const next = { ...ctrl.values, ...patch };
            setValues(next);
            ctrl.edit(next);
        },
        [ctrl],
    );

    /** The server's copy replaces the screen's. */
    const apply = useCallback(
        (next: EditorRecord<V>) => {
            recordRef.current = next;
            setRecord(next);
            setValues(next.values);
            ctrl.reset(next.values, next.revision);
        },
        [ctrl],
    );

    const revision = useCallback(
        () => ctrl.snapshot.revision ?? recordRef.current?.revision ?? 0,
        [ctrl],
    );

    /** Publish or Publish changes: save what is on screen first. */
    const publish = useCallback(async (): Promise<EditorResult<
        EditorRecord<V>
    > | null> => {
        if (!(await ctrl.flush())) return null;
        const r = recordRef.current;
        if (!r) return null;
        const res = await live.current.adapter.publish(r.id, revision());
        if (res.ok) {
            apply(res.data);
            setFirstSave(false);
        } else if (res.conflict) {
            ctrl.conflict(res.conflict);
        }
        return res;
    }, [apply, ctrl, revision]);

    /** Discard changes: nothing more is sent, and the live values come back. */
    const discard = useCallback(async (): Promise<EditorResult<
        EditorRecord<V>
    > | null> => {
        await ctrl.idle();
        const r = recordRef.current;
        if (!r) return null;
        const res = await live.current.adapter.discard(r.id, revision());
        if (res.ok) apply(res.data);
        else if (res.conflict) ctrl.conflict(res.conflict);
        return res;
    }, [apply, ctrl, revision]);

    /** Delete draft. The caller leaves the page on success. */
    const remove = useCallback(async (): Promise<EditorResult<null> | null> => {
        await ctrl.idle();
        const r = recordRef.current;
        if (!r) return null;
        const res = await live.current.adapter.remove(r.id, revision());
        if (!res.ok && res.conflict) ctrl.conflict(res.conflict);
        return res;
    }, [ctrl, revision]);

    /** Reload after a conflict: the new revision, and the typed values go. */
    const reload = useCallback(async (): Promise<EditorResult<
        EditorRecord<V>
    > | null> => {
        const r = recordRef.current;
        if (!r) return null;
        await ctrl.idle();
        const res = await live.current.adapter.load(r.id);
        if (res.ok) apply(res.data);
        return res;
    }, [apply, ctrl]);

    const flush = useCallback(() => ctrl.flush(), [ctrl]);
    const retry = useCallback(() => ctrl.retry(), [ctrl]);
    const lastSaved = useCallback(() => ctrl.lastSaved, [ctrl]);

    return {
        record,
        values,
        save,
        firstSave,
        edit,
        flush,
        retry,
        reload,
        publish,
        discard,
        remove,
        lastSaved,
    };
}
