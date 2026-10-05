import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { declaredNodeEnv, env } from "../../env";
import { probeImage } from "./image-probe";
import type { LinkFacts, LinkReport } from "./link-report";
import { buildReport, factsFrom } from "./link-report";
import { decodeHtml, hasAnyTag, MAX_HTML_BYTES, parseHead } from "./og-parse";
import type { FetchDeps } from "./safe-fetch";
import { guardedFetch, nodeTransport } from "./safe-fetch";
import { checkTarget, systemResolver, testHostsFrom } from "./ssrf-guard";

/**
 * The link preview check (resources plan U2, KTD-3): fetch a page the
 * guarded way, read its head, probe its picture, and say what each app
 * would draw. Every way it can fail is a typed state; nothing here throws
 * to the controller, and the page's body never leaves this service.
 */

/** The whole page fetch, every redirect included. */
export const PAGE_TIMEOUT_MS = 5_000;
/** A check is kept this long per normalised address. */
export const CACHE_MS = 60_000;
const CACHE_MAX = 500;

export const LINK_PREVIEW_DEPS = Symbol("LINK_PREVIEW_DEPS");

export const FAILURES = [
    "invalid",
    "blocked",
    "unreachable",
    "not-html",
    "no-tags",
    "too-large",
    "timeout",
] as const;
export type LinkFailure = (typeof FAILURES)[number];

export type LinkCheck =
    | {
          ok: true;
          /** The address as checked: scheme added, fragment dropped. */
          url: string;
          checkedAt: string;
          facts: LinkFacts;
          report: LinkReport;
      }
    | {
          ok: false;
          url: string;
          checkedAt: string;
          failure: LinkFailure;
          /** The HTTP status, when the site answered with an error. */
          status?: number;
      };

/** How the tool introduces itself to the sites it reads. */
const USER_AGENT =
    "Mozilla/5.0 (compatible; SarohLinkPreview/1.0; +https://www.saroh.in/tools/link-preview)";

const PAGE_HEADERS = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-IN,en;q=0.9",
};

/** HTML by its type, or by its first bytes when the server named none. */
function isHtml(contentType: string | undefined, body: Buffer): boolean {
    if (contentType) return /html/i.test(contentType);
    const start = body
        .subarray(0, 1024)
        .toString("latin1")
        .trimStart()
        .toLowerCase();
    return (
        start.startsWith("<!doctype html") ||
        start.startsWith("<html") ||
        start.includes("<head")
    );
}

@Injectable()
export class LinkPreviewService {
    private readonly logger = new Logger(LinkPreviewService.name);
    private readonly deps: FetchDeps;
    private readonly cache = new Map<
        string,
        { at: number; value: LinkCheck }
    >();
    private readonly inflight = new Map<string, Promise<LinkCheck>>();

    constructor(
        @Optional() @Inject(LINK_PREVIEW_DEPS) deps?: Partial<FetchDeps>,
    ) {
        this.deps = {
            resolve: deps?.resolve ?? systemResolver,
            transport: deps?.transport ?? nodeTransport,
            testHosts:
                deps?.testHosts ??
                testHostsFrom(env.LINK_PREVIEW_TEST_HOSTS, [
                    declaredNodeEnv,
                    env.NODE_ENV,
                ]),
        };
    }

    /**
     * Check what someone typed. The same address within {@link CACHE_MS}
     * answers from the cache, and two checks of it at once share one fetch.
     */
    async check(raw: string, now: number = Date.now()): Promise<LinkCheck> {
        const checkedAt = new Date(now).toISOString();
        const target = checkTarget(raw, this.deps.testHosts);
        if (!target.ok) {
            return {
                ok: false,
                url: raw.trim().slice(0, 200),
                checkedAt,
                failure: target.failure === "blocked" ? "blocked" : "invalid",
            };
        }
        const key = target.url.href;

        const hit = this.cache.get(key);
        if (hit && now - hit.at < CACHE_MS) return hit.value;

        const running = this.inflight.get(key);
        if (running) return running;

        const work = this.run(target.url, checkedAt)
            .catch((error: unknown): LinkCheck => {
                // Not reachable by design; if it is, the visitor still gets a state.
                this.logger.error(
                    `link preview: check failed unexpectedly: ${String(error)}`,
                );
                return {
                    ok: false,
                    url: key,
                    checkedAt,
                    failure: "unreachable",
                };
            })
            .then((value) => {
                this.remember(key, value, now);
                return value;
            })
            .finally(() => this.inflight.delete(key));
        this.inflight.set(key, work);
        return work;
    }

    private remember(key: string, value: LinkCheck, now: number): void {
        if (this.cache.size >= CACHE_MAX) {
            for (const [k, entry] of this.cache) {
                if (now - entry.at >= CACHE_MS) this.cache.delete(k);
            }
            // Still full: the oldest go first (a Map keeps insertion order).
            while (this.cache.size >= CACHE_MAX) {
                const oldest = this.cache.keys().next().value;
                if (oldest === undefined) break;
                this.cache.delete(oldest);
            }
        }
        this.cache.set(key, { at: now, value });
    }

    private async run(url: URL, checkedAt: string): Promise<LinkCheck> {
        const key = url.href;
        const fail = (failure: LinkFailure, status?: number): LinkCheck => ({
            ok: false,
            url: key,
            checkedAt,
            failure,
            ...(status !== undefined && { status }),
        });

        const page = await guardedFetch(
            url,
            {
                maxBytes: MAX_HTML_BYTES,
                timeoutMs: PAGE_TIMEOUT_MS,
                headers: PAGE_HEADERS,
            },
            this.deps,
        );
        if (!page.ok) return fail(page.failure);
        if (page.status < 200 || page.status >= 300)
            return fail("unreachable", page.status);

        const contentType = page.headers["content-type"];
        if (!isHtml(contentType, page.body)) return fail("not-html");

        const tags = parseHead(
            decodeHtml(page.body, contentType),
            page.url.href,
        );
        if (!hasAnyTag(tags)) {
            // Cut off before the head ended: the tags may be past what we read.
            return fail(
                page.truncated && !tags.headEnded ? "too-large" : "no-tags",
            );
        }

        const imageUrl = tags.og.image ?? tags.twitter.image;
        const image = imageUrl
            ? await probeImage(
                  imageUrl,
                  tags.og.image
                      ? {
                            width: tags.og.imageWidth,
                            height: tags.og.imageHeight,
                            type: tags.og.imageType,
                        }
                      : { width: null, height: null, type: null },
                  this.deps,
                  { "User-Agent": USER_AGENT },
              )
            : null;

        const facts = factsFrom(tags, image, page.url, page.status);
        return {
            ok: true,
            url: key,
            checkedAt,
            facts,
            report: buildReport(facts),
        };
    }
}
