// The no-refresh check (DEC-259 U5, KTD-9).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CHROME_CAP,
    checkRefresh,
    matchRoute,
    refreshLines,
    routeOf,
} from "./check-no-refresh-in-rq.mjs";

const APP = "apps/app.saroh.in/";

/** A tree in memory: `{ relative path: text }`. */
function run(tree, { routes = [], domains = [], chrome } = {}) {
    const files = {
        [`${APP}lib/query/rq-routes.ts`]: `export const RQ_ROUTES: readonly string[] = ${JSON.stringify(routes)};
export const RQ_DOMAINS: readonly string[] = ${JSON.stringify(domains)};`,
        ...Object.fromEntries(
            Object.entries(tree).map(([k, v]) => [APP + k, v]),
        ),
    };
    if (chrome) {
        files[`${APP}lib/query/chrome-refresh.ts`] =
            `export const CHROME_REFRESH_ROUTES: readonly string[] = ${JSON.stringify(chrome)};`;
    }
    return checkRefresh(Object.keys(files), (f) => files[f]);
}

const TREE = {
    "app/(shell)/commerce/orders/page.tsx": `import { Screen } from "@/components/orders/screen";`,
    "components/orders/screen.tsx": `import { useStep } from "./use-step";`,
    "components/orders/use-step.ts": `export function useStep() {\n    router.refresh();\n}`,
};

test("router.refresh() reached from a registered route fails, at any depth", () => {
    const { errors } = run(TREE, { routes: ["/commerce/orders"] });
    assert.equal(errors.length, 1);
    assert.match(
        errors[0],
        /components\/orders\/use-step\.ts:2: .*\/commerce\/orders/,
    );
});

test("router.refresh() in an unregistered route passes", () => {
    assert.deepEqual(run(TREE, { routes: ["/commerce/products"] }).errors, []);
    assert.deepEqual(run(TREE).errors, []);
});

test("a [param] glob matches its folder", () => {
    const tree = {
        "app/(shell)/commerce/orders/[orderId]/page.tsx": `x.refresh();`,
    };
    assert.equal(
        run(tree, { routes: ["/commerce/orders/[orderId]"] }).errors.length,
        1,
    );
    assert.equal(run(tree, { routes: ["/commerce/orders"] }).errors.length, 0);
});

test("a chrome entry may refresh; more than the cap fails", () => {
    assert.deepEqual(
        run(TREE, {
            routes: ["/commerce/orders"],
            chrome: ["/commerce/orders"],
        }).errors,
        [],
    );
    const many = Array.from({ length: CHROME_CAP + 1 }, (_, i) => `/r${i}`);
    assert.match(run({}, { chrome: many }).errors[0], /at most 6/);
});

test("a marked line, a comment, and React Query's own plumbing pass", () => {
    assert.deepEqual(
        refreshLines(`// rq-refresh-ok: business switch\nrouter.refresh();`),
        [],
    );
    assert.deepEqual(
        refreshLines(`/** never router.refresh() here */\n// router.refresh()`),
        [],
    );
    const tree = {
        "app/(shell)/page.tsx": `import { Q } from "@/components/shared/query/query-provider";`,
        "components/shared/query/query-provider.tsx": `router.refresh();`,
    };
    assert.deepEqual(run(tree, { routes: ["/"] }).errors, []);
});

test("revalidatePath in a React Query domain's actions is a warning, not an error", () => {
    const tree = {
        "lib/orders/actions.ts": `revalidatePath("/commerce/orders");\n// rq-revalidate-ok: the public page\nrevalidatePath("/x");`,
        "lib/products/actions.ts": `revalidatePath("/commerce/products");`,
    };
    const { errors, warnings } = run(tree, { domains: ["orders"] });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /lib\/orders\/actions\.ts:1/);
});

test("routeOf drops groups and private folders; matchRoute is exact", () => {
    assert.equal(
        routeOf(`${APP}app/(shell)/commerce/orders/_parts/x.tsx`),
        "/commerce/orders",
    );
    assert.equal(routeOf(`${APP}app/(shell)/page.tsx`), "/");
    assert.equal(routeOf(`${APP}components/x.tsx`), null);
    assert.ok(matchRoute("/a/[id]", "/a/[orderId]"));
    assert.ok(!matchRoute("/a", "/a/b"));
});
