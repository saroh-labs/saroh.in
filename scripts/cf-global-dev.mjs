#!/usr/bin/env node
/**
 * Turns an app's development settings into Global's, in a deploy's own
 * checkout. Global's development domain is a secret of the deploy
 * (`GLOBAL_DEV_DOMAIN`, DEC-204), so it's never written in this public repo:
 * the apps' wrangler.jsonc name saroh.io, and this swaps it just before a build.
 *
 *   GLOBAL_DEV_DOMAIN=… node scripts/cf-global-dev.mjs apps/app.saroh.in
 *
 * A visitor without the access key gets a 404, not a redirect that would tie
 * this domain to Saroh. Routes aren't in the config: the deploy token has no
 * access to this zone, so they're set once on Cloudflare, with the DNS.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./cf-env.mjs";

export const SUBDOMAIN = {
    "apps/app.saroh.in": "app",
    "apps/accounts.saroh.in": "accounts",
    "apps/admin.saroh.in": "admin",
};

export const SITE = "apps/saroh.tech";

export function globalDevConfig(config, dir, domain) {
    if (dir === SITE) {
        return {
            ...config,
            workers_dev: false,
            preview_urls: false,
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
            .filter(([key]) => key !== "DEV_REDIRECT_PATH")
            .map(([key, value]) => [
                key,
                // sites.saroh.io is merchants' custom domains' target: shared.
                String(value).replace(/(?<!sites\.)saroh\.io/g, domain),
            ]),
    );
    const { routes: _indiaRoutes, ...rest } = config;
    return {
        ...rest,
        name,
        services: config.services?.map((service) =>
            service.binding === "WORKER_SELF_REFERENCE"
                ? { ...service, service: name }
                : service,
        ),
        vars: {
            ...vars,
            DEV_REDIRECT_ORIGIN: "refuse",
            NEXT_PUBLIC_EDITION: "GLOBAL",
        },
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
