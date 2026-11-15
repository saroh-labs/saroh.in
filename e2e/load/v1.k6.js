// `/v1` with a secret key: a business's own server reading its day and
// writing customers, orders and bookings, each write with an
// Idempotency-Key. A seeded copy on this machine only
// (docs/architecture/runbooks/API_LOAD_TEST.md).
//
//   k6 run --include-system-env-vars e2e/load/v1.k6.js   (LOAD_API_URL, LOAD_SK)
//
// Bookings are made and then cancelled, so a run frees the slots it took
// and can be run again on the same copy.
import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";

const api = __ENV.LOAD_API_URL;
const sk = __ENV.LOAD_SK;
const duration = __ENV.LOAD_DURATION ?? "2m";

export const options = {
    scenarios: {
        reads: {
            executor: "constant-arrival-rate",
            exec: "reads",
            rate: Number(__ENV.LOAD_READ_RPS ?? 20),
            timeUnit: "1s",
            duration,
            preAllocatedVUs: 20,
            maxVUs: 200,
        },
        writes: {
            executor: "constant-arrival-rate",
            exec: "writes",
            rate: Number(__ENV.LOAD_WRITE_RPS ?? 5),
            timeUnit: "1s",
            duration,
            preAllocatedVUs: 10,
            maxVUs: 100,
        },
    },
    // The targets: reads under 300 ms and writes under 800 ms at the 95th
    // percentile, fewer than 0.5 % failing.
    thresholds: {
        http_req_failed: ["rate<0.005"],
        "http_req_duration{kind:read}": ["p(95)<300"],
        "http_req_duration{kind:write}": ["p(95)<800"],
    },
};

const auth = { authorization: `Bearer ${sk}` };

function read(path, route) {
    const res = http.get(`${api}/v1${path}`, {
        headers: auth,
        tags: { kind: "read", route },
    });
    check(res, { [`${route} 200`]: (r) => r.status === 200 });
    return res;
}

let n = 0;
function write(method, path, body, route) {
    n += 1;
    const res = http.request(method, `${api}/v1${path}`, JSON.stringify(body), {
        headers: {
            ...auth,
            "content-type": "application/json",
            "idempotency-key": `load-${exec.vu.idInTest}-${n}-${Date.now()}`,
        },
        tags: { kind: "write", route },
    });
    check(res, { [`${route} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
    return res;
}

export function setup() {
    if (!api || !sk) throw new Error("Set LOAD_API_URL and LOAD_SK.");
    const get = (p) =>
        http.get(`${api}/v1${p}`, { headers: auth }).json("data");
    const products = get("/products?limit=100").filter(
        (p) => p.status === "published",
    );
    const services = get("/services?limit=50").filter(
        (s) => s.status === "active",
    );
    const customers = get("/customers?limit=100");
    const orders = get("/orders?limit=100");
    const bookings = get("/bookings?limit=100");
    // Orders hold stock, so a run would sell the shelves out and measure
    // "Sold out": count a product-level stock well up first (itself a write
    // the run makes), and order only those.
    const stocked = [];
    for (const p of products.slice(0, 20)) {
        const path = `${api}/v1/products/${p.id}/stock`;
        const stock = http.get(path, { headers: auth }).json();
        if (stock.mode !== "product") continue;
        const counted = http.patch(
            path,
            JSON.stringify({ quantity: stock.reserved + 1_000_000 }),
            {
                headers: {
                    ...auth,
                    "content-type": "application/json",
                    "idempotency-key": `load-stock-${p.id}-${Date.now()}`,
                },
            },
        );
        if (counted.status === 200) stocked.push(p);
    }
    if (!stocked.length || !services.length || !customers.length) {
        throw new Error(
            "The key's business needs stocked products, services and customers.",
        );
    }
    return {
        products: stocked.map((p) => ({
            id: p.id,
            variant: p.variants?.[0]?.id,
        })),
        services: services.map((s) => s.id),
        customers: customers.map((c) => c.id),
        orders: orders.map((o) => o.id),
        bookings: bookings.map((b) => b.id),
        // A business with two storefronts names one on each order.
        storefront: orders[0]?.storefrontId,
        stamp: Date.now().toString(36),
    };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function reads(data) {
    const r = Math.random();
    if (r < 0.15) read("/products?limit=50", "products");
    else if (r < 0.25) read(`/products/${pick(data.products).id}`, "product");
    else if (r < 0.4) read("/customers?limit=50", "customers");
    else if (r < 0.5) read(`/customers/${pick(data.customers)}`, "customer");
    else if (r < 0.65) read("/orders?limit=50", "orders");
    else if (r < 0.72) read(`/orders/${pick(data.orders)}`, "order");
    else if (r < 0.85) read("/bookings?limit=50", "bookings");
    else if (r < 0.9 && data.bookings.length)
        read(`/bookings/${pick(data.bookings)}`, "booking");
    else if (r < 0.95) read("/services", "services");
    else read("/enquiries?limit=50", "enquiries");
}

/** The i-th weekday working hour (09:00–16:00 local, 03:30Z + h), from the day after tomorrow. */
function slot(i) {
    const day = new Date(Date.now() + 2 * 864e5);
    for (
        let weekdays = Math.floor(i / 8);
        ;
        day.setUTCDate(day.getUTCDate() + 1)
    ) {
        if ([0, 6].includes(day.getUTCDay())) continue;
        if (weekdays-- === 0) break;
    }
    day.setUTCHours(3 + (i % 8), 30, 0, 0);
    return day.toISOString();
}

export function writes(data) {
    const i = exec.scenario.iterationInTest;
    const email = `load-${data.stamp}-${i}@example.com`;
    const r = Math.random();
    if (r < 0.35) {
        write(
            "POST",
            "/customers",
            { email, firstName: "Load", lastName: `Run ${i}` },
            "customer_create",
        );
    } else if (r < 0.5) {
        write(
            "PATCH",
            `/customers/${pick(data.customers)}`,
            { company: `Load ${i}` },
            "customer_patch",
        );
    } else if (r < 0.8) {
        const p = pick(data.products);
        write(
            "POST",
            "/orders",
            {
                items: [
                    {
                        productId: p.id,
                        ...(p.variant ? { variantId: p.variant } : {}),
                        quantity: 1,
                    },
                ],
                customer: { email, name: `Load ${i}` },
                ...(data.storefront ? { storefrontId: data.storefront } : {}),
            },
            "order_create",
        );
    } else {
        // One service per slot, so two writes never race for one place.
        const service = data.services[i % data.services.length];
        const made = write(
            "POST",
            "/bookings",
            {
                serviceId: service,
                startAt: slot(Math.floor(i / data.services.length)),
                bookerEmail: email,
                bookerName: `Load ${i}`,
            },
            "booking_create",
        );
        if (made.status === 201 || made.status === 200) {
            write(
                "POST",
                `/bookings/${made.json("id")}/cancel`,
                {},
                "booking_cancel",
            );
        }
    }
}
