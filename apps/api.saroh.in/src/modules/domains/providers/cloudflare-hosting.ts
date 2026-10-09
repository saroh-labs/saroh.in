import { Logger } from "@nestjs/common";

import { providerCallSignal } from "../../payments/providers/provider-call";
import type {
    DomainHosting,
    HostedHostname,
    HostedProblem,
    HostingConfig,
} from "../domain-hosting";
import { HostingCallError } from "../domain-hosting";

/**
 * Cloudflare for SaaS adapter (#859): custom hostnames on one zone.
 *
 * - register → `POST /zones/:zone/custom_hostnames` with an HTTP-validated
 *   DV certificate (the merchant's CNAME to the fallback origin is what
 *   proves it, as tried by hand on 7 Oct). A refusal is looked up by
 *   hostname first, so a hostname Cloudflare already has (a retry after a
 *   lost answer, or "Duplicate custom hostname found") is adopted.
 * - status → `GET /zones/:zone/custom_hostnames/:id`; a 404 is null.
 * - remove → `DELETE /zones/:zone/custom_hostnames/:id`; a 404 is done.
 *
 * Every call has a deadline (`providerCallSignal`, 15 s). Errors keep only
 * the HTTP status and Cloudflare's numeric error codes; the token and the
 * response body never leave this file.
 */

const API = "https://api.cloudflare.com/client/v4";

/** The part of Cloudflare's custom-hostname object this adapter reads. */
interface CustomHostname {
    id: string;
    hostname: string;
    status?: string;
    ssl?: { status?: string } | null;
}

interface Envelope<T> {
    success?: boolean;
    errors?: { code?: number }[];
    result?: T;
}

/** Hostname statuses that mean Cloudflare won't serve it as it stands. */
const BLOCKED_STATUSES = new Set([
    "blocked",
    "pending_blocked",
    "moved",
    "deleted",
    "pending_deletion",
    "test_blocked",
    "test_failed",
]);

/** Certificate statuses that won't become active without a change. */
const CERTIFICATE_FAILED = new Set([
    "validation_timed_out",
    "issuance_timed_out",
    "deployment_timed_out",
    "initializing_timed_out",
    "expired",
    "deleted",
    "inactive",
]);

/** Cloudflare's custom hostname → where it stands (exported for tests). */
export function readHostname(raw: CustomHostname): HostedHostname {
    const status = raw.status ?? "pending";
    const ssl = raw.ssl?.status ?? "";
    let problem: HostedProblem | null = null;
    if (BLOCKED_STATUSES.has(status)) problem = "BLOCKED";
    else if (CERTIFICATE_FAILED.has(ssl)) problem = "CERTIFICATE";
    if (problem) return { id: raw.id, state: "FAILED", problem };
    const active = status === "active" && ssl === "active";
    return { id: raw.id, state: active ? "ACTIVE" : "PENDING", problem: null };
}

export class CloudflareDomainHosting implements DomainHosting {
    private readonly logger = new Logger(CloudflareDomainHosting.name);

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);

    constructor(private readonly config: HostingConfig) {}

    async register(hostname: string): Promise<HostedHostname> {
        try {
            const created = await this.call<CustomHostname>(
                "POST",
                "/custom_hostnames",
                { hostname, ssl: { method: "http", type: "dv" } },
            );
            return readHostname(this.expect(created));
        } catch (err) {
            // Refused or unanswered, Cloudflare may already have it (a
            // duplicate, or our first try worked and its answer was lost).
            // Adopt that one rather than fail or register twice.
            if (!(err instanceof HostingCallError)) throw err;
            const existing = await this.find(hostname).catch(() => null);
            if (existing) return readHostname(existing);
            throw err;
        }
    }

    async status(id: string): Promise<HostedHostname | null> {
        try {
            const found = await this.call<CustomHostname>(
                "GET",
                `/custom_hostnames/${encodeURIComponent(id)}`,
            );
            return readHostname(this.expect(found));
        } catch (err) {
            if (err instanceof HostingCallError && err.status === 404) {
                return null;
            }
            throw err;
        }
    }

    async remove(ref: { id: string | null; hostname: string }): Promise<void> {
        const id = ref.id ?? (await this.find(ref.hostname))?.id ?? null;
        if (!id) return;
        try {
            await this.call<unknown>(
                "DELETE",
                `/custom_hostnames/${encodeURIComponent(id)}`,
            );
        } catch (err) {
            // Already gone at Cloudflare: the goal is met.
            if (err instanceof HostingCallError && err.status === 404) return;
            throw err;
        }
    }

    /** The custom hostname Cloudflare has for `hostname`, or null. */
    private async find(hostname: string): Promise<CustomHostname | null> {
        const list = await this.call<CustomHostname[]>(
            "GET",
            `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
        );
        return (list ?? []).find((h) => h.hostname === hostname) ?? null;
    }

    private expect(found: CustomHostname | undefined): CustomHostname {
        if (!found?.id) throw new HostingCallError("UNKNOWN", null);
        return found;
    }

    private async call<T>(
        method: "GET" | "POST" | "DELETE",
        path: string,
        body?: unknown,
    ): Promise<T | undefined> {
        const url = `${API}/zones/${this.config.zoneId}${path}`;
        let res: Response;
        try {
            res = await this.fetchFn(url, {
                method,
                headers: {
                    authorization: `Bearer ${this.config.token}`,
                    ...(body === undefined
                        ? {}
                        : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: providerCallSignal(),
            });
        } catch {
            // A dropped connection or the deadline: it may have worked.
            throw new HostingCallError("UNKNOWN", null);
        }
        const json = (await res.json().catch(() => null)) as Envelope<T> | null;
        const codes = (json?.errors ?? [])
            .map((e) => e.code)
            .filter((c): c is number => typeof c === "number");
        if (!res.ok || json?.success === false) {
            const kind =
                res.status >= 500 || res.status === 429 || res.ok
                    ? "UNKNOWN"
                    : "REFUSED";
            this.logger.warn(
                `cloudflare_hostnames_call_failed method=${method} status=${res.status} codes=${codes.join(",") || "-"}`,
            );
            throw new HostingCallError(kind, res.status, codes);
        }
        return json?.result;
    }
}
