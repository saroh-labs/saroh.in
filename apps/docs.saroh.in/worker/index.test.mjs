import assert from "node:assert/strict";
import { test } from "node:test";

import { handle } from "./index.mjs";

const assets = () => {
    const calls = [];
    return {
        calls,
        fetch: async (request) => {
            calls.push(request.url);
            return new Response("page", {
                headers: { "content-type": "text/html" },
            });
        },
    };
};
const get = (url, headers = {}) => new Request(url, { headers });

test("production: indexed, secured, / goes to the API overview", async () => {
    const env = { ASSETS: assets(), INDEXED_HOST: "docs.saroh.in" };
    const page = await handle(get("https://docs.saroh.in/api/keys"), env);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-robots-tag"), null);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("strict-transport-security"), /max-age/);
    const home = await handle(get("https://docs.saroh.in/"), env);
    assert.equal(home.status, 308);
    assert.equal(home.headers.get("location"), "/api");
    const robots = await handle(get("https://docs.saroh.in/robots.txt"), env);
    assert.match(await robots.text(), /Allow: \//);
});

test("any other host is kept out of search", async () => {
    const env = { ASSETS: assets(), INDEXED_HOST: "docs.saroh.in" };
    const page = await handle(get("https://docs.x.workers.dev/api"), env);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
    const robots = await handle(get("https://docs.saroh.io/robots.txt"), env);
    assert.match(await robots.text(), /Disallow: \//);
});

test("development: nothing without the key, the key's cookie opens it", async () => {
    const env = () => ({
        ASSETS: assets(),
        DEV_ACCESS_KEY: "right-key",
        DEV_ACCESS_COOKIE_DOMAIN: ".dev.example",
    });
    for (const path of ["", "api", "robots.txt", "api/v1.json"]) {
        const e = env();
        const res = await handle(get(`https://docs.dev.example/${path}`), e);
        assert.equal(res.status, 404, path);
        assert.equal(e.ASSETS.calls.length, 0);
    }
    const forged = await handle(
        get("https://docs.dev.example/api", {
            cookie: "saroh-dev-access=right-key",
        }),
        env(),
    );
    assert.equal(forged.status, 404);
    const open = await handle(
        get("https://docs.dev.example/api?access=right-key"),
        env(),
    );
    assert.equal(open.status, 303);
    assert.equal(open.headers.get("location"), "https://docs.dev.example/api");
    const cookie = open.headers.get("set-cookie");
    assert.ok(!cookie.includes("right-key"));
    assert.match(cookie, /Domain=\.dev\.example/);
    const e = env();
    const next = await handle(
        get("https://docs.dev.example/api", { cookie: cookie.split(";")[0] }),
        e,
    );
    assert.equal(next.status, 200);
    assert.equal(next.headers.get("x-robots-tag"), "noindex, nofollow");
});
