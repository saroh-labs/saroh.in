"use client";

import type { ToastId } from "@saroh/ui/toast";
import {
    dismissToast,
    settleUndo,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Hold } from "@/lib/hold-undo";
import { startHold } from "@/lib/hold-undo";

type Commit = () => Promise<void> | void;

/**
 * What a held send or cancel said once it ran. `said`: the caller has
 * already shown the refusal (on a field, or as a plan's notice), so no
 * toast repeats it.
 */
export type HeldResult =
    { ok: true } | { ok: false; error: string; said?: boolean };

/** Said while something that tells a customer waits its ten seconds. */
export const SENDING_SOON = "Sending in 10 seconds";

/** Said when a held send was refused, above the API's reason. */
export const NOT_SENT = "That wasn't sent.";

interface Held {
    hold: Hold;
    toast: ToastId;
}

/**
 * Hold a change for ten seconds before it is made (`lib/hold-undo.ts`),
 * with its Undo on a toast. The screen shows it as done at once; Undo
 * drops it with nothing written, which matters where there is no way
 * back: a message sent, a booking cancelled, a customer told.
 *
 * One rule (UX audit, 10 Oct): **anything that tells a customer something
 * waits ten seconds with Undo**. `send` is that rule with its words:
 * "Sending in 10 seconds", then "Sent to {name}.".
 *
 * Undo is offered twice: on the toast, and by `undo(key)` for the screen
 * to put beside the thing it changed (inside a modal sheet the toast
 * can't be reached until the sheet closes). `pending` lists what is held.
 * Either way `showUndo` says how it went, in its one wording.
 *
 * Leaving the page makes whatever is still held happen: the person saw it
 * done and did not press Undo.
 */
export function useHold() {
    const held = useRef(new Map<string, Held>());
    const [pending, setPending] = useState<readonly string[]>([]);

    useEffect(() => {
        const all = held.current;
        const flush = () => {
            for (const [key, h] of Array.from(all)) {
                all.delete(key);
                dismissToast(h.toast);
                void h.hold.leave();
            }
        };
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, []);

    const drop = useCallback((key: string, of: Hold) => {
        const now = held.current.get(key);
        // A newer hold may have taken the key.
        if (now?.hold !== of) return;
        held.current.delete(key);
        dismissToast(now.toast);
        setPending((keys) => keys.filter((k) => k !== key));
    }, []);

    const hold = useCallback(
        (
            key: string,
            message: string,
            commit: Commit,
            onUndo: () => void = () => undefined,
            options: { description?: string } = {},
        ) => {
            // The same thing changed again: the first change stands.
            void held.current.get(key)?.hold.replace();
            const h: Hold = startHold({
                commit: async () => {
                    await commit();
                },
                undo: onUndo,
                onChange: (state) => {
                    if (state.status === "held") return;
                    drop(key, h);
                },
            });
            const toast = showUndo(message, () => h.undo(), {
                description: options.description,
            });
            held.current.set(key, { hold: h, toast });
            setPending((keys) => [...keys.filter((k) => k !== key), key]);
        },
        [drop],
    );

    /** The screen's own Undo, beside the thing: the toast's, by key. */
    const undo = useCallback((key: string) => {
        const h = held.current.get(key);
        if (!h) return;
        void settleUndo(() => h.hold.undo());
    }, []);

    /**
     * Something that tells a customer: held, then sent. `run` makes the
     * call when the ten seconds are up, and its refusal is said here.
     */
    const send = useCallback(
        (
            key: string,
            options: {
                /** In place of "Sending in 10 seconds", for a cancel. */
                soon?: string;
                /** Who is told and where, under the line. */
                description?: string;
                run: () => Promise<HeldResult>;
                /** "Sent to Priya.", or how to say it once it has run. */
                sent: string | (() => string);
                /** A second line under it, such as what happens next. */
                sentDescription?: string;
                /** In place of "That wasn't sent.". */
                failed?: string;
                onSent?: () => void;
                /** Refused, or undone: put the screen back. */
                onBack?: () => void;
            },
        ) => {
            hold(
                key,
                options.soon ?? SENDING_SOON,
                async () => {
                    let res: HeldResult;
                    try {
                        res = await options.run();
                    } catch {
                        res = { ok: false, error: "" };
                    }
                    if (!res.ok) {
                        if (!res.said) {
                            showError(
                                options.failed ?? NOT_SENT,
                                res.error || undefined,
                            );
                        }
                        options.onBack?.();
                        return;
                    }
                    showSuccess(
                        typeof options.sent === "string"
                            ? options.sent
                            : options.sent(),
                        options.sentDescription,
                    );
                    options.onSent?.();
                },
                options.onBack,
                { description: options.description },
            );
        },
        [hold],
    );

    return { hold, send, undo, pending };
}
