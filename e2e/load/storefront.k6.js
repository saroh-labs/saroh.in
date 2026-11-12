// Storefront reads with a publishable key: the website's traffic through
// ApiKeyGuard, its key-context cache and the limiter, then the shop and
// booking reads. A seeded copy on this machine only
// (docs/architecture/runbooks/API_LOAD_TEST.md).
//
//   k6 run --include-system-env-vars e2e/load/storefront.k6.js   (LOAD_API_URL, LOAD_PK, LOAD_SITE_ORIGIN)
//
// Each request comes from its own made-up visitor address in
// CF-Connecting-IP, which the API reads from loopback with
// TRUST_PROXY=cloudflare (as in production behind the tunnel), so the
// per-visitor limits see many visitors, as on the internet, not one machine.
import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";

const api = __ENV.LOAD_API_URL;
const pk = __ENV.LOAD_PK;
const origin = __ENV.LOAD_SITE_ORIGIN;
const rate = Number(__ENV.LOAD_RPS ?? 50);

export const options = {
    scenarios: {
        reads: {
            executor: "constant-arrival-rate",
            rate,
            timeUnit: "1s",
            duration: __ENV.LOAD_DURATION ?? "2m",
            preAllocatedVUs: 50,
            maxVUs: 300,
        },
    },
    // The targets: catalogue and availability reads under 300 ms at the
    // 95th percentile, fewer than 0.5 % failing.
    thresholds: {
        http_req_failed: ["rate<0.005"],
        http_req_duration: ["p(95)<300"],
        "http_req_duration{route:products}": ["p(95)<300"],
        "http_req_duration{route:availability}": ["p(95)<300"],
    },
};

const base = () => `${api}/v1/storefront/${pk}`;

function visitor() {
    const n = exec.scenario.iterationInTest;
    return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

function get(path, route) {
    const res = http.get(`${base()}${path}`, {
        headers: { origin, "cf-connecting-ip": visitor() },
        tags: { route },
    });
    check(res, { [`${route} 200`]: (r) => r.status === 200 });
    return res;
}

export function setup() {
    if (!api || !pk || !origin) {
        throw new Error("Set LOAD_API_URL, LOAD_PK and LOAD_SITE_ORIGIN.");
    }
    const headers = { origin, "cf-connecting-ip": "10.255.255.254" };
    const products = http
        .get(`${base()}/products?limit=100`, { headers })
        .json("data");
    const services = http.get(`${base()}/services`, { headers }).json("data");
    if (!products?.length || !services?.length) {
        throw new Error(
            "The key's business needs a shop with products and a bookable service.",
        );
    }
    return {
        slugs: products.map((p) => p.slug),
        services: services.map((s) => s.id),
    };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function (data) {
    const r = Math.random();
    const service = pick(data.services);
    if (r < 0.3) get("/products?limit=24", "products");
    else if (r < 0.5) get(`/products/${pick(data.slugs)}`, "product");
    else if (r < 0.6) get("/stock", "stock");
    else if (r < 0.7) get("/services", "services");
    else if (r < 0.8) {
        const from = new Date(
            Date.now() + (1 + Math.floor(Math.random() * 14)) * 864e5,
        );
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(from.getTime() + 864e5);
        get(
            `/services/${service}/availability?from=${from.toISOString()}&to=${to.toISOString()}`,
            "availability",
        );
    } else if (r < 0.85) get(`/services/${service}/days`, "days");
    else if (r < 0.9) get(`/services/${service}/staff`, "staff");
    else if (r < 0.95) get("/posts", "posts");
    else get("/plans", "plans");
}
