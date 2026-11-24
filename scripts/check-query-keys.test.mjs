// The query-key check (DEC-259 U5): keys only from domainKey in a
// lib/<domain>/queries.ts, fetchers only in lib/query (they send the org
// from the key), no server QueryClient in a client file.
import assert from "node:assert/strict";
import { test } from "node:test";

import { keyProblems } from "./check-query-keys.mjs";

const APP = "apps/app.saroh.in/";
const whys = (file, text) => keyProblems(APP + file, text).map((p) => p.why);

test("an inline key in a component fails, org or not", () => {
    const src = `useQuery({ queryKey: ["orders", "list"], queryFn: f });`;
    const out = whys("components/orders/list.tsx", src);
    assert.equal(out.length, 2);
    assert.match(out[0], /inline query key/);
    assert.match(out[1], /fetcher outside lib\/query/);
});

test("domainKey outside a queries file fails", () => {
    const src = `const k = domainKey("orders", orgId, "list");`;
    assert.match(whys("components/orders/list.tsx", src)[0], /queries\.ts/);
    assert.match(whys("lib/orders/service.ts", src)[0], /queries\.ts/);
});

test("the trial-style key factory passes", () => {
    const src = `import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";
export const ordersList = defineRead<Order[]>()({
    key: (orgId, p) => domainKey("orders", orgId, "list", p),
    route: { path: "/api/orders", params: { q: searchText } },
});`;
    assert.deepEqual(whys("lib/orders/queries.ts", src), []);
    // and a component using it
    const use = `const q = useQuery(ordersList.options(orgId, { q }));`;
    assert.deepEqual(whys("components/orders/list.tsx", use), []);
});

test("apiRead outside defineRead fails: the org must come from the key", () => {
    const src = `queryFn: () => apiRead<Order[]>("/api/orders", {}, { orgId })`;
    const out = whys("lib/orders/queries.ts", src);
    assert.ok(out.some((w) => /defineRead/.test(w)));
    assert.deepEqual(whys("lib/query/define-read.ts", src), []);
});

test("a client file importing the server QueryClient fails; a server file passes", () => {
    const src = `import { getServerQueryClient } from "@/lib/query/server-client";`;
    assert.match(
        whys("components/orders/x.tsx", `"use client";\n${src}`)[0],
        /server QueryClient/,
    );
    assert.deepEqual(whys("app/(shell)/commerce/orders/page.tsx", src), []);
});

test("tests and files outside the app are not checked", () => {
    const src = `qc.setQueryData(domainKey("orders", "o1"), []); ({ queryKey: ["x"] })`;
    assert.deepEqual(whys("components/x.test.tsx", src), []);
    assert.deepEqual(whys("lib/query/test-utils.tsx", src), []);
    assert.deepEqual(keyProblems("apps/admin.saroh.in/x.tsx", src), []);
});
