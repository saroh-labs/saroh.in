import { env } from "../../env";

/**
 * Domain-hosting port (#859), beside {@link DomainVerifier}.
 *
 * Verification proves a business controls a hostname; hosting makes that
 * hostname serve its site. On Cloudflare for SaaS that is a custom hostname
 * on the merchant-sites zone (`saroh.app`): register it once the TXT check
 * passes, read its status, and delete it before the Domain row goes. A fake
 * (`providers/fake-hosting.ts`) drives the lifecycle in tests.
 *
 * Adapters never surface a credential or Cloudflare's raw body: a failed
 * call throws {@link HostingCallError} with the HTTP status and Cloudflare's
 * numeric error codes only, and the service puts the merchant's words on
 * the row.
 */

/**
 * Where a registered hostname stands at the host.
 * - PENDING: registered, waiting for the merchant's CNAME and the certificate.
 * - ACTIVE: serving, with an active certificate.
 * - FAILED: the host reports a problem the merchant (or we) must act on.
 */
export type HostedState = "PENDING" | "ACTIVE" | "FAILED";

/** Why a FAILED hostname failed: blocked by the host, or no certificate. */
export type HostedProblem = "BLOCKED" | "CERTIFICATE";

export interface HostedHostname {
    /** The host's id for the hostname (Cloudflare's custom-hostname id). */
    id: string;
    state: HostedState;
    /** Set when `state` is FAILED. */
    problem: HostedProblem | null;
}

/**
 * A hosting call that did not work. `REFUSED`: the host answered no and
 * would again (a 4xx); `UNKNOWN`: no answer, a timeout, a 5xx or a 429 —
 * it may have worked, so the caller looks before it acts again.
 */
export class HostingCallError extends Error {
    constructor(
        readonly kind: "REFUSED" | "UNKNOWN",
        readonly status: number | null,
        readonly codes: number[] = [],
    ) {
        super(
            `hosting call ${kind}${status === null ? "" : ` status=${status}`}${
                codes.length ? ` codes=${codes.join(",")}` : ""
            }`,
        );
        this.name = "HostingCallError";
    }
}

export interface DomainHosting {
    /**
     * Register `hostname`. Idempotent: a hostname the host already has is
     * looked up and returned, never registered twice.
     */
    register(hostname: string): Promise<HostedHostname>;
    /** The hostname's standing, or null when the host has no such id. */
    status(id: string): Promise<HostedHostname | null>;
    /**
     * Delete the hostname at the host: by `id` when known, else by looking
     * `hostname` up (a register whose answer was lost). One the host doesn't
     * have is a success.
     */
    remove(ref: { id: string | null; hostname: string }): Promise<void>;
}

/** DI token for the {@link DomainHosting} port; its value may be null (off). */
export const DOMAIN_HOSTING = Symbol("DOMAIN_HOSTING");

export interface HostingConfig {
    token: string;
    zoneId: string;
}

/**
 * The Cloudflare settings, or null when hosting is off — both are needed,
 * and one without the other is off too (and says which is missing).
 */
export function hostingConfig(): HostingConfig | null {
    const token = env.CLOUDFLARE_HOSTNAMES_TOKEN;
    const zoneId = env.CLOUDFLARE_HOSTNAMES_ZONE_ID;
    if (!token || !zoneId) return null;
    return { token, zoneId };
}

/** The CNAME target merchants point at, when the instance names one. */
export function hostingCnameTarget(): string | null {
    const target = env.CLOUDFLARE_HOSTNAMES_CNAME_TARGET?.trim();
    return target === undefined || target === "" ? null : target;
}
