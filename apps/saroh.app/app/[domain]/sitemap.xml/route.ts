import { getCatalogue } from "@/lib/catalogue";
import { requestOrigin, sitemapPaths, sitemapXml } from "@/lib/crawl";
import {
    getPublishedPosts,
    getSiteForHost,
    postsPrefix,
} from "@/lib/publication";

/**
 * A merchant site's `sitemap.xml` (#890), on the address it was asked on:
 * the published pages, the posts and, while the shop is open, its
 * products. Read live, so a publish or a new product shows at once. A
 * test release's host never reaches this route (the middleware 404s it),
 * and a host with no live site is a 404.
 */
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ domain: string }> },
) {
    const { domain } = await params;
    const origin = requestOrigin(request.headers);
    const site = origin ? await getSiteForHost(domain) : null;
    if (!origin || site?.mode !== "live") {
        return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    }

    const [posts, catalogue] = await Promise.all([
        site.siteId ? getPublishedPosts(site.siteId) : Promise.resolve([]),
        site.siteId ? getCatalogue(site.siteId) : Promise.resolve(null),
    ]);
    const paths = sitemapPaths({
        origin,
        pages: site.snapshot.pages,
        modules: site.modules,
        postsPrefix: postsPrefix(site.snapshot),
        postSlugs: posts.map((post) => post.slug),
        productSlugs:
            catalogue?.ok === true
                ? catalogue.data.products.map((product) => product.slug)
                : null,
    });
    return new Response(sitemapXml(origin, paths), {
        headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
