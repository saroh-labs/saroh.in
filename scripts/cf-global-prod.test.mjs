// Global's production Workers (stage 10, U1): what the converter makes of
// each app's real production config. Reads files only; no clock but a fixed one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseJsonc } from "./cf-env.mjs";
import {
    GLOBAL_DIRS,
    globalProductionConfig,
    globalValue,
} from "./cf-global-prod.mjs";

const NOW = new Date(Date.UTC(2031, 0, 1));
const read = (dir) => parseJsonc(readFileSync(`${dir}/wrangler.jsonc`, "utf8"));
const convert = (dir, routes = false) =>
    globalProductionConfig(read(dir), dir, { routes, now: NOW }).env.production;

for (const dir of [
    "apps/app.saroh.in",
    "apps/accounts.saroh.in",
    "apps/admin.saroh.in",
]) {
    test(`${dir}: a dark Global Worker with Global's hosts`, () => {
        const india = read(dir).env.production;
        const out = convert(dir);
        assert.equal(out.name, `${india.name}-global`);
        assert.equal(out.workers_dev, false);
        assert.equal(out.preview_urls, false);
        assert.deepEqual(out.routes, []);
        assert.equal(out.vars.NEXT_PUBLIC_EDITION, "GLOBAL");
        assert.equal(out.vars.NEXT_PUBLIC_POSTHOG_REPLAY, "off");
        for (const key of Object.keys(out.vars))
            assert.ok(
                key !== "PRELAUNCH_GATE" &&
                    key !== "LAUNCH_AT" &&
                    !key.startsWith("DEV_"),
                `${key} is India's only`,
            );
        const left = Object.entries(out.vars).filter(([, value]) =>
            /saroh\.in\b/.test(String(value).replaceAll("p.saroh.in", "")),
        );
        assert.deepEqual(left, []);
        for (const service of out.services ?? [])
            if (service.binding === "WORKER_SELF_REFERENCE")
                assert.equal(service.service, out.name);
    });
}

test("the workspace speaks to api.saroh.tech, and keeps India's launched plans", () => {
    const out = convert("apps/app.saroh.in");
    assert.equal(out.vars.API_URL, "https://api.saroh.tech");
    assert.equal(
        out.vars.NEXT_PUBLIC_BETTER_AUTH_URL,
        "https://api.saroh.tech",
    );
    assert.equal(
        out.vars.NEXT_PUBLIC_ACCOUNTS_URL,
        "https://accounts.saroh.tech",
    );
    assert.equal(out.vars.NEXT_PUBLIC_POSTHOG_HOST, "https://p.saroh.in");
    assert.equal(out.vars.NEXT_PUBLIC_ROOT_DOMAIN, "saroh.app");
    assert.equal(out.vars.NEXT_PUBLIC_PLANS, "on");
});

test("saroh.tech keeps its name and gets no workers.dev address", () => {
    const out = convert("apps/saroh.tech");
    assert.equal(out.name, "saroh-tech");
    assert.equal(out.workers_dev, false);
    assert.equal(out.preview_urls, false);
    assert.deepEqual(out.routes, []);
    assert.equal(out.vars.GLOBAL_PRODUCTION_HOSTS, "on");
});

test("shared and outside hosts are left; www and the apex move", () => {
    assert.equal(globalValue("https://p.saroh.in", "X"), "https://p.saroh.in");
    assert.equal(globalValue("saroh.app", "X"), "saroh.app");
    assert.equal(globalValue("sites.saroh.app", "X"), "sites.saroh.app");
    assert.equal(
        globalValue("https://eu.i.posthog.com", "X"),
        "https://eu.i.posthog.com",
    );
    assert.equal(
        globalValue("https://www.saroh.in", "X"),
        "https://www.saroh.tech",
    );
    assert.equal(
        globalValue("https://saroh.in/a", "X"),
        "https://saroh.tech/a",
    );
    assert.equal(globalValue(".saroh.in", "X"), ".saroh.tech");
});

test("an unmapped saroh.in host stops the conversion, naming the setting", () => {
    assert.throws(
        () => globalValue("https://help.saroh.in", "HELP_URL"),
        /HELP_URL names help\.saroh\.in/,
    );
    const config = read("apps/admin.saroh.in");
    config.env.production.vars.NEW_URL = "https://new.saroh.in";
    assert.throws(
        () => globalProductionConfig(config, "apps/admin.saroh.in"),
        /NEW_URL/,
    );
});

test("routes only with GLOBAL_ROUTES on, and exactly each Worker's saroh.tech one", () => {
    const expected = {
        "apps/app.saroh.in": "app.saroh.tech/*",
        "apps/accounts.saroh.in": "accounts.saroh.tech/*",
        "apps/admin.saroh.in": "admin.saroh.tech/*",
        "apps/saroh.tech": "saroh.tech/*",
        "apps/docs.saroh.in": "docs.saroh.tech",
    };
    assert.deepEqual(Object.keys(expected).sort(), [...GLOBAL_DIRS].sort());
    for (const [dir, pattern] of Object.entries(expected)) {
        assert.deepEqual(convert(dir, false).routes, [], dir);
        assert.deepEqual(convert(dir, true).routes, [
            pattern.endsWith("/*")
                ? { pattern, zone_name: "saroh.tech" }
                : { pattern, custom_domain: true },
        ]);
    }
});
