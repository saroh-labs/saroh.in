// `/mcp` with secret keys that have the AI switch on: an AI app listing
// the tools and calling the day-to-day reads. A seeded copy on this machine
// only (docs/architecture/runbooks/API_LOAD_TEST.md).
//
//   k6 run --include-system-env-vars e2e/load/mcp.k6.js   (LOAD_MCP_URL, LOAD_SK_AI)
//
// LOAD_MCP_URL is the MCP address, `http://mcp.<the API's host after api.>/mcp`:
// the API answers MCP only on the host its sign-in names. LOAD_SK_AI is one
// key or several, comma-separated, each in its own business, as each
// business has its own MCP cap; requests take them in turn.
import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Rate } from "k6/metrics";

const url = __ENV.LOAD_MCP_URL;
const keys = (__ENV.LOAD_SK_AI ?? "").split(",").filter(Boolean);
const toolErrors = new Rate("mcp_tool_errors");

export const options = {
    scenarios: {
        agents: {
            executor: "constant-arrival-rate",
            rate: Number(__ENV.LOAD_RPS ?? 10),
            timeUnit: "1s",
            duration: __ENV.LOAD_DURATION ?? "2m",
            preAllocatedVUs: 20,
            maxVUs: 200,
        },
    },
    // The targets: a tool call under 1 s at the 95th percentile, fewer than
    // 0.5 % failing, in HTTP or as a JSON-RPC or tool error.
    thresholds: {
        http_req_failed: ["rate<0.005"],
        mcp_tool_errors: ["rate<0.005"],
        "http_req_duration{rpc:tools/call}": ["p(95)<1000"],
        "http_req_duration{rpc:tools/list}": ["p(95)<1000"],
    },
};

/** The JSON-RPC answer, from a JSON body or an SSE `data:` frame. */
function answer(res) {
    const text = res.body ?? "";
    const json = text.startsWith("{")
        ? text
        : text
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5))
              .join("");
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function rpc(key, method, params, tool) {
    const res = http.post(
        url,
        JSON.stringify({
            jsonrpc: "2.0",
            id: exec.scenario.iterationInTest,
            method,
            params,
        }),
        {
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                "mcp-protocol-version": "2025-11-25",
            },
            tags: { rpc: method, tool: tool ?? method },
        },
    );
    const body = answer(res);
    const ok =
        res.status === 200 && body && !body.error && !body.result?.isError;
    toolErrors.add(!ok);
    check(res, { [`${tool ?? method} ok`]: () => ok });
    return body;
}

export function setup() {
    if (!url || keys.length === 0)
        throw new Error("Set LOAD_MCP_URL and LOAD_SK_AI.");
}

const READS = [
    ["saroh_start", {}],
    ["list_products", { limit: 20 }],
    ["list_orders", { limit: 20 }],
    ["list_customers", { limit: 20 }],
    ["list_bookings", { limit: 20 }],
    ["list_services", {}],
    ["list_enquiries", { limit: 20 }],
];

export default function () {
    const i = exec.scenario.iterationInTest;
    const key = keys[i % keys.length];
    if (Math.random() < 0.25) {
        rpc(key, "tools/list", {});
        return;
    }
    const [name, args] = READS[Math.floor(Math.random() * READS.length)];
    rpc(key, "tools/call", { name, arguments: args }, name);
}
