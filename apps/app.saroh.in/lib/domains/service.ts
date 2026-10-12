import { apiFetch, getActiveOrgId, getList } from "@/lib/api/http";
import type { PlanRefusal } from "@/lib/billing/refusal";
import { planRefusalOf } from "@/lib/billing/refusal";

/**
 * A merchant's own domain, as the api reports it (#200).
 *
 * The state shown anywhere is the api's: PENDING until DNS proves control,
 * VERIFIED after, and once verified its `hosting` state (#859): not pointed
 * yet, live or a problem. Nothing here is optimistic — a domain the merchant has just
 * added is PENDING because that is what it is.
 */
export type DomainStatus = "PENDING" | "VERIFIED";

/** Why the last check did not pass. Three reasons, three different fixes. */
export type DomainCheckFailure = "NO_RECORD" | "WRONG_VALUE" | "LOOKUP_FAILED";

export interface SiteDomain {
    id: string;
    hostname: string;
    status: string;
    siteId: string | null;
    verifiedAt: string | null;
    lastCheckedAt: string | null;
    lastCheckResult: string | null;
    createdAt: string;
    /** The DNS TXT record to publish, exactly as a registrar wants it. */
    dnsRecord: { type: "TXT"; name: string; value: string };
    /**
     * Where the hostname stands with our hosting (#859). Absent from an api
     * before it, which reads as OFF. `lib/domains/domain-view.ts` turns it
     * into what the screen shows (#861).
     */
    hosting?: DomainHostingRead;
    /**
     * What the hostname is (DEC-140): a bare domain (`yourshop.in`), `www`
     * on one, or any other subdomain. Absent from an api before it.
     */
    hostnameKind?: "bare" | "www" | "subdomain" | (string & {});
    /**
     * For a `www` connection, its bare domain and where it stands. Null for
     * any other hostname. `lib/domains/bare-view.ts` turns it into words.
     */
    bare?: BareDomainRead | null;
    /**
     * Where the domain stands against the business's plan (DEC-139).
     * Absent from an api before it, and on a domain just added; both read
     * as `included`. `lib/domains/domain-plan.ts` words it.
     */
    plan?: DomainPlanRead;
}

/**
 * - FORWARDS: the bare domain sends visitors on to `www`.
 * - FORWARDS_HTTP_ONLY: it does, but `https://` on it fails.
 * - POINTS_HERE: its DNS reaches our hosting directly (an ALIAS or a
 *   flattened CNAME), so it can be added as a domain of its own.
 * - NOT_FORWARDING: none of these.
 *
 * Null until the api has looked. Free-form on the wire: an unknown value
 * reads as not looked at.
 */
export type BareState =
    "FORWARDS" | "FORWARDS_HTTP_ONLY" | "POINTS_HERE" | "NOT_FORWARDING";

export interface BareDomainRead {
    /** The bare domain: `yourshop.in` for `www.yourshop.in`. */
    hostname: string;
    /** Where it should forward: `https://www.yourshop.in`. */
    forwardTo: string;
    state: BareState | (string & {}) | null;
    checkedAt: string | null;
    /** The business has added the bare domain as a domain of its own. */
    added: boolean;
}

/**
 * - included: the plan includes the business's own domain, or no plan rule
 *   is enforced. Nothing to say.
 * - ending: the plan still includes it, and is known to end; the domain
 *   stops showing the site at `stopsAt`, 3 days after that end.
 * - grace: the plan no longer includes it; the domain shows the site until
 *   `stopsAt`.
 * - paused: the domain sends visitors to `sendsTo` since `stopsAt`. It is
 *   still connected, and shows the site again on a plan with a domain.
 *
 * Free-form on the wire: an unknown state says nothing.
 */
export interface DomainPlanRead {
    state: "included" | "ending" | "grace" | "paused" | (string & {});
    /** ISO; null while the plan includes the domain. */
    stopsAt: string | null;
    /** The site's Saroh address as a host ("yourshop.saroh.app"), or null. */
    sendsTo: string | null;
}

/**
 * - OFF: hosting isn't set up on this instance; the domain can still verify.
 * - WAITING_VERIFICATION: the TXT check hasn't passed yet.
 * - NOT_POINTED: verified, waiting for the CNAME and the certificate.
 * - LIVE: serving the site.
 * - PROBLEM: something is wrong; `problem` says what in words.
 *
 * Free-form on the wire, like `status`: an unknown value never reads as live.
 */
export type HostingState =
    "OFF" | "WAITING_VERIFICATION" | "NOT_POINTED" | "LIVE" | "PROBLEM";

export interface DomainHostingRead {
    state: HostingState | (string & {});
    /** What last went wrong, in the merchant's words; null when nothing did. */
    problem: string | null;
    /** When our hosting was last asked. */
    checkedAt: string | null;
    /** The CNAME to add so the domain reaches the site, when the api knows it. */
    dnsRecord: { type: "CNAME"; name: string; value: string } | null;
}

export type DomainsResult<T> =
    | { ok: true; data: T }
    | {
          ok: false;
          error: string;
          status?: number;
          /** The plan's refusal, when that is what stopped it (DEC-139). */
          plan?: PlanRefusal;
      };

async function domainsBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/domains` : null;
}

/**
 * The api's envelope: `{ error: { message, statusCode, details? } }`.
 *
 * A validation failure puts the useful sentence in `details` and only
 * "Validation failed" in `message` — which tells a merchant who typed a bad
 * hostname nothing at all. Prefer the field message when there is one.
 */
function readError(
    body: unknown,
    fallback: string,
): { error: string; status?: number; plan?: PlanRefusal } {
    const err = (
        body as {
            error?: {
                message?: unknown;
                statusCode?: unknown;
                details?: unknown;
            };
        } | null
    )?.error;
    const detail = Array.isArray(err?.details)
        ? err.details.find((d): d is string => typeof d === "string")
        : undefined;
    const message = typeof err?.message === "string" ? err.message : undefined;
    // A plan without its own domain refuses the way every plan refusal does
    // (DEC-139). Null while plans aren't shown (DEC-136): the sentence alone.
    const plan = planRefusalOf(err?.details, message);
    return {
        error: detail ?? message ?? fallback,
        status:
            typeof err?.statusCode === "number" ? err.statusCode : undefined,
        ...(plan ? { plan } : {}),
    };
}

/** The org's domains that belong to this site, newest first. */
export async function listSiteDomains(siteId: string): Promise<SiteDomain[]> {
    const base = await domainsBase();
    if (!base) return [];
    const all = await getList<SiteDomain>(base);
    return all.filter((d) => d.siteId === siteId);
}

/**
 * Every domain the business has, for Settings → Providers. `null` — not an
 * empty list — when they cannot be read (Website switched off answers 404),
 * so the page never says "no domains" about domains it did not see. Never
 * throws: the domains are a detail on that page, not what it is for.
 */
export async function listOrgDomains(): Promise<SiteDomain[] | null> {
    const base = await domainsBase();
    if (!base) return null;
    try {
        const res = await apiFetch(base);
        if (!res.ok) return null;
        return (await res.json()) as SiteDomain[];
    } catch {
        return null;
    }
}

export async function claimDomain(
    siteId: string,
    hostname: string,
): Promise<DomainsResult<SiteDomain>> {
    const base = await domainsBase();
    if (!base)
        return {
            ok: false,
            error: "No business is open. Choose one and try again.",
        };
    const res = await apiFetch(base, {
        method: "POST",
        body: JSON.stringify({ hostname, siteId }),
    });
    const data = (await res.json().catch(() => null)) as {
        domain?: Omit<SiteDomain, "dnsRecord">;
        dnsRecord?: SiteDomain["dnsRecord"];
    } | null;
    if (res.ok && data?.domain && data.dnsRecord) {
        return {
            ok: true,
            data: { ...data.domain, dnsRecord: data.dnsRecord },
        };
    }
    return { ok: false, ...readError(data, "Couldn't add this domain.") };
}

export interface VerifyOutcome {
    domain: Omit<SiteDomain, "dnsRecord">;
    verified: boolean;
    reason?: DomainCheckFailure;
}

export async function verifyDomain(
    domainId: string,
): Promise<DomainsResult<VerifyOutcome>> {
    const base = await domainsBase();
    if (!base)
        return {
            ok: false,
            error: "No business is open. Choose one and try again.",
        };
    const res = await apiFetch(`${base}/${domainId}/verify`, {
        method: "POST",
    });
    const data = (await res.json().catch(() => null)) as VerifyOutcome | null;
    if (res.ok && data?.domain) return { ok: true, data };
    return { ok: false, ...readError(data, "Couldn't check this domain.") };
}

export async function removeDomain(
    domainId: string,
): Promise<DomainsResult<{ id: string }>> {
    const base = await domainsBase();
    if (!base)
        return {
            ok: false,
            error: "No business is open. Choose one and try again.",
        };
    const res = await apiFetch(`${base}/${domainId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Couldn't remove this domain.") };
}
