// A production build refuses local and development hosts (stage 10, U2).
// The development domain here is made up; the real one is never in the repo.
import assert from "node:assert/strict";
import { test } from "node:test";

import { refusedVars } from "./assert-production-hosts.mjs";
import { appVars, buildVars } from "./cf-env.mjs";
import { APPS, GLOBAL_APPS, globalConfig } from "./cf-plan.mjs";

const DEV = "global-dev.example";

test("India's production settings pass", () => {
    for (const dir of Object.values(APPS))
        assert.deepEqual(
            refusedVars(buildVars(dir, "production"), DEV),
            [],
            dir,
        );
});

test("all four Global conversions pass, routes off and on", () => {
    for (const app of Object.keys(GLOBAL_APPS))
        for (const routes of [false, true])
            assert.deepEqual(
                refusedVars(globalConfig(app, routes).env.production.vars, DEV),
                [],
                app,
            );
});

test("a local host fails, naming the setting", () => {
    assert.deepEqual(
        refusedVars({
            API_URL: "https://api.saroh.localhost",
            OK: "https://api.saroh.in",
        }),
        ["API_URL"],
    );
    assert.deepEqual(refusedVars({ A: "http://localhost:3000" }), ["A"]);
    assert.deepEqual(refusedVars({ A: "http://127.0.0.1:4000" }), ["A"]);
});

test("India's development hosts fail", () => {
    assert.deepEqual(refusedVars({ A: "https://api.saroh.io" }), ["A"]);
    assert.deepEqual(refusedVars({ B: ".saroh.io" }), ["B"]);
    assert.deepEqual(refusedVars({ C: "sites.saroh.io" }), ["C"]);
    assert.deepEqual(refusedVars({ D: "https://saroh.iota.example" }), []);
});

test("Global's development domain fails, only when the deploy gives it", () => {
    const vars = { API_URL: `https://api.${DEV}`, X: `.${DEV}` };
    assert.deepEqual(refusedVars(vars, DEV), ["API_URL", "X"]);
    assert.deepEqual(refusedVars(vars, ` ${DEV.toUpperCase()} `), [
        "API_URL",
        "X",
    ]);
    assert.deepEqual(refusedVars(vars, ""), []);
    assert.deepEqual(refusedVars({ A: `https://not${DEV}` }, DEV), []);
});

test("saroh.tech's own settings pass", () => {
    assert.deepEqual(
        refusedVars(appVars("apps/saroh.tech", "production"), DEV),
        [],
    );
});
