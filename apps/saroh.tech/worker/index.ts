import hreflang from "@saroh/edition/hreflang";

/**
 * What must happen at the edge; everything else is a static file.
 *
 * - noindex on anything that isn't saroh.tech itself (previews, *.workers.dev)
 * - the India bar for CF-IPCountry IN, added by showing what the page carries,
 *   never a redirect, so pages stay static
 * - /r/{code}: sets the referral cookie and 302s home
 * - ?ref={code} on any page, the "Made with Saroh" credit's link: sets it too,
 *   on the domain the app shares, as saroh.in's page does (DEC-156)
 * - /region/hide: remembers the × for 90 days
 *
 * The header for app.saroh.tech comes with that app's deploy. saroh.app isn't
 * touched here: it also serves merchants' public websites, which must be found.
 */
interface Env {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
    /** Set on a development deploy: nobody without it gets in. */
    DEV_ACCESS_KEY?: string;
    DEV_ACCESS_COOKIE_DOMAIN?: string;
}

const CANONICAL_HOST = "saroh.tech";
const DAY = 86_400;
const HIDE_COOKIE = "saroh_region_bar";
const REFERRAL = /^\/r\/([A-Za-z0-9_-]{3,32})$/;
/** A business's code, the shape the app sends to the API (`carriedReferral`). */
const BUSINESS_CODE = /^[a-hj-km-np-z2-9]{8}$/;

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

/** The app reads this cookie as a business is made, so it can't stay on this host. */
function referralCookie(code: string, url: URL, env: Env): string {
    const domain =
        url.hostname === CANONICAL_HOST
            ? CANONICAL_HOST
            : env.DEV_ACCESS_COOKIE_DOMAIN?.trim();
    return `${cookie("saroh_ref", code, 90 * DAY, url.protocol === "https:")}${domain ? `; Domain=${domain}` : ""}`;
}

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

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

/**
 * `withDevAccess` from `@saroh/auth`, for a static site with no Next at the
 * edge: same parameter, cookie and digest, so one visit opens every dev app.
 * Null lets the request through.
 */
async function devGate(request: Request, env: Env): Promise<Response | null> {
    const key = env.DEV_ACCESS_KEY?.trim();
    if (!key) return null;
    const expected = await sha256Hex(key);
    const url = new URL(request.url);
    const given = url.searchParams.get("access");
    url.searchParams.delete("access");
    if (given !== null && (await sha256Hex(given)) === expected) {
        const domain = env.DEV_ACCESS_COOKIE_DOMAIN?.trim();
        return new Response(null, {
            status: 303,
            headers: {
                Location: url.toString(),
                "Set-Cookie": `saroh-dev-access=${expected}; Path=/; Max-Age=${30 * DAY}; HttpOnly; Secure; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`,
                "X-Robots-Tag": "noindex, nofollow",
            },
        });
    }
    const pass = (request.headers.get("cookie") ?? "")
        .split(";")
        .map((c) => c.trim())
        .includes(`saroh-dev-access=${expected}`);
    return pass
        ? null
        : new Response("Not found", {
              status: 404,
              headers: {
                  "Cache-Control": "no-store",
                  "X-Robots-Tag": "noindex, nofollow",
              },
          });
}

export async function handle(request: Request, env: Env): Promise<Response> {
    const shut = await devGate(request, env);
    if (shut) return shut;
    const url = new URL(request.url);
    const secure = url.protocol === "https:";

    const referral = REFERRAL.exec(url.pathname);
    if (referral) {
        return new Response(null, {
            status: 302,
            headers: {
                Location: "/",
                "Set-Cookie": referralCookie(referral[1], url, env),
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
    const ref = url.searchParams.get("ref")?.trim().toLowerCase();
    if (ref && BUSINESS_CODE.test(ref)) {
        response.headers.append("Set-Cookie", referralCookie(ref, url, env));
    }

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
