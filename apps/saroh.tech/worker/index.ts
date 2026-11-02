import hreflang from "@saroh/edition/hreflang";

/**
 * What must happen at the edge; everything else is a static file.
 *
 * - noindex on anything that isn't saroh.tech itself (previews, *.workers.dev)
 * - the India bar for CF-IPCountry IN, added by showing what the page carries,
 *   never a redirect, so pages stay static
 * - /r/{code}: sets the referral cookie and 302s home
 * - /region/hide: remembers the × for 90 days
 *
 * The header for app.saroh.tech comes with that app's deploy. saroh.app isn't
 * touched here: it also serves merchants' public websites, which must be found.
 */
interface Env {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const CANONICAL_HOST = "saroh.tech";
const DAY = 86_400;
const HIDE_COOKIE = "saroh_region_bar";
const REFERRAL = /^\/r\/([A-Za-z0-9_-]{3,32})$/;

const SECURITY_HEADERS: Record<string, string> = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** The saroh.in page that does the same job, else its home. */
export function indiaHrefFor(path: string): string {
    const pair = hreflang.pairs.find((p) => p.tech === path);
    return `${hreflang.in}${pair ? pair.in : "/"}`;
}

const cookie = (name: string, value: string, maxAge: number, secure: boolean) =>
    `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;

const hasCookie = (request: Request, name: string) =>
    (request.headers.get("cookie") ?? "")
        .split(";")
        .some((c) => c.trim().startsWith(`${name}=`));

/** Only a path on this site, so the × can't be used to send someone elsewhere. */
function samePath(request: Request): string {
    const referer = request.headers.get("referer");
    if (!referer) return "/";
    try {
        const from = new URL(referer);
        return from.host === new URL(request.url).host ? from.pathname : "/";
    } catch {
        return "/";
    }
}

function withHeaders(response: Response, url: URL): Response {
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS))
        out.headers.set(k, v);
    if (url.hostname !== CANONICAL_HOST) {
        out.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return out;
}

export async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const secure = url.protocol === "https:";

    const referral = REFERRAL.exec(url.pathname);
    if (referral) {
        return new Response(null, {
            status: 302,
            headers: {
                Location: "/",
                "Set-Cookie": cookie(
                    "saroh_ref",
                    referral[1],
                    90 * DAY,
                    secure,
                ),
                "X-Robots-Tag": "noindex",
            },
        });
    }
    if (url.pathname === "/region/hide") {
        return new Response(null, {
            status: 302,
            headers: {
                Location: samePath(request),
                "Set-Cookie": cookie(HIDE_COOKIE, "1", 90 * DAY, secure),
                "X-Robots-Tag": "noindex",
            },
        });
    }

    const response = withHeaders(await env.ASSETS.fetch(request), url);
    const isHtml = response.headers
        .get("content-type")
        ?.startsWith("text/html");
    if (!isHtml) return response;

    const india = indiaHrefFor(url.pathname);
    const showBar =
        request.headers.get("cf-ipcountry") === "IN" &&
        !hasCookie(request, HIDE_COOKIE);
    return new HTMLRewriter()
        .on("[data-region-link]", {
            element(el) {
                el.setAttribute("href", india);
            },
        })
        .on("[data-region-bar]", {
            element(el) {
                if (showBar) el.removeAttribute("hidden");
            },
        })
        .transform(response);
}

export default { fetch: handle };
