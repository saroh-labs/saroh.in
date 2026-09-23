"use client";

import { showUndo } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

/** As long as the Undo toast stays up (`showUndo`). */
export const HOLD_MS = 8000;

type Commit = () => Promise<void> | void;

interface Held {
    timer: ReturnType<typeof setTimeout>;
    commit: Commit;
    undo: () => void;
}

/**
 * Hold a change for the length of its Undo toast before sending it (the
 * design's "cancel with Undo"). The screen shows it as done at once; Undo
 * drops it without anything having been written, which matters where the
 * API has no way back — a cancelled booking cannot be un-cancelled.
 *
 * Undo is offered twice: in the toast, and by `undo(key)` for the screen to
 * put beside the thing it changed — inside a modal sheet the toast cannot be
 * reached, by pointer or keyboard, until the sheet closes.
 *
 * Leaving the page sends whatever is still held, so a change the person saw
 * happen is not quietly lost; only Undo takes one back.
 */
export function useHeld() {
    const held = useRef(new Map<string, Held>());
    const [pending, setPending] = useState<readonly string[]>([]);

    useEffect(() => {
        const all = held.current;
        const flush = () => {
            for (const [key, h] of Array.from(all)) {
                clearTimeout(h.timer);
                all.delete(key);
                void h.commit();
            }
        };
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, []);

    const drop = (key: string) => {
        held.current.delete(key);
        setPending((keys) => keys.filter((k) => k !== key));
    };

    function undo(key: string) {
        const h = held.current.get(key);
        if (!h) return;
        clearTimeout(h.timer);
        drop(key);
        h.undo();
    }

    function hold(
        key: string,
        message: string,
        commit: Commit,
        onUndo: () => void,
    ) {
        const timer = setTimeout(() => {
            drop(key);
            void commit();
        }, HOLD_MS);
        held.current.set(key, { timer, commit, undo: onUndo });
        setPending((keys) => [...keys.filter((k) => k !== key), key]);
        showUndo(message, () => undo(key));
    }

    return { hold, undo, pending };
}
