#!/usr/bin/env node
/**
 * Load smoke for the public paths a merchant's customers hit (#106).
 *
 *   node scripts/load-smoke.mjs [--target http://localhost:3333]
 *        [--seconds 20] [--concurrency 10] [--only enquiry,slots,book,checkout]
 *
 * LOCAL STACK ONLY. It refuses any target that isn't localhost or 127.0.0.1,
 * because it writes enquiries and bookings. Run it against the seeded e2e
 * stack (showcase seed): it uses Pulse Fitness's enquiry form and HIIT class,
 * and Northwind's first order.
 *
 * No dependencies: Node's fetch, a closed loop of `--concurrency` workers per
 * path for `--seconds`, and percentiles computed from every latency. That's
 * enough to find a slow query or a lock, which is the smoke's job. It is not a
 * capacity test. autocannon would add a dependency for no extra answer here.
 *
 * Each simulated visitor sends its own X-Forwarded-For from TEST-NET-2, so the
 * per-IP rate limits behave as they would for many real customers. The API has
 * to trust the local proxy for that: start it with TRUST_PROXY=private. With
 * `--one-visitor`, every request comes from one address instead, to show the
 * limits refusing.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
        const next = process.argv[i + 1];
        if (next === undefined || next.startsWith("--"))
            args.set(a.slice(2), "true");
        else args.set(a.slice(2), process.argv[++i]);
    }
}

const target = new URL(args.get("target") ?? "http://localhost:3333");
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    console.error(
        `Refusing to run against ${target.origin}: the load smoke writes enquiries and bookings, and runs against the local stack only.`,
    );
    process.exit(2);
}
const seconds = Number(args.get("seconds") ?? 20);
const concurrency = Number(args.get("concurrency") ?? 10);
const only = args.get("only")?.split(",");
const oneVisitor = args.get("one-visitor") === "true";

const FORM = args.get("form") ?? "seed_sc_pulse_form_3_2";
const SERVICE = args.get("service") ?? "seed_sc_pulse_service_1";
const ORDER = args.get("order") ?? "seed_order_1";

let visitor = 0;
function nextIp() {
    if (oneVisitor) return "198.51.100.1";
    visitor++;
    return `198.51.${100 + ((visitor >> 8) % 100)}.${visitor % 256}`;
}

async function call(method, path, body) {
    const started = performance.now();
    let status = 0;
    try {
        const res = await fetch(new URL(path, target), {
            method,
            headers: {
                "content-type": "application/json",
                "x-forwarded-for": nextIp(),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        status = res.status;
        await res.arrayBuffer();
    } catch {
        status = 0; // connection refused, reset or timed out
    }
    return { ms: performance.now() - started, status };
}

/** Free class sessions over the next two weeks, fetched once. */
async function sessions() {
    const res = await fetch(
        new URL(`/public/services/${SERVICE}/days`, target),
    );
    const body = await res.json();
    return body.days.flatMap((d) => d.starts.map((s) => s.startAt));
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}-${(n++).toString(36)}`;

async function scenarios() {
    const starts = await sessions();
    if (starts.length === 0) throw new Error(`${SERVICE} has no open sessions`);
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86_400_000);
    return {
        enquiry: () =>
            call("POST", `/public/forms/${FORM}/submit`, {
                data: {
                    name: "Load Smoke",
                    email: `load-${uniq()}@example.com`,
                    phone: "9876543210",
                    message: "Load smoke enquiry",
                },
                idempotencyKey: `load-${uniq()}`,
            }),
        slots: () =>
            call(
                "GET",
                `/public/services/${SERVICE}/availability?from=${from.toISOString()}&to=${to.toISOString()}`,
            ),
        book: () =>
            call("POST", `/public/services/${SERVICE}/book`, {
                startAt: starts[n % starts.length],
                bookerName: "Load Smoke",
                bookerEmail: `book-${uniq()}@example.com`,
                idempotencyKey: `load-${uniq()}`,
            }),
        // Checkout start as far as it runs without a payment provider: the
        // buyer's receipt read, which the checkout page polls. Creating a real
        // intent calls Razorpay or Cashfree, which a load smoke must not do.
        checkout: () => call("GET", `/public/orders/${ORDER}/receipt`),
    };
}

function pct(sorted, p) {
    if (sorted.length === 0) return 0;
    return sorted[
        Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    ];
}

async function run(name, fn) {
    const results = [];
    const deadline = Date.now() + seconds * 1000;
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (Date.now() < deadline) results.push(await fn());
        }),
    );
    const ms = results.map((r) => r.ms).sort((a, b) => a - b);
    const byStatus = {};
    for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const errors = results.filter(
        (r) => r.status === 0 || r.status >= 500,
    ).length;
    return {
        path: name,
        requests: results.length,
        rps: +(results.length / seconds).toFixed(1),
        p50: +pct(ms, 50).toFixed(1),
        p95: +pct(ms, 95).toFixed(1),
        p99: +pct(ms, 99).toFixed(1),
        errorRate: +((errors / Math.max(1, results.length)) * 100).toFixed(2),
        statuses: byStatus,
    };
}

const all = await scenarios();
const rows = [];
for (const [name, fn] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    rows.push(await run(name, fn));
}
console.log(
    `target ${target.origin} · ${concurrency} concurrent per path · ${seconds}s each${oneVisitor ? " · one visitor" : ""}`,
);
console.table(
    rows.map((r) => ({ ...r, statuses: JSON.stringify(r.statuses) })),
);
console.log(
    "errorRate counts 5xx and failed connections; 4xx are business answers.",
);
