import { getSiteForHost } from "@/lib/publication";
import { noIconResponse, plainIconResponse } from "@/lib/site-icon";

/**
 * The plain icon of a site that has none of its own and no business logo
 * (DEC-120): a tile in the site's accent colour with its initial, drawn
 * from the published snapshot. The site's pages link to it
 * (`siteIconMetadata`). A host with no live site is a 404.
 *
 * Always the tile, whatever icon the site has now: a page kept a few
 * minutes may still link here after an icon was added, and a tile is a
 * truer answer for it than an error.
 */
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ domain: string }> },
) {
    const { domain } = await params;
    const site = await getSiteForHost(domain);
    if (!site) return noIconResponse();
    return plainIconResponse({
        name: site.snapshot.site.name,
        variables: site.snapshot.site.styleVariables,
    });
}
