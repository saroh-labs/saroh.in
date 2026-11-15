/**
 * The docs are static files (`next build` writes out/). This is only what
 * must happen at the edge, as apps/saroh.tech/worker does:
 *
 * - a development deploy sits behind the access key (`DEV_ACCESS_KEY`):
 *   without it, a 404 that names nothing
 * - only the production hosts (`INDEXED_HOST`) may be indexed
 * - `/` is the API overview: the site holds the public API docs only
 * - the security headers every Saroh app sends
 */

const DAY = 86_400;
const COOKIE = "saroh-dev-access";

const SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * `withDevAccess` from `@saroh/auth`, for a static site: the same parameter,
 * cookie and digest, so one visit opens every dev app. Null lets it through.
 */
async function devGate(request, env) {
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
                "Set-Cookie": `${COOKIE}=${expected}; Path=/; Max-Age=${30 * DAY}; HttpOnly; Secure; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`,
                "X-Robots-Tag": "noindex, nofollow",
            },
        });
    }
    const pass = (request.headers.get("cookie") ?? "")
        .split(";")
        .map((c) => c.trim())
        .includes(`${COOKIE}=${expected}`);
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

export async function handle(request, env) {
    const shut = await devGate(request, env);
    if (shut) return shut;
    const url = new URL(request.url);
    const indexed = url.hostname === env.INDEXED_HOST;
    if (url.pathname === "/") {
        return new Response(null, {
            status: 308,
            headers: { Location: `/api${url.search}`, ...SECURITY_HEADERS },
        });
    }
    if (url.pathname === "/robots.txt") {
        return new Response(
            `User-agent: *\n${indexed ? "Allow" : "Disallow"}: /\n`,
            { headers: { "Content-Type": "text/plain", ...SECURITY_HEADERS } },
        );
    }
    // A copy: the assets' own headers can't be changed.
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
        response.headers.set(name, value);
    if (!indexed) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
}

export default { fetch: handle };
