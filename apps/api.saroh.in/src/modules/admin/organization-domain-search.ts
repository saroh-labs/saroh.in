import type { Prisma } from "@saroh/database";

/**
 * The renderer apexes a Saroh address can be typed under. The instance's own
 * (`siteRootDomain()`, which is `saroh.app.localhost` in development) is
 * passed in; `saroh.app` is always accepted too, because that is the address
 * a merchant reads out to support whichever console an operator is on.
 */
const ALWAYS_PLATFORM_ROOTS = ["saroh.app"];

export interface DomainSearchTerms {
    /** The term as a bare host: no scheme, path, port or trailing dot. */
    host: string;
    /** The Saroh address in it (`acme` of `acme.saroh.app`), when it has one. */
    address: string | null;
}

/**
 * Read a directory search term as a web address (#907): what an operator
 * pastes is often a link (`https://shop.acme.com/products`), a Saroh address
 * (`acme.saroh.app`) or the address alone (`acme`). Pure, so the rule is
 * pinned without a database.
 */
export function domainSearchTerms(
    raw: string,
    rootDomain: string,
): DomainSearchTerms {
    let host = raw.trim().toLowerCase();
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    host = host.split(/[/?#]/)[0] ?? "";
    host = host.split(":")[0] ?? "";
    host = host.replace(/\.$/, "").replace(/^www\./, "");

    const roots = [rootDomain.trim().toLowerCase(), ...ALWAYS_PLATFORM_ROOTS]
        .map((root) => root.replace(/\.$/, ""))
        .filter((root) => root.length > 0);
    for (const root of roots) {
        if (host.endsWith(`.${root}`)) {
            const label = host.slice(0, -(root.length + 1));
            // A test release's host names the same address (DEC-071).
            const address = label.replace(/^test--/, "");
            if (address.length > 0 && !address.includes(".")) {
                return { host, address };
            }
        }
    }
    return { host, address: host.includes(".") ? null : host };
}

/**
 * The directory's match on a business's web addresses: a claimed custom
 * domain (or claimed platform host) containing the term, or a site whose
 * Saroh address contains it. The setup address is `Organization.slug`, which
 * the name search already covers.
 */
export function domainSearchWhere(
    terms: DomainSearchTerms,
): Prisma.OrganizationWhereInput[] {
    if (terms.host.length === 0) return [];
    const or: Prisma.OrganizationWhereInput[] = [
        {
            domains: {
                some: {
                    hostname: { contains: terms.host, mode: "insensitive" },
                },
            },
        },
    ];
    if (terms.address) {
        or.push(
            {
                sites: {
                    some: {
                        subdomain: {
                            contains: terms.address,
                            mode: "insensitive",
                        },
                    },
                },
            },
            { slug: { equals: terms.address, mode: "insensitive" } },
        );
    }
    return or;
}
