"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { AskAiPage } from "@/lib/ask-ai/page-hints";

/**
 * The page Ask AI's panel is opened on (boards AF 1, 2, 5). A page says
 * what it is about by rendering `<AskAiPageIs page={…} />` with what it
 * already read; the panel, in the shell, reads it here. A page that says
 * nothing is the whole business. Nothing is read or asked to say it.
 */

let current: AskAiPage | null = null;
const listeners = new Set<() => void>();

function set(page: AskAiPage | null) {
    current = page;
    listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

/** The page open now, or null for one that says nothing of itself. */
export function useAskAiPage(): AskAiPage | null {
    return useSyncExternalStore(
        subscribe,
        () => current,
        () => null,
    );
}

export function AskAiPageIs({ page }: { page: AskAiPage }) {
    // By value: a server page sends a new object on every render.
    const key = JSON.stringify(page);
    useEffect(() => {
        const mine = JSON.parse(key) as AskAiPage;
        set(mine);
        return () => {
            if (current && JSON.stringify(current) === key) set(null);
        };
    }, [key]);
    return null;
}
