import { apiFetch, getActiveOrgId, getList } from "@/lib/api/http";

/**
 * A merchant's own domain, as the api reports it (#200).
 *
 * The state shown anywhere is the api's: PENDING until DNS proves control,
 * VERIFIED after. Nothing here is optimistic — a domain the merchant has just
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
}

export type DomainsResult<T> =
    { ok: true; data: T } | { ok: false; error: string; status?: number };

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
): { error: string; status?: number } {
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
    return {
        error: detail ?? message ?? fallback,
        status:
            typeof err?.statusCode === "number" ? err.statusCode : undefined,
    };
}

/** The org's domains that belong to this site, newest first. */
export async function listSiteDomains(siteId: string): Promise<SiteDomain[]> {
    const base = await domainsBase();
    if (!base) return [];
    const all = await getList<SiteDomain>(base);
    return all.filter((d) => d.siteId === siteId);
}

export async function claimDomain(
    siteId: string,
    hostname: string,
): Promise<DomainsResult<SiteDomain>> {
    const base = await domainsBase();
    if (!base) return { ok: false, error: "No active organization." };
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
    return { ok: false, ...readError(data, "Could not add this domain.") };
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
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${domainId}/verify`, {
        method: "POST",
    });
    const data = (await res.json().catch(() => null)) as VerifyOutcome | null;
    if (res.ok && data?.domain) return { ok: true, data };
    return { ok: false, ...readError(data, "Could not check this domain.") };
}

export async function removeDomain(
    domainId: string,
): Promise<DomainsResult<{ id: string }>> {
    const base = await domainsBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${domainId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not remove this domain.") };
}
