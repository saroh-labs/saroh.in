"use client";

import type { ToastId } from "@saroh/ui/toast";
import {
    dismissToast,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useCallback, useEffect, useRef } from "react";

import type { HoldSlot } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";
import {
    undoBusinessLogo,
    undoOrganizationSettings,
} from "@/lib/organizations/settings-actions";
import type {
    OrganizationSettings,
    OrganizationSettingsInput,
    SettingsResult,
} from "@/lib/organizations/settings-service";
import { logoUndo, settingsUndo } from "@/lib/organizations/settings-undo";

/** What an Undo's save said: done, or refused with a sentence to show. */
export type UndoOutcome = { ok: true } | { ok: false; error: string };

/** Offer Undo on a save that landed, or just say it landed. */
export type OfferUndo = (
    message: string,
    undo: (() => Promise<UndoOutcome>) | null,
) => void;

/**
 * Undo on Settings › Business saves (F12, "Saroh Settings" design): the toast
 * says what changed, with Undo for ten seconds (`lib/hold-undo.ts`).
 *
 * The save has already happened; Undo saves the previous values back
 * (`settings-actions.ts`), so there is nothing to commit when the window
 * closes. One hold for the whole screen: a second save, or a card opened to
 * edit (`settle`), closes the last one's window, so there are never two
 * Undos for two different things. A refused Undo says why, and the save
 * stands.
 */
export function useSettingsUndo(): { offer: OfferUndo; settle: () => void } {
    const slotRef = useRef<HoldSlot | null>(null);

    // Leaving the page closes the window; nothing is left to commit.
    useEffect(() => () => void slotRef.current?.leave(), []);

    const settle = useCallback(() => {
        void slotRef.current?.commitNow();
    }, []);

    const offer = useCallback<OfferUndo>(
        (message, undo) => {
            if (!undo) {
                settle();
                showSuccess(message);
                return;
            }
            const slot = (slotRef.current ??= createHoldSlot());
            let refusal: string | null = null;
            let toastId: ToastId | null = null;
            const held = slot.start({
                undo: async () => {
                    const result = await undo();
                    if (!result.ok) {
                        refusal = result.error;
                        throw new Error(result.error);
                    }
                },
                onChange: (state) => {
                    if (state.status === "held" || state.status === "undoing") {
                        return;
                    }
                    if (toastId !== null) dismissToast(toastId);
                    if (state.status === "failed") {
                        showError(
                            refusal ?? "Couldn't undo that",
                            "What you saved is still saved.",
                        );
                    }
                },
            });
            toastId = showUndo(message, () => void held.undo(), {
                duration: HOLD_UNDO_MS,
            });
        },
        [settle],
    );

    return { offer, settle };
}

type Apply = (settings: OrganizationSettings) => void;

const outcome = (
    result: SettingsResult<OrganizationSettings>,
    apply: Apply,
): UndoOutcome => {
    if (!result.ok) return { ok: false, error: result.error };
    apply(result.data);
    return { ok: true };
};

/**
 * The Undo for a Business card's save, or `null` when a save can't put it
 * back (`settingsUndo`). `apply` shows what the Undo saved.
 */
export function cardUndo(
    before: OrganizationSettings,
    after: OrganizationSettings,
    sent: OrganizationSettingsInput,
    apply: Apply,
): (() => Promise<UndoOutcome>) | null {
    const undo = settingsUndo(before, after, sent);
    if (!undo) return null;
    return async () => outcome(await undoOrganizationSettings(undo), apply);
}

/** The Undo for a logo set or taken off, or `null` (`logoUndo`). */
export function logoCardUndo(
    before: OrganizationSettings,
    after: OrganizationSettings,
    apply: Apply,
): (() => Promise<UndoOutcome>) | null {
    const undo = logoUndo(before, after);
    if (!undo) return null;
    return async () => outcome(await undoBusinessLogo(undo), apply);
}
