import { requestOrigin, robotsTxt } from "@/lib/crawl";
import { getSiteForHost } from "@/lib/publication";

/**
 * A merchant site's `robots.txt` (#890): crawl everything but the private
 * pages, and here is the sitemap. A test release's host never reaches this
 * route; the middleware answers it with "disallow everything". A host with
 * no live site is a 404, like its pages.
 */
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ domain: string }> },
) {
    const { domain } = await params;
    const origin = requestOrigin(request.headers);
    const site = origin ? await getSiteForHost(domain) : null;
    if (!origin || site?.mode !== "live") return notFound();
    return new Response(robotsTxt(origin), {
        headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
    });
}
