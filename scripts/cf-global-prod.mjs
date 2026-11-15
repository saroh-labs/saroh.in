#!/usr/bin/env node
/**
 * Turns an app's production settings (`env.production` in its wrangler.jsonc)
 * into its Global production Worker's, in a deploy's own checkout, as
 * scripts/cf-global-dev.mjs does for development (stage 10, KTD1).
 *
 *   node scripts/cf-global-prod.mjs apps/app.saroh.in
 *   GLOBAL_ROUTES=on node scripts/cf-global-prod.mjs apps/saroh.tech
 *
 * The Worker is `<name>-global` (saroh.tech keeps `saroh-tech`: it has no India
 * twin), never on workers.dev or a preview address, and on no route until the
 * repo variable `GLOBAL_ROUTES` is "on" (the launch step, KTD3). Every saroh.in
 * host goes through `HOSTS`; one it doesn't list stops the conversion, so a new
 * India address can't reach Global unread. scripts/cf-plan.mjs fingerprints
 * what this returns, and this file's own text, so a change here redeploys the
 * Global Workers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { AT_LAUNCH, parseJsonc, withLaunch } from "./cf-env.mjs";
import { SITE, SUBDOMAIN } from "./cf-global-dev.mjs";

/**
 * India's production hosts and Global's. The same pairs as `hostsFor` in
 * packages/edition (www kept as www). PostHog's proxy is shared: one project,
 * with `edition` on every event (KTD10). Hosts outside saroh.in (saroh.app,
 * merchants' sites, third parties) are left as they are.
 */
export const HOSTS = {
    "saroh.in": "saroh.tech",
    "www.saroh.in": "www.saroh.tech",
    "app.saroh.in": "app.saroh.tech",
    "accounts.saroh.in": "accounts.saroh.tech",
    "admin.saroh.in": "admin.saroh.tech",
    "api.saroh.in": "api.saroh.tech",
    "docs.saroh.in": "docs.saroh.tech",
    "p.saroh.in": "p.saroh.in",
};

/** India's launch gate and dev-only settings mean nothing on Global. */
const DROPPED = (key) =>
    key === "PRELAUNCH_GATE" || key === "LAUNCH_AT" || key.startsWith("DEV_");

const SAROH_IN_HOST = /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*saroh\.in(?![a-z0-9-])/gi;

/** `value` with each saroh.in host swapped for Global's; `name` is for the error. */
export function globalValue(value, name) {
    return String(value).replace(SAROH_IN_HOST, (host) => {
        const global = HOSTS[host.toLowerCase()];
        if (!global)
            throw new Error(`${name} names ${host}, which has no Global host`);
        return global;
    });
}

const SITE_ROUTES = [{ pattern: "saroh.tech/*", zone_name: "saroh.tech" }];

export function globalProductionConfig(
    config,
    dir,
    { routes = false, now = new Date() } = {},
) {
    const production = config.env.production;
    // `routes: []`, never left out: wrangler fills a missing env key from the
    // top level, which holds the dev Worker's saroh.io routes.
    const dark = { workers_dev: false, preview_urls: false, routes: [] };
    if (dir === SITE) {
        const { routes: _none, ...rest } = production;
        return {
            ...config,
            env: {
                ...config.env,
                production: {
                    ...rest,
                    ...dark,
                    ...(routes && { routes: SITE_ROUTES }),
                    vars: { ...production.vars, NEXT_PUBLIC_EDITION: "GLOBAL" },
                },
            },
        };
    }
    const name = `${production.name}-global`;
    // The launch switches India's build gets by date, decided here, so Global
    // builds as India does now and LAUNCH_AT can go.
    const launched = withLaunch(
        production.vars ?? {},
        AT_LAUNCH[basename(dir)],
        now,
    );
    const vars = Object.fromEntries(
        Object.entries(launched)
            .filter(([key]) => !DROPPED(key))
            .map(([key, value]) => [key, globalValue(value, key)]),
    );
    const { routes: indiaRoutes, ...rest } = production;
    return {
        ...config,
        env: {
            ...config.env,
            production: {
                ...rest,
                ...dark,
                name,
                ...(routes && {
                    routes: (indiaRoutes ?? []).map((route) =>
                        route.custom_domain
                            ? {
                                  pattern: globalValue(
                                      route.pattern,
                                      "a route",
                                  ),
                                  custom_domain: true,
                              }
                            : {
                                  pattern: globalValue(
                                      route.pattern,
                                      "a route",
                                  ),
                                  zone_name: globalValue(
                                      route.zone_name,
                                      "a route",
                                  ),
                              },
                    ),
                }),
                services: production.services?.map((service) =>
                    service.binding === "WORKER_SELF_REFERENCE"
                        ? { ...service, service: name }
                        : service,
                ),
                vars: {
                    ...vars,
                    // Off on Global until a consent decision (KTD10).
                    NEXT_PUBLIC_POSTHOG_REPLAY: "off",
                    NEXT_PUBLIC_EDITION: "GLOBAL",
                },
            },
        },
    };
}

/** The directories with a Global production Worker. */
export const GLOBAL_DIRS = [...Object.keys(SUBDOMAIN), SITE];

/** This file, for the plan's fingerprint: a change here redeploys Global. */
export const converterSource = () =>
    readFileSync(new URL(import.meta.url), "utf8");

if (process.argv[1]?.endsWith("cf-global-prod.mjs")) {
    const dir = process.argv[2];
    if (!GLOBAL_DIRS.includes(dir)) {
        console.error(`Needs one of: ${GLOBAL_DIRS.join(", ")}`);
        process.exit(1);
    }
    const path = join(dir, "wrangler.jsonc");
    const config = parseJsonc(readFileSync(path, "utf8"));
    const out = globalProductionConfig(config, dir, {
        routes: process.env.GLOBAL_ROUTES === "on",
    });
    writeFileSync(path, JSON.stringify(out));
    console.log(
        `${out.env.production.name}: ${out.env.production.routes?.length ?? 0} route(s)`,
    );
}
