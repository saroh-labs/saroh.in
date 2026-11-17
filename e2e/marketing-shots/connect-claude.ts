/**
 * Connect Claude to Rye & Co. on the local capture stack, the way claude.ai
 * does, so `ai-activity` has a connection and its changes to show:
 *
 *   pnpm --filter @saroh/e2e shots:connect-claude              # connect
 *   pnpm --filter @saroh/e2e shots:connect-claude --edition=global  # to Thistlewick Bakery
 *   pnpm --filter @saroh/e2e shots:connect-claude tools        # list tools
 *   pnpm --filter @saroh/e2e shots:connect-claude call <tool> '<json args>'
 *
 * Claude's own sign-in (its published client document) runs in a browser
 * signed in as the demo owner: Pick a business (Rye & Co.), then Allow.
 * claude.ai's callback is answered inside the browser, so the code never
 * leaves this machine; it is traded for a token here, kept in the ignored
 * `e2e/.auth/claude-mcp.json` and never printed. Local only: it refuses an
 * API that isn't on `.localhost`.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { chromium, request } from "@playwright/test";

import { urls } from "../playwright.config";
import { BUSINESSES, ROLES } from "./shots.config";

const CLIENT_ID = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const TOKEN_FILE = path.join(__dirname, "../.auth/claude-mcp.json");
const PASSWORD = "demo-password-123";
/** The business ticked: Rye & Co., or saroh.tech's bakery with `--edition=global`. */
const BUSINESS = process.argv.includes("--edition=global")
    ? BUSINESSES.thistlewick.name
    : BUSINESSES.rye.name;

const api = new URL(urls.API_URL);
if (!api.hostname.endsWith(".localhost")) {
    throw new Error(`Local stacks only; the API is ${api.host}`);
}
const MCP = `${api.protocol}//${api.host.replace(/^api\./, "mcp.")}/mcp`;

async function connect() {
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = `${urls.API_URL}/api/auth/oauth2/authorize?${new URLSearchParams(
        {
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT,
            scope: "saroh:read saroh:write offline_access",
            code_challenge: challenge,
            code_challenge_method: "S256",
            state: "shots",
            resource: MCP,
        },
    ).toString()}`;

    const browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    let gotCode: (value: string) => void = () => undefined;
    const codeBack = new Promise<string>((resolve, reject) => {
        gotCode = resolve;
        setTimeout(() => reject(new Error("No callback after Allow")), 60_000);
    });
    // Answer claude.ai here: nothing is sent to it.
    await context.route("https://claude.ai/**", async (route) => {
        const back = new URL(route.request().url()).searchParams;
        const value = back.get("code");
        if (value) gotCode(value);
        else console.log("callback without a code:", back.get("error") ?? "");
        await route.fulfill({ status: 200, body: "connected" });
    });
    await page.goto(
        `${urls.ACCOUNTS_URL}/login?with=password&redirect=/account`,
    );
    await page.getByLabel("Email").fill(ROLES.owner);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.goto(authorize);
    await page.getByRole("checkbox", { name: BUSINESS }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    // Allowed once already, a sign-in goes straight back without asking.
    const allow = page.getByRole("button", { name: "Allow", exact: true });
    await Promise.race([
        codeBack,
        allow.click({ timeout: 30_000 }).catch(() => undefined),
    ]);
    const code = await codeBack;
    await browser.close();

    // The local certificate is portless's own; the browser's client trusts it.
    const http = await request.newContext({ ignoreHTTPSErrors: true });
    const res = await http.post(`${urls.API_URL}/api/auth/oauth2/token`, {
        form: {
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            code_verifier: verifier,
            resource: MCP,
        },
    });
    if (!res.ok())
        throw new Error(`Token: ${res.status()} ${await res.text()}`);
    const { access_token } = (await res.json()) as { access_token: string };
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token }), {
        mode: 0o600,
    });
    console.log(`Claude connected to ${BUSINESS}; token kept in e2e/.auth.`);
}

let id = 0;
async function rpc(method: string, params: unknown) {
    const { access_token } = JSON.parse(
        fs.readFileSync(TOKEN_FILE, "utf8"),
    ) as { access_token: string };
    const http = await request.newContext({ ignoreHTTPSErrors: true });
    const res = await http.post(MCP, {
        headers: {
            authorization: `Bearer ${access_token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: ++id, method, params },
    });
    const text = await res.text();
    // Streamable HTTP may answer as one SSE event.
    const body =
        text.startsWith("event:") || text.startsWith("data:")
            ? (text
                  .split("\n")
                  .find((l) => l.startsWith("data:"))
                  ?.slice(5) ?? "")
            : text;
    if (!res.ok())
        throw new Error(`${method}: ${res.status()} ${text.slice(0, 400)}`);
    return JSON.parse(body) as { result?: unknown; error?: unknown };
}

async function main() {
    const [command, tool, args] = process.argv
        .slice(2)
        .filter((a) => !a.startsWith("--"));
    if (!command) return connect();
    if (command === "tools") {
        const out = (await rpc("tools/list", {})) as {
            result?: { tools: { name: string }[] };
        };
        console.log(out.result?.tools.map((t) => t.name).join(" "));
        return;
    }
    if (command === "schema") {
        const out = (await rpc("tools/list", {})) as {
            result?: { tools: { name: string; inputSchema: unknown }[] };
        };
        const t = out.result?.tools.find((x) => x.name === tool);
        console.log(JSON.stringify(t?.inputSchema, null, 1));
        return;
    }
    if (command === "call") {
        const out = await rpc("tools/call", {
            name: tool,
            arguments: args ? (JSON.parse(args) as unknown) : {},
        });
        // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by hand to see a long reply; not a build input
        const max = Number(process.env.OUT_MAX ?? 3000);
        console.log(JSON.stringify(out, null, 1).slice(0, max));
        return;
    }
    throw new Error(`Unknown command ${command}`);
}

void main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
