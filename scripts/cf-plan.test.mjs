// What a production plan deploys of Global (stage 10, U1). Turbo's hash is a
// stand-in here: what's tested is what the Global fingerprint folds in.
import assert from "node:assert/strict";
import { test } from "node:test";

import { converterSource } from "./cf-global-prod.mjs";
import {
    APPS,
    GLOBAL_APPS,
    globalConfig,
    globalFingerprint,
    selectApps,
} from "./cf-plan.mjs";

const GLOBAL = Object.keys(GLOBAL_APPS);
const prints = ({ converter = converterSource(), routes = false } = {}) =>
    GLOBAL.map((app) =>
        globalFingerprint("turbo", converter, globalConfig(app, routes)),
    );

test("a push to main looks at India's and Global's; development at India's", () => {
    assert.deepEqual(selectApps("production"), [
        ...Object.keys(APPS),
        ...GLOBAL,
    ]);
    assert.deepEqual(selectApps("development"), Object.keys(APPS));
});

test("a manual run names an app, India's all or Global's all", () => {
    assert.deepEqual(selectApps("production", "all"), Object.keys(APPS));
    assert.deepEqual(selectApps("production", "all-global"), GLOBAL);
    assert.deepEqual(selectApps("production", "tech"), ["tech"]);
    assert.throws(() => selectApps("development", "tech"), /production only/);
    assert.throws(() => selectApps("production", "nope"), /unknown app/);
});

test("no change: the same fingerprints, so nothing Global is planned", () => {
    assert.deepEqual(prints(), prints());
    assert.equal(new Set(prints()).size, GLOBAL.length);
});

test("a change to the converter plans all four", () => {
    const before = prints();
    const after = prints({ converter: `${converterSource()}\n// changed` });
    for (const [i, app] of GLOBAL.entries())
        assert.notEqual(after[i], before[i], app);
});

test("flipping GLOBAL_ROUTES plans all four", () => {
    const off = prints();
    const on = prints({ routes: true });
    for (const [i, app] of GLOBAL.entries())
        assert.notEqual(on[i], off[i], app);
});

test("a Global fingerprint never matches an India one", () => {
    for (const print of prints()) assert.match(print, /^production-global-/);
});
