import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseJsonc } from "./cf-env.mjs";
import { globalDevConfig } from "./cf-global-dev.mjs";

const DOMAIN = "global-dev.example";

test("the site: both its addresses, and the gate's cookie", () => {
    const out = globalDevConfig(
        { name: "saroh-tech-dev" },
        "apps/saroh.tech",
        DOMAIN,
    );
    assert.deepEqual(
        out.routes.map((r) => r.pattern),
        [`${DOMAIN}/*`, `www.${DOMAIN}/*`],
    );
    assert.equal(out.vars.DEV_ACCESS_COOKIE_DOMAIN, `.${DOMAIN}`);
    assert.equal(out.vars.API_URL, `https://api.${DOMAIN}`);
});

for (const [dir, sub] of [
    ["apps/app.saroh.in", "app"],
    ["apps/accounts.saroh.in", "accounts"],
    ["apps/admin.saroh.in", "admin"],
]) {
    test(`${sub}: nothing of saroh.io's left but the shared target`, () => {
        const config = parseJsonc(
            readFileSync(`${dir}/wrangler.jsonc`, "utf8"),
        );
        const out = globalDevConfig(config, dir, DOMAIN);
        assert.match(out.name, /-global-dev$/);
        assert.notEqual(out.name, config.name);
        assert.deepEqual(out.routes, [
            { pattern: `${sub}.${DOMAIN}/*`, zone_name: DOMAIN },
        ]);
        assert.equal(out.vars.NEXT_PUBLIC_EDITION, "GLOBAL");
        assert.equal(out.vars.DEV_REDIRECT_ORIGIN, undefined);
        assert.equal(out.vars.DEV_ACCESS_COOKIE_DOMAIN, `.${DOMAIN}`);
        const left = Object.entries(out.vars).filter(([, value]) =>
            /saroh\.io/.test(String(value).replace("sites.saroh.io", "")),
        );
        assert.deepEqual(left, []);
        for (const service of out.services ?? []) {
            if (service.binding === "WORKER_SELF_REFERENCE") {
                assert.equal(service.service, out.name);
            }
        }
    });
}
