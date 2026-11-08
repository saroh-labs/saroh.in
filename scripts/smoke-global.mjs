#!/usr/bin/env node
/**
 * Global's launch smoke check (stage 10, docs/architecture/runbooks/GLOBAL_LAUNCH.md).
 * Run after the launch step, against production:
 *
 *   node scripts/smoke-global.mjs
 *
 * It reads public pages only and changes nothing. Each check is a pure
 * function of what a page returned, so `smoke-global.test.mjs` proves them
 * on fixtures. Exit 0 when every check passes, 1 otherwise.
 */

export const HOSTS = {
    site: "https://saroh.tech",
    app: "https://app.saroh.tech",
    accounts: "https://accounts.saroh.tech",
    admin: "https://admin.saroh.tech",
    api: "https://api.saroh.tech",
};

/** A launch-day answer: 200, or a redirect (sign-in), never an error. */
export function hostAnswers(status) {
    return status >= 200 && status < 400
        ? null
        : `answered ${status}, wanted 200 or a redirect`;
}

/** The API's readiness: ready, with migrations up. */
export function apiReady(json) {
    if (json?.status !== "ready") return `status is ${json?.status ?? "missing"}`;
    const migrations = json.checks?.find((c) => c.name === "migrations");
    return migrations?.status === "up" ? null : "migrations aren't up";
}

/** Free-only: no amount to pay, and paid plans say so. */
export function pricingFreeOnly(html) {
    const text = html.replace(/<[^>]+>/g, " ");
    if (/(?:\$|US\$|USD|€|£|₹)\s?\d/.test(text)) return "shows an amount";
    if (!text.includes("Not available yet")) return "paid plans don't say Not available yet";
    if (!text.includes("Tell me when")) return "no Tell me when";
    return null;
}

/** Global's pages never send people to India's workspace or sign-in. */
export function noIndiaLinks(html) {
    const hit = html.match(/https:\/\/(?:app|accounts|admin|api)\.saroh\.in\b/);
    return hit ? `links ${hit[0]}` : null;
}

/** robots.txt and the sitemap name saroh.tech, not a local or India host. */
export function namesSarohTech(body) {
    if (!body.includes("saroh.tech")) return "doesn't name saroh.tech";
    if (/localhost|saroh\.io|https:\/\/(?:www\.)?saroh\.in\b/.test(body)) {
        return "names another host";
    }
    return null;
}

/** Admin and accounts stay out of search. */
export function noindex(headers, html) {
    const header = headers.get?.("x-robots-tag") ?? headers["x-robots-tag"] ?? "";
    if (/noindex/i.test(header)) return null;
    return /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)
        ? null
        : "can be indexed";
}

/**
 * The sign-in options answer is well formed. Which providers it lists follows
 * the keys set (India production lists none today), so the list is printed,
 * not judged.
 */
export function signInOptions(json) {
    return Array.isArray(json?.providers) ? null : "no providers list";
}

async function get(url) {
    const res = await fetch(url, { redirect: "manual" });
    const body = res.status < 300 ? await res.text() : "";
    return { status: res.status, headers: res.headers, body };
}

async function main() {
    const failures = [];
    const check = (name, problem) => {
        console.log(`${problem ? "FAIL" : "ok  "} ${name}${problem ? `: ${problem}` : ""}`);
        if (problem) failures.push(name);
    };

    for (const [name, base] of Object.entries(HOSTS)) {
        const path = name === "api" ? "/health/ready" : "/";
        const r = await get(base + path).catch((e) => ({ status: 0, error: e }));
        check(`${name} answers`, r.status ? hostAnswers(r.status) : String(r.error));
    }
    const ready = await get(`${HOSTS.api}/health/ready`);
    check("api ready", apiReady(JSON.parse(ready.body || "{}")));

    const pricing = await get(`${HOSTS.site}/pricing`);
    check("pricing is Free-only", pricingFreeOnly(pricing.body));
    for (const path of ["/", "/pricing", "/features"]) {
        const page = path === "/pricing" ? pricing : await get(HOSTS.site + path);
        check(`${path} has no India links`, noIndiaLinks(page.body));
    }
    check("robots.txt", namesSarohTech((await get(`${HOSTS.site}/robots.txt`)).body));
    check("sitemap.xml", namesSarohTech((await get(`${HOSTS.site}/sitemap.xml`)).body));

    for (const name of ["accounts", "admin"]) {
        const page = await get(`${HOSTS[name]}/login`);
        if (page.status < 300) check(`${name} is noindex`, noindex(page.headers, page.body));
    }
    const options = await get(`${HOSTS.api}/public/sign-in-options`);
    const opts = JSON.parse(options.body || "{}");
    check("sign-in options", signInOptions(opts));
    console.log(`     sign-in providers: ${(opts.providers ?? []).join(", ") || "email only"}`);

    console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
    process.exit(failures.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
