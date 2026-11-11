#!/usr/bin/env node
/**
 * Gets a seeded copy ready for the k6 runs (docs/architecture/runbooks/API_LOAD_TEST.md):
 * switches the public API on for the businesses it uses, lifts their
 * per-minute caps for a day so the run measures the API rather than the
 * limiter, and makes the keys the scripts use (a publishable, a secret, and
 * one AI-switched secret per `LOAD_MCP_ORGS` business), all through the API
 * as staff and the owner would. Prints `export LOAD_…=` lines; the keys are
 * never written to a file by this script.
 *
 *   LOAD_API_URL=http://localhost:4999 LOAD_PASSWORD=… node e2e/load/setup.mjs > "$TMPDIR/load.env"
 *
 * Refuses any API that isn't on this machine: never production, dev or a shared host.
 */
const api = process.env.LOAD_API_URL ?? "http://localhost:4999";
const org = process.env.LOAD_ORG ?? "seed_org";
// The publishable key's business: one whose published site has a shop.
const shopOrg = process.env.LOAD_STOREFRONT_ORG ?? "seed_sc_pb_org";
const origin = process.env.LOAD_APP_ORIGIN ?? "http://localhost:4998";
const siteOrigin = process.env.LOAD_SITE_ORIGIN ?? "http://localhost:4599";
const password = process.env.LOAD_PASSWORD;
// A load run's cap: high enough that the limiter never answers, so the
// numbers are the API's. The real caps are the catalogue's, set by the owner.
const rpm = Number(process.env.LOAD_RPM ?? 1_000_000);

if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(api).hostname)) {
    throw new Error(`Refusing ${api}: load setup runs on this machine only.`);
}
if (!password) throw new Error("Set LOAD_PASSWORD (the seed's password).");

const stamp = Date.now().toString(36);

async function signIn(email) {
    const res = await fetch(`${api}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`sign in ${email}: ${res.status}`);
    const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    return async (method, path, body) => {
        const r = await fetch(`${api}${path}`, {
            method,
            headers: { "content-type": "application/json", origin, cookie },
            body: JSON.stringify(body),
        });
        const text = await r.text();
        if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text}`);
        return text ? JSON.parse(text) : {};
    };
}

const reason = "Load test on a seeded copy";
const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
const staff = await signIn(process.env.LOAD_STAFF_EMAIL ?? "staff@saroh.dev");
const owner = await signIn(process.env.LOAD_OWNER_EMAIL ?? "demo@saroh.dev");

// MCP also has an instance-wide switch (`mcp-auth.guard.ts`): on, on this copy.
await staff("PUT", "/admin/flags/API_MCP", {
    enabled: true,
    reason,
    idempotencyKey: `load-API_MCP-global-${stamp}`,
});

/** Switches the API on for one business and lifts its caps for the run. */
async function open(id) {
    // The API's switches, and the shop's, which the storefront reads need.
    for (const flag of [
        "API_STOREFRONT",
        "API_SECRET",
        "API_MCP",
        "SITE_SHOP",
        "MODULE_COMMERCE",
    ]) {
        await staff("PUT", `/admin/flags/${flag}/organizations/${id}`, {
            enabled: true,
            reason,
            idempotencyKey: `load-${flag}-${id}-${stamp}`,
        });
    }
    const overrides = `/admin/organizations/${id}/overrides/modules`;
    for (const moduleKey of [
        "api-keys",
        "api-storefront",
        "api-secret",
        "api-mcp",
    ]) {
        const limited = moduleKey !== "api-keys";
        try {
            // A row must be on before its limit can be set.
            for (const kind of limited ? ["grant", "limit"] : ["grant"]) {
                await staff("POST", overrides, {
                    kind,
                    moduleKey,
                    ...(kind === "limit" ? { value: rpm } : {}),
                    reason,
                    expiresAt,
                    idempotencyKey: `load-${kind}-${moduleKey}-${id}-${stamp}`,
                });
            }
        } catch (error) {
            // The sample catalogue has no MCP row: that surface then runs
            // at the API's fallback cap, so spread MCP over LOAD_MCP_ORGS.
            if (!/isn't a module/.test(String(error))) throw error;
            console.error(
                `# ${id}: no ${moduleKey} row in this catalogue; its fallback cap applies`,
            );
        }
    }
}

const scope = [
    "store:read",
    "store:write",
    "inventory:write",
    "service:read",
    "service:write",
    "booking:read",
    "booking:write",
    "contact:read",
    "contact:write",
    "order:read",
    "order:create",
    "lead:read",
    "form:read",
    "site:read",
    "subscription:read",
];
const keyOf = async (id, body) =>
    (await owner("POST", `/organizations/${id}/api-keys`, body)).token;

await open(org);
if (shopOrg !== org) await open(shopOrg);
const pk = await keyOf(shopOrg, {
    kind: "PUBLISHABLE",
    name: `Load site ${stamp}`,
    allowedOrigins: [siteOrigin],
});
const sk = await keyOf(org, {
    kind: "SECRET",
    name: `Load server ${stamp}`,
    scope,
});

// One AI key per business named: an agent works in one business, and each
// business has its own MCP cap.
const mcpOrgs = (process.env.LOAD_MCP_ORGS ?? org).split(",").filter(Boolean);
const ai = [];
for (const id of mcpOrgs) {
    if (id !== org) {
        try {
            await open(id);
        } catch (error) {
            if (!/catalogue plan/.test(String(error))) throw error;
            console.error(`# ${id}: on no catalogue plan, skipped`);
            continue;
        }
    }
    ai.push(
        await keyOf(id, {
            kind: "SECRET",
            name: `Load AI ${stamp}`,
            scope,
            aiEnabled: true,
        }),
    );
}

console.log(`export LOAD_API_URL=${api}`);
console.log(`export LOAD_SITE_ORIGIN=${siteOrigin}`);
console.log(`export LOAD_PK=${pk}`);
console.log(`export LOAD_SK=${sk}`);
console.log(`export LOAD_SK_AI=${ai.join(",")}`);
