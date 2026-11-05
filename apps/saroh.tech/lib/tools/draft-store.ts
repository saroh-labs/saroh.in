"use client";

import { useCallback, useSyncExternalStore } from "react";

import { track } from "@/lib/analytics";

/**
 * A draft saved in this browser only. Storage can be missing or full (a private
 * window), so what's typed is also held in memory and the tool still works.
 */
const memory = new Map<string, string | null>();
const parsed = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Set<() => void>();
const used = new Set<string>();

function readRaw(key: string): string | null {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, raw: string | null) {
    memory.set(key, raw);
    try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
    } catch {
        // Kept in memory for this visit.
    }
    listeners.forEach((l) => l());
}

function read<T extends object>(key: string, fresh: () => T): T {
    const raw = readRaw(key);
    const hit = parsed.get(key);
    if (hit?.raw === raw) return hit.value as T;
    let value = fresh();
    if (raw) {
        try {
            const stored = JSON.parse(raw) as object | null;
            if (typeof stored === "object") {
                value = { ...value, ...stored };
            }
        } catch {
            // A broken draft is no draft.
        }
    }
    parsed.set(key, { raw, value });
    return value;
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export type Saved<T> = T & { savedAt?: string };

/**
 * `server` is what static HTML shows; `fresh` starts a new draft in the browser
 * (it can use today's date). Passing `tool` counts the first edit as tool_used.
 */
export function useDraft<T extends object>(
    key: string,
    server: T,
    fresh: () => T,
    tool?: string,
) {
    const value = useSyncExternalStore(
        subscribe,
        () => read<Saved<T>>(key, fresh),
        () => server as Saved<T>,
    );
    const update = useCallback(
        (change: Partial<T> | ((current: T) => Partial<T>)) => {
            const current = read<Saved<T>>(key, fresh);
            const patch =
                typeof change === "function" ? change(current) : change;
            const savedAt = new Date().toTimeString().slice(0, 5);
            write(key, JSON.stringify({ ...current, ...patch, savedAt }));
            if (tool && !used.has(tool)) {
                used.add(tool);
                track("tool_used", { tool });
            }
        },
        // `fresh` only ever matters for an empty draft.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [key, tool],
    );
    const clear = useCallback(() => write(key, null), [key]);
    return [value, update, clear] as const;
}

const SIGNUP_SHOWN = "saroh.tech.signup-moment";

/** True the first time only: the sign-up moment shows once, ever. */
export function firstSignupMoment(): boolean {
    if (readRaw(SIGNUP_SHOWN)) return false;
    write(SIGNUP_SHOWN, "1");
    return true;
}
