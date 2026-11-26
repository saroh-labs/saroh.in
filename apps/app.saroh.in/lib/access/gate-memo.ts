import { headers } from "next/headers";

import { GATE_EPOCH_COOKIE } from "@/lib/access/gate-epoch";
import { getActiveOrgId } from "@/lib/api/http";

/**
 * The gate's two answers (the person's membership row, `/me`, and the
 * business's modules) kept for a short while per person and business, so a
 * cold page's several `/api/*` reads, its document render and the moves
 * that follow ask the API once per window rather than once per request.
 *
 * Best-effort, never a security boundary: the API checks membership and
 * role on every data call, so a kept answer only shapes an early refusal or
 * which fields a role sees. It lives in this isolate's memory (OpenNext on
 * Workers reuses an isolate per location, never globally), so a miss is
 * always fine and nothing may depend on a hit.
 *
 * - Keyed by a SHA-256 of the session cookie (never the token itself) and
 *   the gate epoch cookie, plus the business id: two people, or one person
 *   in two businesses, never share an entry.
 * - Only a successful answer is kept: a refusal, outage or network failure
 *   is dropped, and the next ask reads again.
 * - Concurrent asks share one read in flight.
 * - A save that changes role, membership, modules or plan calls
 *   `forgetGate`: this isolate drops the business's entries. The browser
 *   sets a new epoch as its save lands (`afterSettingsSave`,
 *   `invalidateOrganizations`; `gate-epoch.ts`), so its next request in
 *   any isolate misses. A write the browser sends to the API itself gets
 *   a new epoch from the API (`apps/api.saroh.in/src/common/gate-epoch.ts`).
 *   Someone else's role changed is seen by them within `GATE_MEMO_TTL_MS`.
 */

/** How long an answer is kept: one short window of a person's clicks. */
export const GATE_MEMO_TTL_MS = 30_000;
/** Entries kept at most, the oldest used dropped first. */
export const GATE_MEMO_MAX = 500;
/**
 * How long an ask waits on another request's read in flight before reading
 * itself: on Workers that request can be cancelled (its tab closed), and
 * its read then never settles.
 */
const SHARE_WAIT_MS = 5_000;

type Kind = "me" | "modules";
interface Entry {
    at: number;
    org: string;
    value: Promise<unknown>;
    settled: boolean;
}

// On globalThis: one map per isolate even if a bundle holds two copies.
const store = globalThis as { __sarohGateMemo?: Map<string, Entry> };
const memo = (store.__sarohGateMemo ??= new Map<string, Entry>());

/** Every `*.session_token` cookie and the epoch, hashed; null signed out. */
async function sessionKey(): Promise<string | null> {
    const tokens: string[] = [];
    let epoch = "";
    for (const part of ((await headers()).get("cookie") ?? "").split(";")) {
        const at = part.indexOf("=");
        const name = part.slice(0, at).trim();
        const value = part.slice(at + 1).trim();
        if (name.endsWith(".session_token") && value) {
            tokens.push(`${name}=${value}`);
        }
        if (name === GATE_EPOCH_COOKIE) epoch = value;
    }
    if (tokens.length === 0) return null;
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${tokens.sort().join(";")}\n${epoch}`),
    );
    return Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

function keep(key: string, entry: Entry): void {
    memo.delete(key);
    memo.set(key, entry);
    while (memo.size > GATE_MEMO_MAX) {
        const oldest = memo.keys().next();
        if (oldest.done) break;
        memo.delete(oldest.value);
    }
}

/**
 * `read()`'s answer for this person and business, kept for
 * `GATE_MEMO_TTL_MS` once it succeeds. Signed out (no session cookie),
 * it is simply `read()`.
 */
export async function remembered<T>(
    orgId: string,
    kind: Kind,
    read: () => Promise<T>,
): Promise<T> {
    const session = await sessionKey();
    if (!session) return read();
    const key = `${session}:${orgId}:${kind}`;
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < GATE_MEMO_TTL_MS) {
        keep(key, hit);
        if (hit.settled) return hit.value as Promise<T>;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const own = new Promise<T>((resolve, reject) => {
            timer = setTimeout(() => {
                read().then(resolve, reject);
            }, SHARE_WAIT_MS);
        });
        // Its failure (perhaps that request's own, cancelled) isn't ours.
        const shared = (hit.value as Promise<T>).catch(() => read());
        return Promise.race([shared, own]).finally(() => clearTimeout(timer));
    }
    const value = read();
    const entry: Entry = { at: Date.now(), org: orgId, value, settled: false };
    keep(key, entry);
    value.then(
        () => {
            entry.settled = true;
        },
        // A failure is never kept.
        () => {
            if (memo.get(key) === entry) memo.delete(key);
        },
    );
    return value;
}

/**
 * Keep an answer already read another way (the document's business list
 * holds the person's row): only when nothing fresher is kept.
 */
export async function seedGate<T>(
    orgId: string,
    kind: Kind,
    value: T,
): Promise<void> {
    const session = await sessionKey();
    if (!session) return;
    const key = `${session}:${orgId}:${kind}`;
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < GATE_MEMO_TTL_MS) return;
    keep(key, {
        at: Date.now(),
        org: orgId,
        value: Promise.resolve(value),
        settled: true,
    });
}

/**
 * A save changed who may do what in this business, or what it runs (role,
 * membership, modules, plan): drop its kept answers in this isolate, for
 * everyone (other isolates: the browser's new epoch, `gate-epoch.ts`).
 * Never throws. Without `orgId`, the open business.
 */
export async function forgetGate(orgId?: string | null): Promise<void> {
    if (orgId === undefined) orgId = await getActiveOrgId().catch(() => null);
    if (orgId) {
        memo.forEach((entry, key) => {
            if (entry.org === orgId) memo.delete(key);
        });
    }
}

/** Forget after a save that worked; the save's answer is passed on. */
export async function forgetGateAfter<R extends { ok: boolean }>(
    res: R,
    orgId?: string | null,
): Promise<R> {
    if (res.ok) await forgetGate(orgId);
    return res;
}

/** Tests only: start empty. */
export function clearGateMemo(): void {
    memo.clear();
}
