import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import http from "node:http";
import https from "node:https";

import { env } from "../../env";
import type { Transport } from "../link-preview/safe-fetch";
import type { Resolver } from "../link-preview/ssrf-guard";
import {
    checkUrl,
    DNS_TIMEOUT_MS,
    pinnedLookup,
    resolveTarget,
    systemResolver,
} from "../link-preview/ssrf-guard";
import { domainFakesOn } from "./domain-fakes";
import { hostingCnameTarget } from "./domain-hosting";

/**
 * Where the bare domain of a `www.` connection stands (DEC-140).
 *
 * A business connects `www.example.com` and forwards `example.com` to it at
 * its provider. Saroh cannot set that up for them, so this looks from the
 * outside and says what a visitor who types the bare domain gets:
 *
 * - FORWARDS: `example.com` sends them on to `www.example.com`.
 * - FORWARDS_HTTP_ONLY: it does over `http://` only. `https://example.com`
 *   fails or goes elsewhere (the provider's forwarder has no certificate
 *   for the domain), so a browser warns.
 * - POINTS_HERE: its DNS answers with the hosting's own addresses, as an
 *   ALIAS, ANAME or flattened CNAME to the target does. Forwarding isn't
 *   needed; the bare domain can be connected as itself.
 * - NOT_FORWARDING: anything else, a name with no DNS included.
 *
 * The bare domain is a host a merchant typed, so every request here goes
 * through the link-preview guard (`ssrf-guard.ts`): only public addresses,
 * only web ports, the connection pinned to the address that was checked,
 * and each redirect checked the same way. Bodies are never read: a redirect
 * is all in its headers.
 */
export type BareStatus =
    "FORWARDS" | "FORWARDS_HTTP_ONLY" | "POINTS_HERE" | "NOT_FORWARDING";

export const BARE_STATUSES: readonly BareStatus[] = [
    "FORWARDS",
    "FORWARDS_HTTP_ONLY",
    "POINTS_HERE",
    "NOT_FORWARDING",
];

export interface BareDomainCheck {
    /**
     * Whether `bare`'s DNS answers with the hosting's addresses. Never
     * throws: a name that can't be looked up doesn't point here.
     */
    pointsHere(bare: string): Promise<boolean>;
    /** Where `bare` stands for its `www` address. Never throws. */
    forwarding(bare: string, www: string): Promise<BareStatus>;
}

/** DI token for the {@link BareDomainCheck}; its value may be null (off). */
export const BARE_DOMAIN_CHECK = Symbol("BARE_DOMAIN_CHECK");

/** Redirects followed from the bare domain before giving up. */
export const MAX_FORWARD_REDIRECTS = 2;

/** One deadline for each of the two looks (http and https), start to end. */
export const FORWARD_TIMEOUT_MS = 3_000;

/** What one look at `http://bare/` or `https://bare/` found. */
type Probe = "www" | "elsewhere";

export interface BareCheckDeps {
    resolve: Resolver;
    transport: Transport;
    /** The CNAME target businesses point at, or null when none is named. */
    target: () => string | null;
    timeoutMs: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const HEADERS = {
    accept: "*/*",
    "user-agent": "SarohDomainCheck/1.0 (+https://saroh.in)",
};

/** A host as compared: lower-case, no final dot. */
function plain(host: string): string {
    return host.trim().toLowerCase().replace(/\.$/, "");
}

/** `promise`, or a rejection once `ms` have passed. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class NetworkBareDomainCheck implements BareDomainCheck {
    private readonly deps: BareCheckDeps;

    constructor(deps: Partial<BareCheckDeps> = {}) {
        this.deps = {
            resolve: deps.resolve ?? systemResolver,
            transport: deps.transport ?? headersOnlyTransport,
            target: deps.target ?? hostingCnameTarget,
            timeoutMs: deps.timeoutMs ?? FORWARD_TIMEOUT_MS,
        };
    }

    async pointsHere(bare: string): Promise<boolean> {
        const target = this.deps.target();
        if (!target) return false;
        try {
            const [own, ours] = await Promise.all([
                within(this.deps.resolve(plain(bare)), DNS_TIMEOUT_MS + 200),
                within(this.deps.resolve(plain(target)), DNS_TIMEOUT_MS + 200),
            ]);
            const hosting = new Set(ours.map((a) => plain(a.address)));
            return own.some((a) => hosting.has(plain(a.address)));
        } catch {
            return false;
        }
    }

    async forwarding(bare: string, www: string): Promise<BareStatus> {
        if (await this.pointsHere(bare)) return "POINTS_HERE";
        const [plainHttp, secure] = await Promise.all([
            this.probe("http", bare, www),
            this.probe("https", bare, www),
        ]);
        // The secure address is the one a browser tries first, so it
        // working is the whole of "forwards".
        if (secure === "www") return "FORWARDS";
        if (plainHttp === "www") return "FORWARDS_HTTP_ONLY";
        return "NOT_FORWARDING";
    }

    /**
     * Ask `scheme://bare/` and follow its redirects, at most
     * {@link MAX_FORWARD_REDIRECTS}, until one names the `www` host. That
     * address is never requested: being sent there is the answer.
     */
    private async probe(
        scheme: "http" | "https",
        bare: string,
        www: string,
    ): Promise<Probe> {
        const wanted = plain(www);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs);
        const { signal } = controller;
        const aborted = new Promise<never>((_, reject) => {
            signal.addEventListener(
                "abort",
                () => reject(new Error("timeout")),
                { once: true },
            );
        });
        // Nothing waits on it once the look is over.
        aborted.catch(() => undefined);
        try {
            let url = new URL(`${scheme}://${plain(bare)}/`);
            for (let hop = 0; hop <= MAX_FORWARD_REDIRECTS; hop += 1) {
                const target = checkUrl(url);
                if (!target.ok) return "elsewhere";
                url = target.url;
                const resolved = await Promise.race([
                    resolveTarget(url, this.deps.resolve),
                    aborted,
                ]);
                if (!resolved.ok) return "elsewhere";
                const response = await Promise.race([
                    this.deps.transport({
                        url,
                        pinned: resolved.pinned,
                        headers: HEADERS,
                        maxBytes: 0,
                        signal,
                    }),
                    aborted,
                ]);
                const location = response.headers.location;
                if (!REDIRECTS.has(response.status) || !location) {
                    return "elsewhere";
                }
                let next: URL;
                try {
                    next = new URL(location, url);
                } catch {
                    return "elsewhere";
                }
                if (plain(next.hostname) === wanted) return "www";
                url = next;
            }
            return "elsewhere";
        } catch {
            // No answer, a refused connection, a certificate that isn't
            // the domain's, or the deadline.
            return "elsewhere";
        } finally {
            clearTimeout(timer);
            controller.abort();
        }
    }
}

/**
 * One GET whose answer is its status line and headers. The socket is
 * closed as soon as they arrive, so no body is read, whatever the host
 * sends. Connects only to the pinned, checked address, with no shared
 * agent, as the link preview's transport does.
 */
export const headersOnlyTransport: Transport = (request) =>
    new Promise((resolve, reject) => {
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
                const location = res.headers.location;
                res.destroy();
                resolve({
                    status: res.statusCode ?? 0,
                    headers: { location },
                    body: Buffer.alloc(0),
                    truncated: false,
                });
            },
        );
        req.on("error", reject);
        req.end();
    });

/**
 * Deterministic {@link BareDomainCheck} for tests: answers what it was
 * told per bare domain, NOT_FORWARDING otherwise, and records its calls.
 */
export class FakeBareDomainCheck implements BareDomainCheck {
    private readonly pointing = new Map<string, boolean>();
    private readonly statuses = new Map<string, BareStatus>();
    readonly calls: { op: "pointsHere" | "forwarding"; bare: string }[] = [];

    /** `bare`'s DNS reaches the hosting (an ALIAS or flattened CNAME). */
    setPointsHere(bare: string, on = true): void {
        this.pointing.set(bare, on);
    }

    setStatus(bare: string, status: BareStatus): void {
        this.statuses.set(bare, status);
    }

    pointsHere(bare: string): Promise<boolean> {
        this.calls.push({ op: "pointsHere", bare });
        return Promise.resolve(this.pointing.get(bare) === true);
    }

    forwarding(bare: string): Promise<BareStatus> {
        this.calls.push({ op: "forwarding", bare });
        if (this.pointing.get(bare) === true) {
            return Promise.resolve("POINTS_HERE");
        }
        return Promise.resolve(this.statuses.get(bare) ?? "NOT_FORWARDING");
    }
}

const logger = new Logger("BareDomainCheck");

/**
 * The check for this instance, or null (off): under the test-only domain
 * fakes and under test nothing here may reach DNS or the network. Off, a
 * bare domain is always connected through `www`, and no forwarding state
 * is recorded.
 */
export function createBareDomainCheck(): BareDomainCheck | null {
    if (domainFakesOn() || env.NODE_ENV === "test") {
        logger.log(
            "bare_domain_check_off: bare domains are not looked at here (test)",
        );
        return null;
    }
    return new NetworkBareDomainCheck();
}

/** Nest provider exposing the check (or null, off) under {@link BARE_DOMAIN_CHECK}. */
export const bareDomainCheckProvider: Provider = {
    provide: BARE_DOMAIN_CHECK,
    useFactory: createBareDomainCheck,
};
