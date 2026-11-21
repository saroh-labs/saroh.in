#!/usr/bin/env node
/**
 * Every app on Cloudflare sends the browser security headers on every page
 * (HTTPS only, no framing by other sites, no type guessing) and doesn't
 * announce Next.js. They live in each app's next.config; this loads each
 * config and fails if one lost them. The apps had none until 8 Oct 2026
 * (DEV_LEARNINGS).
 *
 * The three signed-in apps (the workspace, accounts, the operator console)
 * also say `X-Robots-Tag: noindex, nofollow` on everything, in three places
 * that each reach answers the others can't (12 Oct 2026, DEV_LEARNINGS):
 * next.config for what Next answers, `withPrivateApp` for what the
 * middleware answers itself (the redirect to sign-in), and `public/_headers`
 * for the files Cloudflare serves without the Worker. This fails when one of
 * the three is missing, isn't wired in, or says something different.
 *
 * Every page also switches off the browser features no app uses
 * (Permissions-Policy) and says Referrer-Policy:
 * strict-origin-when-cross-origin. saroh.in reports a Content-Security-Policy
 * (pentest, 29 Oct 2026; @saroh/auth/security-headers). The other four
 * ENFORCE one from their middleware, with a fresh script nonce per answer
 * (21 Nov 2026): their next.config must NOT send a Content-Security-Policy,
 * because on Workers OpenNext lets a next.config header replace the
 * middleware's of the same name, and the nonce would be lost.
 *
 * Run from the repo root.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import securityHeaders from "../packages/auth/src/security-headers.cjs";

const { ENFORCED_CSP, contentSecurityPolicy } = securityHeaders;

const CONFIGS = [
    "apps/saroh.in/next.config.js",
    "apps/app.saroh.in/next.config.js",
    "apps/accounts.saroh.in/next.config.mjs",
    "apps/admin.saroh.in/next.config.mjs",
    "apps/saroh.app/next.config.js",
];
const REQUIRED = {
    "strict-transport-security": /^max-age=31536000\b/u,
    "x-frame-options": /^SAMEORIGIN$/u,
    "x-content-type-options": /^nosniff$/u,
    "permissions-policy": /camera=\(\), microphone=\(\), geolocation=\(\)/u,
    "referrer-policy": /^strict-origin-when-cross-origin$/u,
};
/**
 * The apps whose middleware enforces the CSP with a nonce, and how its
 * default export must start. saroh.in isn't one yet.
 */
const NONCE_CSP = {
    "apps/app.saroh.in/next.config.js": /export default withPrivateApp\(/u,
    "apps/accounts.saroh.in/next.config.mjs":
        /export default withPrivateApp\(/u,
    "apps/admin.saroh.in/next.config.mjs": /export default withPrivateApp\(/u,
    "apps/saroh.app/next.config.js": /export default withSitePolicy\(/u,
};
const MIDDLEWARE = {
    "apps/saroh.app/next.config.js": "apps/saroh.app/middleware.ts",
};
/** saroh.in: a full CSP, report-only, and frame-ancestors enforced. */
const REPORTED_CSP =
    /^default-src 'self';.*object-src 'none'; base-uri 'self'$/u;

/** One directive's sources, or null. */
function directive(policy, name) {
    const found = policy
        .split(";")
        .map((part) => part.trim().split(/\s+/u))
        .find(([key]) => key === name);
    return found ? found.slice(1) : null;
}

/** The signed-in apps, and the file whose default export is their middleware. */
const PRIVATE_APPS = {
    "apps/app.saroh.in/next.config.js": "apps/app.saroh.in/middleware.ts",
    "apps/accounts.saroh.in/next.config.mjs": "apps/accounts.saroh.in/proxy.ts",
    "apps/admin.saroh.in/next.config.mjs": "apps/admin.saroh.in/middleware.ts",
};
const ROBOTS = /^noindex, nofollow$/u;
const WRAPPER = "packages/auth/src/private-app.ts";

/** `PRIVATE_APP_HEADERS` as the wrapper writes it: lower-cased name → value. */
function wrapperHeaders() {
    const source = readFileSync(join(process.cwd(), WRAPPER), "utf8");
    const block = /PRIVATE_APP_HEADERS = \{([\s\S]*?)\} as const;/u.exec(
        source,
    );
    const found = new Map();
    for (const m of (block?.[1] ?? "").matchAll(/"([^"]+)":\s*"([^"]*)"/gu))
        found.set(m[1].toLowerCase(), m[2]);
    return found;
}

/** A `_headers` file's `/*` block: lower-cased name → value; null, no file. */
function assetHeaders(file) {
    if (!existsSync(file)) return null;
    const found = new Map();
    let inAll = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        if (!/^\s/u.test(line)) {
            inAll = line.trim() === "/*";
            continue;
        }
        const at = line.indexOf(":");
        if (inAll && at > 0)
            found.set(
                line.slice(0, at).trim().toLowerCase(),
                line.slice(at + 1).trim(),
            );
    }
    return found;
}

// The configs only refuse to load for a deploy build; this isn't one.
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_GIT_COMMIT_REF;

const problems = [];
const wrapper = wrapperHeaders();
if (!ROBOTS.test(wrapper.get("x-robots-tag") ?? ""))
    problems.push(`${WRAPPER}: PRIVATE_APP_HEADERS must say X-Robots-Tag`);

for (const file of CONFIGS) {
    const config = (await import(pathToFileURL(join(process.cwd(), file)).href))
        .default;
    if (config.poweredByHeader !== false)
        problems.push(`${file}: poweredByHeader isn't false`);
    const rules = config.headers ? await config.headers() : [];
    // Every rule that reaches every page, merged as Next merges them.
    const sent = new Map(
        rules
            .filter((r) => r.source === "/:path*" && !r.has)
            .flatMap((r) => r.headers)
            .map((h) => [h.key.toLowerCase(), h.value]),
    );
    for (const [key, shape] of Object.entries(REQUIRED))
        if (!shape.test(sent.get(key) ?? ""))
            problems.push(`${file}: every page must send ${key}`);
    const nonced = NONCE_CSP[file];
    if (nonced) {
        if (sent.has("content-security-policy"))
            problems.push(
                `${file}: must not send Content-Security-Policy; the middleware's, with its nonce, would be replaced on Workers`,
            );
        const middleware = PRIVATE_APPS[file] ?? MIDDLEWARE[file];
        const source = readFileSync(join(process.cwd(), middleware), "utf8");
        if (!nonced.test(source))
            problems.push(
                `${middleware}: the default export must enforce the CSP with a nonce (${nonced.source})`,
            );
        if (
            PRIVATE_APPS[file] &&
            !/contentSecurityPolicy\(\{[^}]*\bnonce\b/u.test(source)
        )
            problems.push(
                `${middleware}: withPrivateApp's policy must be contentSecurityPolicy({ …, nonce })`,
            );
    } else {
        if (
            !/frame-ancestors 'self'/u.test(
                sent.get("content-security-policy") ?? "",
            )
        )
            problems.push(
                `${file}: every page must send content-security-policy`,
            );
        if (
            !REPORTED_CSP.test(
                sent.get("content-security-policy-report-only") ?? "",
            )
        )
            problems.push(
                `${file}: every page must report a CSP (pageSecurityHeaders, @saroh/auth/security-headers)`,
            );
    }

    const middleware = PRIVATE_APPS[file];
    if (!middleware) continue;
    // A signed-in app: never indexed, and its three places agree.
    if (!ROBOTS.test(sent.get("x-robots-tag") ?? ""))
        problems.push(
            `${file}: every page must send X-Robots-Tag: noindex, nofollow`,
        );
    const source = readFileSync(join(process.cwd(), middleware), "utf8");
    if (!/export default withPrivateApp\(/u.test(source))
        problems.push(
            `${middleware}: the default export must be withPrivateApp(…), outermost, so a redirect is noindex too`,
        );
    const assetsFile = join(dirname(file), "public/_headers");
    const assets = assetHeaders(join(process.cwd(), assetsFile));
    if (!assets) problems.push(`${assetsFile}: missing`);
    // The policy the middleware enforces: ENFORCED_CSP's every directive,
    // and scripts by nonce only.
    const sources = (
        await import(
            pathToFileURL(join(process.cwd(), dirname(file), "csp-sources.cjs"))
                .href
        )
    ).default;
    const policy = contentSecurityPolicy({ ...sources, nonce: "n0nce" });
    for (const part of ENFORCED_CSP.split("; "))
        if (!policy.includes(part))
            problems.push(`${file}: the enforced CSP lacks "${part}"`);
    const scripts = directive(policy, "script-src") ?? [];
    if (
        !scripts.includes("'nonce-n0nce'") ||
        scripts.includes("'unsafe-inline'") ||
        // Chrome runs any DOM-added script under it, injected inline ones too.
        scripts.includes("'strict-dynamic'") ||
        (process.env.NODE_ENV !== "development" &&
            scripts.includes("'unsafe-eval'"))
    )
        problems.push(
            `${file}: the enforced script-src must be by nonce, without 'unsafe-inline' or (outside next dev) 'unsafe-eval'`,
        );
    for (const [key, value] of wrapper) {
        // The middleware sends the page's CSP itself (above).
        if (key === "content-security-policy") {
            if (assets && assets.get(key) !== value)
                problems.push(
                    `${assetsFile}: ${key} differs from PRIVATE_APP_HEADERS (${WRAPPER})`,
                );
            continue;
        }
        if (sent.get(key) !== value)
            problems.push(
                `${file}: ${key} differs from PRIVATE_APP_HEADERS (${WRAPPER})`,
            );
        if (assets && assets.get(key) !== value)
            problems.push(
                `${assetsFile}: ${key} differs from PRIVATE_APP_HEADERS (${WRAPPER})`,
            );
    }
}

if (problems.length) {
    console.error(`check:security-headers:\n  ${problems.join("\n  ")}`);
    process.exit(1);
}
console.log(
    `check:security-headers: ${CONFIGS.length} apps, ${Object.keys(PRIVATE_APPS).length} of them never indexed, ok`,
);
