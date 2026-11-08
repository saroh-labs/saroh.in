import assert from "node:assert/strict";
import { test } from "node:test";

import {
    apiReady,
    hostAnswers,
    namesSarohTech,
    noIndiaLinks,
    noindex,
    pricingFreeOnly,
    signInOptions,
} from "./smoke-global.mjs";

test("a host answers 200 or a redirect, never an error", () => {
    assert.equal(hostAnswers(200), null);
    assert.equal(hostAnswers(307), null);
    assert.match(hostAnswers(502), /502/);
});

test("the API is ready with migrations up", () => {
    const good = { status: "ready", checks: [{ name: "migrations", status: "up" }] };
    assert.equal(apiReady(good), null);
    assert.match(apiReady({ status: "ready", checks: [{ name: "migrations", status: "down" }] }), /migrations/);
    assert.match(apiReady({ status: "degraded" }), /degraded/);
});

test("pricing shows no amount and says paid plans aren't available", () => {
    const good = "<h3>Grow</h3><p>Not available yet</p><button>Tell me when</button>";
    assert.equal(pricingFreeOnly(good), null);
    assert.match(pricingFreeOnly(good.replace("<p>", "<p>$12 ")), /amount/);
    assert.match(pricingFreeOnly("<p>US$ 9</p>"), /amount/);
    assert.match(pricingFreeOnly("<p>Tell me when</p>"), /Not available yet/);
});

test("Global pages don't link India's apps", () => {
    assert.equal(noIndiaLinks('<a href="https://app.saroh.tech">'), null);
    assert.match(noIndiaLinks('<a href="https://accounts.saroh.in/signup">'), /accounts\.saroh\.in/);
});

test("robots and sitemap name saroh.tech only", () => {
    assert.equal(namesSarohTech("Sitemap: https://saroh.tech/sitemap.xml"), null);
    assert.match(namesSarohTech("Sitemap: https://www.saroh.in/sitemap.xml"), /saroh\.tech|another/);
    assert.match(namesSarohTech("https://saroh.tech/a https://saroh.localhost/b"), /another/);
});

test("admin and accounts are noindex by header or meta", () => {
    assert.equal(noindex(new Headers({ "x-robots-tag": "noindex" }), ""), null);
    assert.equal(noindex(new Headers(), '<meta name="robots" content="noindex, nofollow">'), null);
    assert.match(noindex(new Headers(), "<title>Sign in</title>"), /indexed/);
});

test("the sign-in options answer has a providers list", () => {
    assert.equal(signInOptions({ providers: [] }), null);
    assert.match(signInOptions({}), /providers/);
});
