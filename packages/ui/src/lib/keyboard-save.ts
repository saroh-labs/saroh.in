"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef } from "react";

/**
 * Saving from the keyboard, one rule for the whole app.
 *
 * - **Cmd/Ctrl+Enter** sends the form the keyboard is in: every sheet,
 *   dialog and full-page form. It presses the form's own submit button, so
 *   it does exactly what that button does and nothing it would refuse.
 * - **Cmd/Ctrl+S** saves in an editor (product, service, plan, pack, post),
 *   where there is one draft and no form around it.
 *
 * Plain Enter keeps its own rule (`frontend-forms.md`): it runs the form's
 * first submit button, which is the reversible one. Neither shortcut can
 * reach a step that can't be taken back (issuing an invoice is a
 * `type="button"`), because both go through the same submit.
 */

type KeyLike = Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** Cmd+Enter on a Mac, Ctrl+Enter elsewhere; either is taken on both. */
export function isModEnter(event: KeyLike): boolean {
    return (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
    );
}

/** Cmd+S or Ctrl+S, and not the browser's Save as (with Shift or Alt). */
export function isModS(event: KeyLike): boolean {
    return (
        (event.key === "s" || event.key === "S") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
    );
}

/**
 * `onKeyDown` for a `<form>`: Cmd/Ctrl+Enter submits it, as its submit
 * button would (validation and all). Does nothing for a key pressed in a
 * form nested inside this one.
 */
export function submitOnModEnter(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (!isModEnter(event)) return;
    const form = event.currentTarget;
    const from = event.target instanceof Element ? event.target : null;
    if (from && from.closest("form") !== form) return;
    event.preventDefault();
    form.requestSubmit();
}

/**
 * An editor's save on Cmd/Ctrl+S, and on Cmd/Ctrl+Enter too. `save` is the
 * editor's own (it already knows when there is nothing to save or
 * something to fix). Off while `enabled` is false, and while a dialog is
 * open over the editor, which has a save of its own.
 */
export function useSaveShortcut(save: () => void, enabled = true) {
    const latest = useRef(save);
    useEffect(() => {
        latest.current = save;
    }, [save]);
    useEffect(() => {
        if (!enabled) return;
        function onKeyDown(event: KeyboardEvent) {
            if (!isModS(event) && !isModEnter(event)) return;
            const from = event.target instanceof Element ? event.target : null;
            // A sheet or dialog over the editor answers for itself.
            if (from?.closest('[role="dialog"], [role="alertdialog"]')) return;
            if (isModEnter(event) && from?.closest("form")) return;
            event.preventDefault();
            latest.current();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [enabled]);
}
