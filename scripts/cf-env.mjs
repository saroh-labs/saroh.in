#!/usr/bin/env node
/**
 * Prints a Cloudflare app's settings as KEY=VALUE lines, read from its
 * `wrangler.jsonc` (`vars` at the top level for dev, `env.production.vars`
 * for production).
 *
 * The deploy workflow appends them to $GITHUB_ENV before building, so the
 * values compiled into the build (NEXT_PUBLIC_*, and what the static pages
 * read) are the same ones the Worker is given at runtime. One place to change
 * a setting, and the build and the Worker can't disagree.
 *
 *   node scripts/cf-env.mjs apps/accounts.saroh.in development
 *   node scripts/cf-env.mjs apps/accounts.saroh.in production
 *
 * Only `vars` (settings that aren't secret). Secrets come from GitHub and are
 * never printed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** JSON with comments and trailing commas, as wrangler.jsonc is written. */
export function parseJsonc(text) {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            out += c;
            if (c === "\\") out += text[++i] ?? "";
            else if (c === '"') inString = false;
        } else if (c === '"') {
            inString = true;
            out += c;
        } else if (c === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            out += "\n";
        } else if (c === "/" && text[i + 1] === "*") {
            i += 2;
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
                i++;
            i++;
        } else {
            out += c;
        }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function appVars(appDir, environment) {
    const config = parseJsonc(
        readFileSync(join(appDir, "wrangler.jsonc"), "utf8"),
    );
    if (environment === "production") return config.env?.production?.vars ?? {};
    if (environment === "development") return config.vars ?? {};
    throw new Error(
        `environment must be development or production, not ${environment}`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [appDir, environment] = process.argv.slice(2);
    if (!appDir || !environment) {
        console.error(
            "usage: node scripts/cf-env.mjs <app dir> <development|production>",
        );
        process.exit(2);
    }
    for (const [key, value] of Object.entries(appVars(appDir, environment))) {
        if (/[\r\n]/.test(String(value)))
            throw new Error(`${key} has a line break`);
        console.log(`${key}=${value}`);
    }
}
