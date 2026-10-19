"use client";

import {
    dismissToasts,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a change's Undo stays on screen in the console (Releases R2:
 * about thirty seconds). Longer than the merchant app's ten: an operator
 * reads what changed, and for whom, before deciding.
 */
export const UNDO_MS = 30_000;

/** How long a changed row stays highlighted (R9). */
export const HIGHLIGHT_MS = 2_000;

/** What the toast says under a live write: every one is audited. */
export const AUDITED = "Kept with your name in the audit trail.";
export const UNDONE = "Change undone";
export const UNDONE_DETAIL = "Recorded as its own change, with your name.";
export const UNDO_FAILED = "Undo didn't finish";
export const UNDO_FAILED_DETAIL =
    "It stays as changed. Change it back by hand.";

/**
 * What an Undo said. Nothing, or `{ ok: true }`, when it worked. A failure
 * may say what is still changed (`description`), in the screen's words.
 */
export type UndoOutcome =
    void | { ok: true } | { ok: false; description?: string };

export interface ChangeFeedback {
    /** Past tense, naming the thing: "Payments is on for Rye & Co.". */
    message: string;
    /** The second line. The audit-trail sentence by default. */
    description?: string;
    /** The inverse write. Undo is offered only when there is one. */
    undo?: () => Promise<UndoOutcome>;
    /** The row the write changed: highlighted, and kept in the list. */
    rowId?: string;
}

/**
 * Feedback after a **live** write (R9), the one way the console says it:
 * a past-tense toast, Undo where the change has an inverse, and the changed
 * row highlighted for two seconds.
 *
 * A changed row the current filter would now hide is not whisked away
 * under the operator's eyes: `keep` holds it in place, highlighted, until
 * `filterKey` changes (a new filter or search) or `clearKept` is called (a
 * refresh). Plans draft edits never come here: their feedback is the
 * draft's own.
 *
 * ```ts
 * const feedback = useChangeFeedback({ filterKey: `${status}|${q}` });
 * feedback.report({ message: "Rye & Co. suspended.", undo, rowId: org.id });
 * const { rows, highlighted } = feedback.keep(all, { id: (o) => o.id, passes });
 * ```
 */
export function useChangeFeedback({ filterKey }: { filterKey?: string } = {}) {
    // Rows inside their two seconds.
    const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set());
    // Rows changed since the filter last changed.
    const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const pending = timers.current;
        return () => {
            for (const timer of pending.values()) clearTimeout(timer);
            pending.clear();
        };
    }, []);

    // A new filter is the operator's own say on what the list shows.
    const [seenKey, setSeenKey] = useState(filterKey);
    if (seenKey !== filterKey) {
        setSeenKey(filterKey);
        setKept(new Set());
    }

    const light = useCallback((rowId: string) => {
        setLit((now) => new Set(now).add(rowId));
        setKept((now) => (now.has(rowId) ? now : new Set(now).add(rowId)));
        const pending = timers.current;
        const old = pending.get(rowId);
        if (old) clearTimeout(old);
        pending.set(
            rowId,
            setTimeout(() => {
                pending.delete(rowId);
                setLit((now) => {
                    const next = new Set(now);
                    next.delete(rowId);
                    return next;
                });
            }, HIGHLIGHT_MS),
        );
    }, []);

    const report = useCallback(
        ({ message, description = AUDITED, undo, rowId }: ChangeFeedback) => {
            if (rowId) light(rowId);
            if (!undo) {
                showSuccess(message, description);
                return;
            }
            // One Undo on screen: an older one beside it is how the wrong
            // change gets taken back.
            dismissToasts();
            showUndo(
                message,
                () => {
                    void (async () => {
                        let outcome: UndoOutcome;
                        try {
                            outcome = await undo();
                        } catch {
                            outcome = { ok: false };
                        }
                        if (outcome && !outcome.ok) {
                            showError(
                                UNDO_FAILED,
                                outcome.description ?? UNDO_FAILED_DETAIL,
                            );
                            return;
                        }
                        if (rowId) light(rowId);
                        showSuccess(UNDONE, UNDONE_DETAIL);
                    })();
                },
                { duration: UNDO_MS, description },
            );
        },
        [light],
    );

    const isHighlighted = useCallback((rowId: string) => lit.has(rowId), [lit]);

    /**
     * The rows to draw: those the filter passes, plus any changed since the
     * filter last changed that it would now hide, in their own place. A
     * held row stays highlighted until it goes.
     */
    const keep = useCallback(
        <Row>(
            rows: readonly Row[],
            {
                id,
                passes,
            }: { id: (row: Row) => string; passes: (row: Row) => boolean },
        ) => {
            const held = new Set<string>();
            const shown = rows.filter((row) => {
                if (passes(row)) return true;
                const rowId = id(row);
                if (!kept.has(rowId)) return false;
                held.add(rowId);
                return true;
            });
            return {
                rows: shown,
                highlighted: (rowId: string) =>
                    lit.has(rowId) || held.has(rowId),
            };
        },
        [kept, lit],
    );

    const clearKept = useCallback(() => setKept(new Set()), []);

    return { report, isHighlighted, keep, clearKept };
}
