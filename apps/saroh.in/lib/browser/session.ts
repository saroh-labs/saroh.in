"use client";

import { useEffect, useState } from "react";

import { browserEnv } from "./env";

/** Who is signed in, as the header shows them. */
export interface Visitor {
    name: string;
    email: string;
}

/**
 * The header's "who is signed in?" (owner, 1 Nov): one GET to the API's
 * Better Auth get-session with the shared cookie, after the page is idle.
 * No auth library: Better Auth's client is far bigger than this, and the
 * site cut its browser JS this week (`client-bundle.test.ts`). Any failure
 * is "signed out", which is what the page already shows.
 */
const KEY = "saroh:visitor";
// shortcut: a signed-out answer is kept too, so someone who signs in on
// accounts and comes back within this time still sees "Sign in"; shorten or
// clear it on the Sign in click if that is ever reported.
const TTL_MS = 2 * 60_000;

function authUrl(path: string): string | null {
    const api = browserEnv.SAROH_API_URL;
    return api ? `${api.replace(/\/$/, "")}/api/auth/${path}` : null;
}

interface Kept {
    at: number;
    visitor: Visitor | null;
}

/** The tab's kept answer, or undefined when there is none or it is stale. */
export function keptVisitor(now = Date.now()): Visitor | null | undefined {
    try {
        const raw = window.sessionStorage.getItem(KEY);
        if (!raw) return undefined;
        const kept = JSON.parse(raw) as Kept;
        return now - kept.at < TTL_MS ? kept.visitor : undefined;
    } catch {
        return undefined;
    }
}

function keep(visitor: Visitor | null) {
    try {
        window.sessionStorage.setItem(
            KEY,
            JSON.stringify({ at: Date.now(), visitor } satisfies Kept),
        );
    } catch {
        // Storage off (private window): the next page asks again.
    }
}

/** Asks the API. Null for signed out, and for anything that went wrong. */
export async function fetchVisitor(): Promise<Visitor | null> {
    const url = authUrl("get-session");
    if (!url) return null;
    try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) return null;
        const body = (await res.json()) as {
            user?: { name?: unknown; email?: unknown };
        } | null;
        const email = body?.user?.email;
        if (typeof email !== "string" || email === "") return null;
        const name = body?.user?.name;
        return {
            email,
            name: typeof name === "string" && name.trim() ? name.trim() : email,
        };
    } catch {
        return null;
    }
}

/** Ends the session; true once the API has. */
export async function signOutVisitor(): Promise<boolean> {
    const url = authUrl("sign-out");
    if (!url) return false;
    try {
        const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        if (res.ok) keep(null);
        return res.ok;
    } catch {
        return false;
    }
}

/** After the page is interactive: when the browser is idle, or 2s at most. */
function whenIdle(run: () => void): () => void {
    if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(run, { timeout: 2000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1);
    return () => window.clearTimeout(id);
}

/**
 * The signed-in visitor, or null. Null on the server and on the first
 * render, so the page's HTML is the signed-out header and hydrates as is;
 * the header swaps once the answer comes.
 */
export function useVisitor(): {
    visitor: Visitor | null;
    signOut: () => Promise<void>;
} {
    const [visitor, setVisitor] = useState<Visitor | null>(null);

    useEffect(() => {
        let live = true;
        const cancel = whenIdle(() => {
            const kept = keptVisitor();
            if (kept !== undefined) {
                setVisitor(kept);
                return;
            }
            void fetchVisitor().then((found) => {
                keep(found);
                if (live) setVisitor(found);
            });
        });
        return () => {
            live = false;
            cancel();
        };
    }, []);

    return {
        visitor,
        signOut: async () => {
            if (await signOutVisitor()) setVisitor(null);
        },
    };
}
