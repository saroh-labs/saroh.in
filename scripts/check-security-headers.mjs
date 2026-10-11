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
 * Run from the repo root.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

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
    "content-security-policy": /frame-ancestors 'self'/u,
    "x-content-type-options": /^nosniff$/u,
};

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
    const all = rules.find((r) => r.source === "/:path*" && !r.has);
    const sent = new Map(
        (all?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]),
    );
    for (const [key, shape] of Object.entries(REQUIRED))
        if (!shape.test(sent.get(key) ?? ""))
            problems.push(`${file}: every page must send ${key}`);

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
    for (const [key, value] of wrapper) {
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
