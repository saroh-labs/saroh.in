#!/usr/bin/env node
/**
 * Every app on Cloudflare sends the browser security headers on every page
 * (HTTPS only, no framing by other sites, no type guessing) and doesn't
 * announce Next.js. They live in each app's next.config; this loads each
 * config and fails if one lost them. The apps had none until 8 Oct 2026
 * (DEV_LEARNINGS).
 *
 * Run from the repo root.
 */
import { join } from "node:path";
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

// The configs only refuse to load for a deploy build; this isn't one.
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_GIT_COMMIT_REF;

const problems = [];
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
}

if (problems.length) {
    console.error(`check:security-headers:\n  ${problems.join("\n  ")}`);
    process.exit(1);
}
console.log(`check:security-headers: ${CONFIGS.length} apps, ok`);
