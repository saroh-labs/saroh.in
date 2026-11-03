#!/usr/bin/env node
/**
 * Turns an app's development settings into Global's, in a deploy's own
 * checkout. Global's development domain is a secret of the deploy
 * (`GLOBAL_DEV_DOMAIN`, DEC-204), so it's never written in this public repo:
 * the apps' wrangler.jsonc name saroh.io, and this swaps it just before a build.
 *
 *   GLOBAL_DEV_DOMAIN=… node scripts/cf-global-dev.mjs apps/app.saroh.in
 *
 * A visitor without the access key gets a 404 rather than a redirect, since
 * Global's production addresses aren't live yet.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./cf-env.mjs";

const SUBDOMAIN = {
    "apps/app.saroh.in": "app",
    "apps/accounts.saroh.in": "accounts",
    "apps/admin.saroh.in": "admin",
};

const SITE = "apps/saroh.tech";

export function globalDevConfig(config, dir, domain) {
    if (dir === SITE) {
        return {
            ...config,
            routes: [domain, `www.${domain}`].map((host) => ({
                pattern: `${host}/*`,
                zone_name: domain,
            })),
            vars: {
                API_URL: `https://api.${domain}`,
                DEV_ACCESS_COOKIE_DOMAIN: `.${domain}`,
                NEXT_PUBLIC_EDITION: "GLOBAL",
            },
        };
    }
    const name = config.name.replace(/-dev$/, "-global-dev");
    const vars = Object.fromEntries(
        Object.entries(config.vars)
            .filter(([key]) => !key.startsWith("DEV_REDIRECT_"))
            .map(([key, value]) => [
                key,
                // sites.saroh.io is merchants' custom domains' target: shared.
                String(value).replace(/(?<!sites\.)saroh\.io/g, domain),
            ]),
    );
    return {
        ...config,
        name,
        services: config.services?.map((service) =>
            service.binding === "WORKER_SELF_REFERENCE"
                ? { ...service, service: name }
                : service,
        ),
        routes: [
            {
                pattern: `${SUBDOMAIN[dir]}.${domain}/*`,
                zone_name: domain,
            },
        ],
        vars: { ...vars, NEXT_PUBLIC_EDITION: "GLOBAL" },
    };
}

if (import.meta.main ?? process.argv[1]?.endsWith("cf-global-dev.mjs")) {
    const dir = process.argv[2];
    const domain = process.env.GLOBAL_DEV_DOMAIN?.trim();
    if (!domain || !(SUBDOMAIN[dir] || dir === SITE)) {
        console.error("Needs GLOBAL_DEV_DOMAIN and an app's directory.");
        process.exit(1);
    }
    const path = join(dir, "wrangler.jsonc");
    const config = parseJsonc(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify(globalDevConfig(config, dir, domain)));
}
