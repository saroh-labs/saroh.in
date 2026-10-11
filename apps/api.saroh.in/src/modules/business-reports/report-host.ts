import { outsideOrgContext, prisma } from "@saroh/database";

import { classifySiteHost, siteRootDomain } from "../sites/site-host-mode";

const HOST_PATTERN =
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The host of a website address as a customer typed it ("shop.example.com",
 * "https://Shop.example.com/contact", "www.shop.in/"), lower-cased with no
 * port, path or final dot; null when it is not an address with a dot in it.
 */
export function reportHost(raw: string): string | null {
    const typed = raw.trim();
    if (!typed) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
        ? typed
        : `https://${typed}`;
    let host: string;
    try {
        const url = new URL(withScheme);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        host = url.hostname.toLowerCase();
    } catch {
        return null;
    }
    if (host.endsWith(".")) host = host.slice(0, -1);
    return HOST_PATTERN.test(host) ? host : null;
}

/**
 * The business behind a Saroh site at `host`, or null when it isn't one.
 *
 * The renderer's own rules (`classifySiteHost`): a host under the renderer's
 * root is a platform address, its first label the site's; anything else is a
 * custom hostname, which counts only when a VERIFIED Domain row binds it to
 * a site. A first label off the root is never read as an address, so
 * "kavi.example.com" can't land on the site at kavi.saroh.app. "www." is
 * tried bare too, since people type it. A test host (`test--x.saroh.app`)
 * names its site, which is the business responsible for it.
 *
 * Read across every business, outside any organization context: the caller
 * is an anonymous customer. A deleted site still names its business.
 */
export async function businessForHost(host: string): Promise<string | null> {
    const shaped = classifySiteHost(host, siteRootDomain());
    const lookup = shaped.lookup;
    if (!lookup) return null;
    return outsideOrgContext(async () => {
        if (lookup.by === "subdomain") {
            const site = await prisma.site.findUnique({
                where: { subdomain: lookup.subdomain },
                select: { organizationId: true },
            });
            return site?.organizationId ?? null;
        }
        const names = [lookup.hostname];
        if (lookup.hostname.startsWith("www.")) {
            names.push(lookup.hostname.slice(4));
        } else {
            names.push(`www.${lookup.hostname}`);
        }
        const domains = await prisma.domain.findMany({
            where: { hostname: { in: names }, status: "VERIFIED" },
            select: { organizationId: true },
            take: 1,
        });
        return domains[0]?.organizationId ?? null;
    });
}
