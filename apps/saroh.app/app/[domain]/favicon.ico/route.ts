import { getSiteForHost } from "@/lib/publication";
import { faviconResponse, noIconResponse } from "@/lib/site-icon";

/**
 * `/favicon.ico` on a merchant's address (DEC-120). Browsers ask for this
 * path on their own, so it answers with that site's icon: a forward to its
 * own image or the business logo, or the plain tile with its initial. A
 * host with no live site is a 404, like its pages. This app ships no icon
 * file, so what is served here is never Saroh's mark, or anyone else's.
 *
 * The middleware names this path in its matcher, past the dotted-path
 * rule; a test release's host passes its gate first and shows the
 * release's icon.
 */
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ domain: string }> },
) {
    const { domain } = await params;
    const site = await getSiteForHost(domain);
    if (!site) return noIconResponse();
    return faviconResponse(site.icon, {
        name: site.snapshot.site.name,
        variables: site.snapshot.site.styleVariables,
    });
}
