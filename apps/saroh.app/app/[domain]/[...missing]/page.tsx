import { notFound, permanentRedirect } from "next/navigation";

import { findRedirect, getSiteForPage, withQuery } from "@/lib/publication";

/**
 * An address on a merchant's site that no route draws (`/shop/a/b`,
 * `/anything/at/all`).
 *
 * Without this, an unmatched path skips `[domain]` altogether and lands on
 * the root 404, outside the site's header and footer, saying there is no
 * website here, which is wrong for a site that is live. Matched last (a
 * static or `[slug]` route always wins), it forwards an old page link
 * (KTD-3, 308) and otherwise hands the miss to `[domain]/not-found.tsx`,
 * inside the site's chrome, with a 404.
 */
export default async function MissingPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string; missing: string[] }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
    const { domain, missing } = await params;
    const resolved = await getSiteForPage(domain);
    const to = resolved
        ? findRedirect(resolved.snapshot, `/${missing.join("/")}`)
        : null;
    if (to) permanentRedirect(withQuery(to, await searchParams));
    notFound();
}
