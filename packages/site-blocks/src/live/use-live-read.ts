"use client";

import { useEffect, useState } from "react";

import type { LiveReadStatus, LiveSnapshot } from "./live-state";
import {
    FRESH_FOR_MS,
    liveStatus,
    nextChangeIn,
    POLL_EVERY_MS,
    READ_TIMEOUT_MS,
} from "./live-state";

/**
 * Reads a live fact in the visitor's browser (DEC-172, plan U8, #1042),
 * never on the server: the page that holds it is cached and shared.
 *
 * ONE READ PER ADDRESS. Every fact on a page that reads the same address
 * (the hero's Next free and the Book bar's both read `today`) shares one
 * source: one request, one poll, one answer.
 *
 * IN VIEW ONLY. The source reads once when the first fact mounts, then
 * every {@link POLL_EVERY_MS} while the page is visible. When the page is
 * hidden it stops; when it is shown again it reads at once and starts
 * again. When the last fact unmounts it stops for good.
 *
 * `no-store`, like every public live read: the browser keeps nothing.
 */

interface Source {
    snap: LiveSnapshot;
    listeners: Set<() => void>;
    timer: ReturnType<typeof setInterval> | null;
    onVisibility: () => void;
}

const sources = new Map<string, Source>();

function visible(): boolean {
    return (
        typeof document === "undefined" || document.visibilityState !== "hidden"
    );
}

function emit(source: Source) {
    source.listeners.forEach((listener) => listener());
}

async function readOnce(url: string, source: Source): Promise<void> {
    if (source.snap.inFlight) return;
    source.snap = { ...source.snap, inFlight: true };
    emit(source);
    const abort =
        typeof AbortController === "undefined" ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), READ_TIMEOUT_MS);
    });
    let body: unknown;
    let ok = false;
    try {
        const answer = await Promise.race([
            fetch(url, {
                headers: { accept: "application/json" },
                cache: "no-store",
                signal: abort?.signal,
            }).then(async (res) => {
                if (!res.ok) return { ok: false as const };
                return {
                    ok: true as const,
                    body: (await res.json()) as unknown,
                };
            }),
            timedOut,
        ]);
        if (answer === "timeout") {
            abort?.abort();
        } else if (answer.ok) {
            ok = true;
            body = answer.body;
        }
    } catch {
        ok = false;
    } finally {
        clearTimeout(timer);
    }
    // The last fact went while this was on its way: nobody to tell.
    if (sources.get(url) !== source) return;
    source.snap = ok
        ? { data: body, fetchedAt: Date.now(), error: false, inFlight: false }
        : { ...source.snap, error: true, inFlight: false };
    emit(source);
}

function startPolling(url: string, source: Source) {
    if (source.timer !== null || !visible()) return;
    source.timer = setInterval(() => void readOnce(url, source), POLL_EVERY_MS);
}

function stopPolling(source: Source) {
    if (source.timer === null) return;
    clearInterval(source.timer);
    source.timer = null;
}

function subscribe(url: string, listener: () => void): () => void {
    let source = sources.get(url);
    if (!source) {
        const created: Source = {
            snap: { error: false, inFlight: false },
            listeners: new Set(),
            timer: null,
            onVisibility: () => {
                if (visible()) {
                    void readOnce(url, created);
                    startPolling(url, created);
                } else {
                    stopPolling(created);
                }
            },
        };
        source = created;
        sources.set(url, created);
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", created.onVisibility);
        }
        // A page opened in a background tab waits until it is shown.
        if (visible()) {
            void readOnce(url, created);
            startPolling(url, created);
        }
    }
    const kept = source;
    kept.listeners.add(listener);
    return () => {
        kept.listeners.delete(listener);
        if (kept.listeners.size > 0) return;
        stopPolling(kept);
        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", kept.onVisibility);
        }
        sources.delete(url);
    };
}

/** What a fact reads: its status, and the answer while it may show. */
export interface LiveRead<T> {
    status: LiveReadStatus;
    /** The answer, while fresh or stale; never while loading or failed. */
    data?: T;
    /** When the answer came (`Date.now()`), for "Checked 5:20 pm". */
    fetchedAt?: number;
}

const LOADING = { status: "loading" } as const;

/**
 * The live read at `url`, or null for none (no site here: the editor's
 * canvas, a fixture). `parse` narrows the answer: undefined is a bad
 * answer, and reads as failed.
 *
 * On the server, and on the first paint in the browser, it is always
 * loading: the cached HTML never carries a value.
 */
export function useLiveRead<T>(
    url: string | null,
    parse: (body: unknown) => T | undefined,
    { freshFor = FRESH_FOR_MS }: { freshFor?: number } = {},
): LiveRead<T> {
    // What the source said last, for the address it said it about.
    const [seen, setSeen] = useState<{
        url: string;
        snap: LiveSnapshot;
        now: number;
    } | null>(null);

    useEffect(() => {
        if (!url) return;
        const read = () => {
            const source = sources.get(url);
            if (source) setSeen({ url, snap: source.snap, now: Date.now() });
        };
        const unsubscribe = subscribe(url, read);
        read();
        return unsubscribe;
    }, [url]);

    const snap = seen?.url === url ? seen.snap : null;
    const now = seen?.now ?? 0;

    // A fresh answer turns stale by the clock alone: wake up when it does.
    useEffect(() => {
        if (!snap || !url) return;
        const wait = nextChangeIn(snap, now, freshFor);
        if (wait === null) return;
        const timer = setTimeout(
            () => setSeen({ url, snap, now: Date.now() }),
            wait,
        );
        return () => clearTimeout(timer);
    }, [snap, now, freshFor, url]);

    if (!url || !snap) return LOADING;
    const status = liveStatus(snap, now, freshFor);
    if (status === "loading" || status === "failed") return { status };
    const data = parse(snap.data);
    if (data === undefined) return { status: "failed" };
    return { status, data, fetchedAt: snap.fetchedAt };
}

/**
 * Read `url` again now, for a fact's Try again (U7): every fact sharing
 * the read hears the answer. Nothing while no fact reads it.
 */
export function refreshLiveRead(url: string | null): void {
    if (!url) return;
    const source = sources.get(url);
    if (source) void readOnce(url, source);
}

/** For tests: forget every source, as a fresh page would. */
export function resetLiveReads(): void {
    sources.forEach((source) => {
        stopPolling(source);
        if (typeof document !== "undefined") {
            document.removeEventListener(
                "visibilitychange",
                source.onVisibility,
            );
        }
    });
    sources.clear();
}
