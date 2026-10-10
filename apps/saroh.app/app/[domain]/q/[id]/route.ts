import { serverApiUrl } from "@/lib/api-url";
import { requestOrigin } from "@/lib/crawl";
import { getSiteForHost } from "@/lib/publication";
import {
    qrCodeOf,
    qrRedirect,
    qrRedirectLocation,
    scanQrCode,
} from "@/lib/qr-resolve";
import { withRelayFrom } from "@/lib/relay-headers";

/**
 * A QR code's short link: `<address>/q/<code>`. The printed code holds this
 * address, never the page itself, so the page can move and the code can be
 * pointed somewhere new.
 *
 * A scan asks the API where the code goes, server to server with the
 * signed visitor relay (the API counts the scan), and forwards the phone
 * there with `?src=qr-<code>` on the address. The visitor is never shown an
 * error: if the API can't say, they land on the home page.
 *
 * - Only a live site has short links: a host with no published site is a
 *   404, like its pages, and so is a test release's host (nothing a tester
 *   opens is the business's scan).
 * - A code the site doesn't have is a 404.
 * - Never cached: every scan is a request, so every scan is counted. The
 *   page cache passes `/q` by (`lib/page-cache/request-rules.ts`).
 * - `HEAD` gets the same redirect and is not counted. It is declared
 *   because Next would otherwise answer it by running `GET`.
 */
export const dynamic = "force-dynamic";

interface Context {
    params: Promise<{ domain: string; id: string }>;
}

export function GET(request: Request, context: Context): Promise<Response> {
    return answer(request, context, false);
}

export function HEAD(request: Request, context: Context): Promise<Response> {
    return answer(request, context, true);
}

async function answer(
    request: Request,
    { params }: Context,
    head: boolean,
): Promise<Response> {
    const { domain, id } = await params;
    const origin = requestOrigin(request.headers);
    const code = qrCodeOf(id);
    if (!origin || !code) return notFound();
    const site = await getSiteForHost(domain);
    if (site?.mode !== "live" || !site.siteId) return notFound();

    const scan = await scanQrCode({
        apiUrl: serverApiUrl(),
        siteId: site.siteId,
        code,
        headers: withRelayFrom(request.headers, {}),
        userAgent: request.headers.get("user-agent"),
        head,
    });
    if (scan.kind === "missing") return notFound();
    return qrRedirect(qrRedirectLocation(origin, scan, code));
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
        },
    });
}
