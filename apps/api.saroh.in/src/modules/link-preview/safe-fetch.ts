import type {
    GuardFailure,
    GuardReason,
    Resolver,
    Transport,
} from "../../common/net/ssrf";
import { checkUrl, resolveTarget } from "../../common/net/ssrf";

export { nodeTransport } from "../../common/net/ssrf";
export type {
    Transport,
    TransportRequest,
    TransportResponse,
} from "../../common/net/ssrf";

/**
 * One guarded GET (resources plan U2, KTD-3): every hop checked by
 * `ssrf-guard.ts`, connected to the address that was checked, at most
 * {@link MAX_REDIRECTS} redirects, one deadline for the whole thing, and a
 * cap on the bytes read — after decompression, so a small compressed reply
 * can't unpack into a large one.
 */

export const MAX_REDIRECTS = 3;

export interface FetchDeps {
    resolve: Resolver;
    transport: Transport;
    testHosts: ReadonlySet<string>;
}

export interface FetchOptions {
    maxBytes: number;
    timeoutMs: number;
    headers: Record<string, string>;
}

export type FetchOutcome =
    | {
          ok: true;
          /** Where the last hop was: what the page's relative links resolve against. */
          url: URL;
          status: number;
          headers: Record<string, string | undefined>;
          body: Buffer;
          truncated: boolean;
      }
    | {
          ok: false;
          failure: GuardFailure;
          reason: GuardReason | "redirects" | "network";
      };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

class Deadline extends Error {}

/** Settle with the promise, or reject when the signal aborts first. */
function beforeDeadline<T>(
    promise: Promise<T>,
    signal: AbortSignal,
): Promise<T> {
    if (signal.aborted) return Promise.reject(new Deadline());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new Deadline());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(
                    error instanceof Error ? error : new Error(String(error)),
                );
            },
        );
    });
}

/**
 * GET `start` the guarded way. Never throws: every way it can go wrong is
 * a typed outcome.
 */
export async function guardedFetch(
    start: URL,
    options: FetchOptions,
    deps: FetchDeps,
): Promise<FetchOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const { signal } = controller;
    try {
        let url = start;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
            const target = checkUrl(url, deps.testHosts);
            if (!target.ok) return target;
            url = target.url;

            const resolved = await beforeDeadline(
                resolveTarget(url, deps.resolve, deps.testHosts),
                signal,
            );
            if (!resolved.ok) return resolved;

            const response = await beforeDeadline(
                deps.transport({
                    url,
                    pinned: resolved.pinned,
                    headers: options.headers,
                    maxBytes: options.maxBytes,
                    signal,
                }),
                signal,
            );

            const location = response.headers.location;
            if (REDIRECTS.has(response.status) && location) {
                if (hop === MAX_REDIRECTS) {
                    return {
                        ok: false,
                        failure: "unreachable",
                        reason: "redirects",
                    };
                }
                try {
                    url = new URL(location, url);
                } catch {
                    return {
                        ok: false,
                        failure: "unreachable",
                        reason: "redirects",
                    };
                }
                continue;
            }
            return { ok: true, url, ...response };
        }
        return { ok: false, failure: "unreachable", reason: "redirects" };
    } catch (error) {
        if (error instanceof Deadline || signal.aborted) {
            return { ok: false, failure: "timeout", reason: "network" };
        }
        return { ok: false, failure: "unreachable", reason: "network" };
    } finally {
        clearTimeout(timer);
    }
}
