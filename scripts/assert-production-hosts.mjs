#!/usr/bin/env node
/**
 * A production build refuses settings that point at a local or development
 * host (stage 10, KTD4). deploy-frontends.yml runs it before every production
 * build, India and Global, on the settings the build is given (after
 * scripts/cf-global-prod.mjs, for a Global one):
 *
 *   GLOBAL_DEV_DOMAIN=… node scripts/assert-production-hosts.mjs apps/app.saroh.in
 *
 * Refused: localhost and *.localhost, 127.0.0.1, saroh.io and its subdomains
 * (India's development), and Global's development domain. That one is a secret
 * of the deploy, read from the environment only and never written here or
 * printed: a failure names the setting, never its value.
 */
import { buildVars } from "./cf-env.mjs";

const LOCAL_OR_DEV = [
    (host) => host === "localhost" || host.endsWith(".localhost"),
    (host) => host === "127.0.0.1",
    (host) => host === "saroh.io" || host.endsWith(".saroh.io"),
];

/** The names of the settings in `vars` that name a refused host. */
export function refusedVars(vars, devDomain = "") {
    const dev = devDomain.trim().toLowerCase();
    const refused = (host) =>
        LOCAL_OR_DEV.some((test) => test(host)) ||
        (dev !== "" && (host === dev || host.endsWith(`.${dev}`)));
    return Object.entries(vars)
        .filter(([, value]) =>
            String(value)
                .toLowerCase()
                .split(/[^a-z0-9.-]+/)
                .map((token) => token.replace(/^\.+|\.+$/g, ""))
                .some(refused),
        )
        .map(([key]) => key);
}

if (process.argv[1]?.endsWith("assert-production-hosts.mjs")) {
    const dir = process.argv[2];
    if (!dir) {
        console.error(
            "usage: node scripts/assert-production-hosts.mjs <app dir>",
        );
        process.exit(2);
    }
    const devDomain = process.env.GLOBAL_DEV_DOMAIN ?? "";
    if (!devDomain.trim())
        console.log(
            "::warning::GLOBAL_DEV_DOMAIN isn't set here: Global's development domain isn't checked",
        );
    const bad = refusedVars(buildVars(dir, "production"), devDomain);
    for (const key of bad)
        console.error(
            `::error::${dir}: ${key} names a local or development host`,
        );
    if (bad.length) process.exit(1);
    console.log(`${dir}: production hosts only`);
}
