/**
 * Where the middleware serves a tenant request: `/<host><path>`, keeping the
 * query it came with.
 *
 * `new URL(path, base)` drops the base's query, so a rewrite built that way
 * handed every server page an empty `searchParams`: the account's Track
 * (`/account/orders?order=…`) opened nothing, whatever the link said. A
 * module of its own so a unit test can reach it without the edge runtime.
 */
export function tenantUrl(hostname: string, url: URL): URL {
    const target = new URL(`/${hostname}${url.pathname}`, url);
    target.search = url.search;
    return target;
}
