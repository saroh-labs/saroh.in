// The read-route check (DEC-259 U5, KTD-3).
import assert from "node:assert/strict";
import { test } from "node:test";

import { ALLOWED, checkRoutes, routeProblems } from "./check-rq-routes.mjs";

const GOOD = `import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { ordersList } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";
export const GET = readRoute({ read: ordersList, service }, access);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
`;

test("a readRoute file passes", () => {
    assert.deepEqual(routeProblems(GOOD), []);
});

test("a route exporting POST fails", () => {
    const src = `${GOOD}export async function POST() {}\n`;
    assert.match(routeProblems(src)[0].why, /exports something other/);
});

test("a route not using readRoute fails, and its own answer is flagged", () => {
    const src = `export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json([]); }
`;
    const whys = routeProblems(src).map((p) => p.why);
    assert.ok(whys.some((w) => /needs export const GET = readRoute/.test(w)));
    assert.ok(whys.some((w) => /needs .*NOT_ALLOWED/.test(w)));
    assert.ok(whys.some((w) => /exports something other/.test(w)));
    assert.ok(
        whys.some((w) => /NextResponse: answer only through readRoute/.test(w)),
    );
});

test("no dynamic, or Response.json, fails", () => {
    assert.match(
        routeProblems(GOOD.replace(/^export const dynamic.*\n/m, ""))[0].why,
        /force-dynamic/,
    );
    assert.match(
        routeProblems(`${GOOD}const x = Response.json({});\n`)[0].why,
        /Response\.json/,
    );
});

test("allowlisted routes are skipped, a gone one fails", () => {
    const out = checkRoutes("/nonexistent", ALLOWED.slice(1));
    assert.equal(out.length, 1);
    assert.match(out[0], /gone; drop it/);
});
