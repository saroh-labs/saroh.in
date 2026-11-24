/**
 * Query keys (DEC-259). Every key that holds a business's data starts
 * `[domain, orgId, ...]` and is built only through {@link domainKey}, whose
 * branded type is the only one the app's query helpers accept: a key
 * without the organization fails the typecheck, so one business's rows can
 * never be read back as another's.
 */

declare const BRAND: unique symbol;

/** A business-scoped key: `[domain, orgId, kind, ...params]`. */
export type DomainKey = readonly [string, string, ...unknown[]] & {
    readonly [BRAND]: "DomainKey";
};

/** The one way to build a business-scoped key. */
export function domainKey(
    domain: string,
    orgId: string,
    ...rest: unknown[]
): DomainKey {
    if (!orgId) throw new Error(`domainKey("${domain}") needs an orgId`);
    return [domain, orgId, ...rest] as unknown as DomainKey;
}

/** Whether a cached key belongs to this business. */
export function isOrgKey(key: readonly unknown[], orgId: string): boolean {
    return key[1] === orgId;
}

/**
 * The person's businesses. The one key that isn't a business's: the list is
 * the person's, the same in every business (owner, 24 Nov 2026: fetched
 * once per full load, refreshed only when it changes).
 */
export const ORGANIZATIONS_KEY = ["organizations"] as const;
