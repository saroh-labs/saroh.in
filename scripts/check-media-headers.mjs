#!/usr/bin/env node
/**
 * The media domains can't run a page (docs/patterns/backend-integrations.md
 * → Media storage). A Cloudflare response-header rule on each media domain
 * sets the headers below on every answer, a 404 from the bucket included, so
 * any path proves the rule is on. This fetches one per domain and fails if a
 * header is missing or differs.
 *
 *   node scripts/check-media-headers.mjs                  # both domains
 *   node scripts/check-media-headers.mjs media.saroh.io   # one
 *
 * Live network check: not in prepush. Runs after every API deploy
 * (.github/workflows/deploy-api.yml → media-headers). The comparison is proved
 * offline by check-media-headers.test.mjs.
 */

/** The one place the expected values live; the docs quote them. */
export const MEDIA_HEADERS = {
    "content-security-policy":
        "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    "x-content-type-options": "nosniff",
};

export const MEDIA_HOSTS = ["media.saroh.in", "media.saroh.io"];

/** Problems with one answer's headers (a Headers or a plain object); [] when right. */
export function headerProblems(headers) {
    const read = (name) =>
        headers.get?.(name) ??
        Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
    return Object.entries(MEDIA_HEADERS).flatMap(([name, want]) => {
        const got = read(name);
        if (got == null) return [`${name} missing`];
        return got.trim() === want
            ? []
            : [`${name} is "${got}", want "${want}"`];
    });
}

async function main() {
    const hosts = process.argv.slice(2).length
        ? process.argv.slice(2)
        : MEDIA_HOSTS;
    let failed = 0;
    for (const host of hosts) {
        // Any path: the rule answers a bucket 404 with the same headers.
        const url = `https://${host}/__media-header-check`;
        const problems = await fetch(url, { redirect: "manual" })
            .then((res) => headerProblems(res.headers))
            .catch((e) => [`fetch failed: ${e.message}`]);
        console.log(
            problems.length
                ? `FAIL ${host}: ${problems.join("; ")}`
                : `ok   ${host}`,
        );
        if (problems.length) failed++;
    }
    process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
