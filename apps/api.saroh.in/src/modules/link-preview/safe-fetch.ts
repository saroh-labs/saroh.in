import http from "node:http";
import https from "node:https";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

import type {
    GuardFailure,
    GuardReason,
    PinnedAddress,
    Resolver,
} from "./ssrf-guard";
import { checkUrl, pinnedLookup, resolveTarget } from "./ssrf-guard";

/**
 * One guarded GET (resources plan U2, KTD-3): every hop checked by
 * `ssrf-guard.ts`, connected to the address that was checked, at most
 * {@link MAX_REDIRECTS} redirects, one deadline for the whole thing, and a
 * cap on the bytes read — after decompression, so a small compressed reply
 * can't unpack into a large one.
 */

export const MAX_REDIRECTS = 3;

/** One request as the transport makes it. */
export interface TransportRequest {
    url: URL;
    pinned: PinnedAddress;
    headers: Record<string, string>;
    maxBytes: number;
    signal: AbortSignal;
}

/** What came back. A redirect's body is never read. */
export interface TransportResponse {
    status: number;
    headers: Record<string, string | undefined>;
    body: Buffer;
    /** The body was longer than `maxBytes`; reading stopped there. */
    truncated: boolean;
}

export type Transport = (
    request: TransportRequest,
) => Promise<TransportResponse>;

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

/** The body as sent, or decoded when the server compressed it anyway. */
function decoded(stream: Readable, encoding: string | undefined): Readable {
    switch ((encoding ?? "").trim().toLowerCase()) {
        case "gzip":
        case "x-gzip":
            return stream.pipe(zlib.createGunzip());
        case "deflate":
            return stream.pipe(zlib.createInflate());
        case "br":
            return stream.pipe(zlib.createBrotliDecompress());
        default:
            return stream;
    }
}

function flatHeaders(
    headers: http.IncomingHttpHeaders,
): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = Array.isArray(value)
            ? value.join(", ")
            : value;
    }
    return out;
}

/**
 * Node's own http and https, connecting only to the pinned address. No
 * shared agent: a pooled socket is never handed to another request.
 */
export const nodeTransport: Transport = (request) =>
    new Promise<TransportResponse>((resolve, reject) => {
        const client = request.url.protocol === "https:" ? https : http;
        const req = client.request(
            request.url,
            {
                method: "GET",
                headers: request.headers,
                lookup: pinnedLookup(request.pinned),
                agent: false,
                signal: request.signal,
            },
            (res) => {
                const status = res.statusCode ?? 0;
                const headers = flatHeaders(res.headers);
                if (status >= 300 && status < 400) {
                    res.destroy();
                    resolve({
                        status,
                        headers,
                        body: Buffer.alloc(0),
                        truncated: false,
                    });
                    return;
                }
                const body = decoded(res, headers["content-encoding"]);
                const chunks: Buffer[] = [];
                let size = 0;
                let settled = false;
                const finish = (truncated: boolean) => {
                    if (settled) return;
                    settled = true;
                    res.destroy();
                    if (body !== res) body.destroy();
                    resolve({
                        status,
                        headers,
                        body: Buffer.concat(chunks).subarray(
                            0,
                            request.maxBytes,
                        ),
                        truncated,
                    });
                };
                body.on("data", (chunk: Buffer) => {
                    chunks.push(chunk);
                    size += chunk.length;
                    if (size > request.maxBytes) finish(true);
                });
                body.on("end", () => finish(false));
                body.on("error", (error) => {
                    if (settled) return;
                    // A body cut short still has what arrived; a stream that
                    // failed before anything did is a failure.
                    if (size > 0) finish(false);
                    else {
                        settled = true;
                        reject(error);
                    }
                });
                res.on("error", (error) => {
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
                });
            },
        );
        req.on("error", reject);
        req.end();
    });
