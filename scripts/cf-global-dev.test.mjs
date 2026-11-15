import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseJsonc } from "./cf-env.mjs";
import { globalDevConfig } from "./cf-global-dev.mjs";

const DOMAIN = "global-dev.example";

test("the site: no public workers.dev address, and the gate's cookie", () => {
    const out = globalDevConfig(
        { name: "saroh-tech-dev" },
        "apps/saroh.tech",
        DOMAIN,
    );
    assert.equal(out.routes, undefined);
    assert.equal(out.workers_dev, false);
    assert.equal(out.vars.DEV_ACCESS_COOKIE_DOMAIN, `.${DOMAIN}`);
    assert.equal(out.vars.API_URL, `https://api.${DOMAIN}`);
    // Global's launch set on, and what waits for paid plans off.
    assert.equal(out.vars.NEXT_PUBLIC_AI_APPS, "on");
    assert.equal(out.vars.NEXT_PUBLIC_SOCIAL, "on");
    assert.equal(out.vars.NEXT_PUBLIC_TEMPLATES, "on");
    assert.equal(out.vars.NEXT_PUBLIC_ASK_AI, undefined);
    assert.equal(out.vars.NEXT_PUBLIC_DEVELOPERS, undefined);
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
        assert.equal(out.routes, undefined);
        assert.equal(out.vars.NEXT_PUBLIC_EDITION, "GLOBAL");
        assert.equal(out.vars.DEV_REDIRECT_ORIGIN, "refuse");
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
