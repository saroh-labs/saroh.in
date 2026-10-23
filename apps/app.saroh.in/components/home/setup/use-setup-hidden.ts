"use client";

import { useSyncExternalStore } from "react";

import {
    readSetupHidden,
    SETUP_HIDDEN_KEY,
    writeSetupHidden,
} from "@/lib/settings/ready";

/**
 * Whether "Finish setup" is hidden on Home for this business, in this
 * browser (A4: per person, per browser, default 123): Home's Hide for now
 * sets it, and Settings › Business's "Show setup on Home" clears it. One
 * store, so every reader moves at once; a browser that won't store it
 * still hides it for this visit.
 */

const HIDE_EVENT = "saroh:setup-hidden";
/** This visit's choice, for a browser whose storage refused it. */
const remembered = new Map<string, boolean>();

const storage = () => window.localStorage;

function subscribe(onChange: () => void) {
    const onStorage = (e: StorageEvent) => {
        if (e.key === SETUP_HIDDEN_KEY) onChange();
    };
    window.addEventListener(HIDE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(HIDE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

function isHidden(businessId: string) {
    return remembered.get(businessId) ?? readSetupHidden(storage, businessId);
}

export function setSetupHidden(businessId: string, hidden: boolean) {
    if (writeSetupHidden(storage, businessId, hidden)) {
        remembered.delete(businessId);
    } else {
        remembered.set(businessId, hidden);
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
}

/**
 * Whether setup is hidden. The server can't see the browser's storage, so
 * it answers "shown"; a hidden checklist steps aside after hydration.
 */
export function useSetupHidden(businessId: string): boolean {
    return useSyncExternalStore(
        subscribe,
        () => isHidden(businessId),
        () => false,
    );
}
