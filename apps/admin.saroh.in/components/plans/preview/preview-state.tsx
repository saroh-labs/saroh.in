"use client";

import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react";

import { previewPricingAction } from "@/lib/pricing-actions";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";

/**
 * The two previews' state, shared by the header that holds their buttons
 * and the parts that show them (admin redesign U13, R18, R24):
 *
 * - the docked live preview beside the pricing table, shown or hidden.
 *   Hiding it is remembered in this browser (`localStorage`, every read and
 *   write guarded: a private window or blocked storage just shows it);
 * - the full-page preview: the public pricing page drawn from the saved
 *   draft, opened in a new tab through a short-lived token link. Why it
 *   couldn't open is said once, in the draft bar's one message.
 */

export const PREVIEW_HIDDEN_KEY = "saroh-admin:plans-preview-hidden";

function readHidden(): boolean {
    try {
        return window.localStorage.getItem(PREVIEW_HIDDEN_KEY) === "1";
    } catch {
        return false;
    }
}

function writeHidden(hidden: boolean): void {
    try {
        if (hidden) window.localStorage.setItem(PREVIEW_HIDDEN_KEY, "1");
        else window.localStorage.removeItem(PREVIEW_HIDDEN_KEY);
    } catch {
        // Not remembered; it still hides for this visit.
    }
}

/** Another tab's choice arrives as a `storage` event. */
function subscribeHidden(onChange: () => void): () => void {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
}

export interface PreviewState {
    /** The docked live preview is showing. */
    shown: boolean;
    setShown: (shown: boolean) => void;
    /** Open the full-page preview of the saved draft in a new tab. */
    openFull: () => Promise<void>;
    opening: boolean;
    /** Why the full-page preview didn't open; null when it did, or not tried. */
    fullError: string | null;
    clearFullError: () => void;
}

const PreviewContext = createContext<PreviewState | null>(null);

export function usePreview(): PreviewState {
    const state = useContext(PreviewContext);
    if (!state) throw new Error("usePreview is used outside PreviewProvider");
    return state;
}

export function PreviewProvider({ children }: { children: ReactNode }) {
    const { siteUrl } = usePlans();
    const { flush } = useDraft();
    // Shown on the server and the first paint (the server can't read this
    // browser's choice); the remembered choice follows on the client. What
    // is picked on this visit wins, so a browser that refuses to store it
    // still hides it until the page is left.
    const remembered = useSyncExternalStore(
        subscribeHidden,
        readHidden,
        () => false,
    );
    const [picked, setPicked] = useState<boolean | null>(null);
    const shown = picked ?? !remembered;
    const [opening, setOpening] = useState(false);
    const [fullError, setFullError] = useState<string | null>(null);

    const setShown = useCallback((next: boolean) => {
        setPicked(next);
        writeHidden(!next);
    }, []);

    const openFull = useCallback(async () => {
        setFullError(null);
        // Opened now, inside the click, so no popup blocker stops it; it is
        // pointed at the preview once the draft is saved and a link minted.
        const tab = window.open("about:blank", "_blank");
        setOpening(true);
        try {
            const { saved, revision } = await flush();
            if (!saved) {
                tab?.close();
                setFullError(
                    "The draft has to be saved before it can be previewed.",
                );
                return;
            }
            const r = await previewPricingAction(revision);
            if (!r.ok) {
                tab?.close();
                setFullError(r.error);
                return;
            }
            const url = `${siteUrl}/pricing/preview?token=${encodeURIComponent(r.data.token)}`;
            if (tab) {
                tab.opener = null;
                tab.location.href = url;
            } else {
                window.location.assign(url);
            }
        } finally {
            setOpening(false);
        }
    }, [flush, siteUrl]);

    const clearFullError = useCallback(() => setFullError(null), []);

    const value = useMemo(
        () => ({
            shown,
            setShown,
            openFull,
            opening,
            fullError,
            clearFullError,
        }),
        [shown, setShown, openFull, opening, fullError, clearFullError],
    );
    return (
        <PreviewContext.Provider value={value}>
            {children}
        </PreviewContext.Provider>
    );
}
