import { createHash, randomBytes } from "node:crypto";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    businessSetKey,
    businessSetOf,
    MCP_ACCESS_TOKEN_SECONDS,
    MCP_NO_REFRESH_TOKEN_SECONDS,
    mcpAddressesOf,
    oauthPickIdentifier,
    verifyMcpAccessToken,
} from "./mcp-oauth";
import { authOptions } from "./server";

/**
 * Sign-in for AI apps (U9) on the real library: register, sign in, pick a
 * business, consent, exchange the code, refresh, and what the token says.
 * The pick is read through `@saroh/database`, stood in here by the same
 * in-memory rows Better Auth writes.
 */
type Rows = Record<string, unknown>[];
const db = vi.hoisted(() => ({
    user: [] as Record<string, unknown>[],
    session: [] as Record<string, unknown>[],
    account: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
    rateLimit: [] as Record<string, unknown>[],
    jwks: [] as Record<string, unknown>[],
    oauthClient: [] as Record<string, unknown>[],
    oauthResource: [] as Record<string, unknown>[],
    oauthClientResource: [] as Record<string, unknown>[],
    oauthRefreshToken: [] as Record<string, unknown>[],
    oauthAccessToken: [] as Record<string, unknown>[],
    oauthConsent: [] as Record<string, unknown>[],
    oauthClientAssertion: [] as Record<string, unknown>[],
}));

vi.mock("@saroh/database", () => ({
    prisma: {
        verification: {
            findFirst: ({
                where,
            }: {
                where: { identifier: string; expiresAt: { gt: Date } };
            }) =>
                Promise.resolve(
                    db.verification
                        .filter(
                            (r) =>
                                r.identifier === where.identifier &&
                                (r.expiresAt as Date) > where.expiresAt.gt,
                        )
                        .at(-1) ?? null,
                ),
        },
    },
}));

const API = "https://api.saroh.in";
const BASE = `${API}/api/auth`;
const ACCOUNTS = "https://accounts.saroh.in";
const RESOURCE = "https://mcp.saroh.in/mcp";
const REDIRECT = "http://127.0.0.1:4321/callback";

function build() {
    const codes: string[] = [];
    const auth = betterAuth({
        ...authOptions({
            baseURL: API,
            sendVerificationOTP: ({ otp }) => {
                codes.push(otp);
            },
        }),
        trustedOrigins: [ACCOUNTS],
        database: memoryAdapter(db as unknown as Record<string, Rows>),
        rateLimit: { enabled: false, storage: "memory" },
        logger: { disabled: true },
    });
    return { auth, codes };
}

type Auth = ReturnType<typeof build>["auth"];

const json = (url: string, body: unknown, cookie = "") =>
    new Request(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: ACCOUNTS,
            cookie,
        },
        body: JSON.stringify(body),
    });

/** Where an answer sends the browser: its Location, or `{ url }`. */
async function next(res: Response): Promise<string> {
    const location = res.headers.get("location");
    if (location) return location;
    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new Error(`no redirect (${res.status})`);
    return body.url;
}

const queryOf = (url: string) => new URL(url).search.slice(1);

async function signIn(auth: Auth, codes: string[], email: string) {
    await auth.handler(
        json(`${BASE}/email-otp/send-verification-otp`, {
            email,
            type: "sign-in",
        }),
    );
    const res = await auth.handler(
        json(`${BASE}/sign-in/email-otp`, { email, otp: codes.at(-1) }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
    });
    if (!session) throw new Error("no session");
    return { cookie, sessionId: session.session.id, userId: session.user.id };
}

async function register(auth: Auth, name = "Test app") {
    const res = await auth.handler(
        json(`${BASE}/oauth2/register`, {
            client_name: name,
            redirect_uris: [REDIRECT],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
        }),
    );
    expect(res.status).toBeLessThan(300);
    return ((await res.json()) as { client_id: string }).client_id;
}

function pick(sessionId: string, org: string) {
    db.verification.push({
        id: `pick-${Math.random()}`,
        identifier: oauthPickIdentifier(sessionId),
        value: org,
        expiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

function pkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function authorizeUrl(
    clientId: string,
    extra: Record<string, string | undefined> = {},
) {
    const url = new URL(`${BASE}/oauth2/authorize`);
    const params: Record<string, string | undefined> = {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        scope: "saroh:read saroh:write offline_access",
        state: "st",
        resource: RESOURCE,
        ...extra,
    };
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
    }
    return url.toString();
}

const get = (url: string, cookie = "") =>
    new Request(url, { headers: { cookie, accept: "text/html" } });

/** Authorize → pick → (consent) → code → tokens. */
async function connect(
    auth: Auth,
    who: { cookie: string; sessionId: string },
    clientId: string,
    org: string,
    scope = "saroh:read saroh:write offline_access",
) {
    const { verifier, challenge } = pkce();
    const atPick = await next(
        await auth.handler(
            get(
                authorizeUrl(clientId, {
                    scope,
                    code_challenge: challenge,
                    code_challenge_method: "S256",
                }),
                who.cookie,
            ),
        ),
    );
    expect(atPick.startsWith(`${ACCOUNTS}/oauth/pick-business?`)).toBe(true);
    pick(who.sessionId, org);
    let url = await next(
        await auth.handler(
            json(
                `${BASE}/oauth2/continue`,
                { postLogin: true, oauth_query: queryOf(atPick) },
                who.cookie,
            ),
        ),
    );
    let consented = false;
    if (url.startsWith(`${ACCOUNTS}/oauth/consent?`)) {
        consented = true;
        url = await next(
            await auth.handler(
                json(
                    `${BASE}/oauth2/consent`,
                    { accept: true, oauth_query: queryOf(url) },
                    who.cookie,
                ),
            ),
        );
    }
    expect(url.startsWith(REDIRECT)).toBe(true);
    const code = new URL(url).searchParams.get("code") ?? "";
    const res = await auth.handler(
        new Request(`${BASE}/oauth2/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT,
                client_id: clientId,
                code_verifier: verifier,
                resource: RESOURCE,
            }),
        }),
    );
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
    };
    return { tokens, consented };
}

const refresh = (auth: Auth, clientId: string, token: string) =>
    auth.handler(
        new Request(`${BASE}/oauth2/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: token,
                client_id: clientId,
                resource: RESOURCE,
            }),
        }),
    );

async function verify(auth: Auth, token: string) {
    const c = await verifyMcpAccessToken(auth, token);
    return { ...c, azp: c.clientId };
}

describe("sign-in for AI apps", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-mcp-oauth-only-x");
        vi.stubEnv("BETTER_AUTH_URL", API);
        for (const rows of Object.values(db)) rows.length = 0;
    });

    it("names each edition's issuer, resource and pages", () => {
        expect(mcpAddressesOf("https://api.saroh.tech")).toEqual({
            issuer: "https://api.saroh.tech/api/auth",
            resource: "https://mcp.saroh.tech/mcp",
            accounts: "https://accounts.saroh.tech",
        });
        expect(mcpAddressesOf("http://localhost:3333")).toBeNull();
        expect(mcpAddressesOf(undefined)).toBeNull();
    });

    it("gives a token for the picked business, bound to the MCP resource", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const { tokens, consented } = await connect(
            auth,
            who,
            clientId,
            "org_1",
        );
        expect(consented).toBe(true);
        const claims = await verify(auth, tokens.access_token);
        expect(claims).toMatchObject({
            sub: who.userId,
            azp: clientId,
            orgs: ["org_1"],
            scopes: ["saroh:read", "saroh:write", "offline_access"],
        });
        // With a refresh token: an hour.
        expect(tokens.refresh_token).toBeTruthy();
        expect(tokens.expires_in).toBeLessThanOrEqual(MCP_ACCESS_TOKEN_SECONDS);
        expect(db.oauthConsent).toHaveLength(1);
        expect(db.oauthConsent[0]).toMatchObject({
            clientId,
            userId: who.userId,
            referenceId: "org_1",
        });
    });

    it("gives 30 days, and no refresh token, to a client that asks for none", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const { tokens } = await connect(
            auth,
            who,
            clientId,
            "org_1",
            "saroh:read",
        );
        expect(tokens.refresh_token).toBeUndefined();
        expect(tokens.expires_in).toBeGreaterThan(MCP_ACCESS_TOKEN_SECONDS);
        expect(tokens.expires_in).toBeLessThanOrEqual(
            MCP_NO_REFRESH_TOKEN_SECONDS,
        );
    });

    it("refuses another edition's token", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const { tokens } = await connect(auth, who, clientId, "org_1");
        const tech = betterAuth({
            ...authOptions({ baseURL: "https://api.saroh.tech" }),
            database: memoryAdapter(db as unknown as Record<string, Rows>),
            logger: { disabled: true },
        });
        // Same database and keys, so only the issuer and audience refuse it.
        await expect(
            verifyMcpAccessToken(tech, tokens.access_token),
        ).rejects.toThrow();
        await expect(
            verifyMcpAccessToken(auth, `${tokens.access_token}x`),
        ).rejects.toThrow();
    });

    it("asks consent once per person, app and business", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        expect((await connect(auth, who, clientId, "org_1")).consented).toBe(
            true,
        );
        expect((await connect(auth, who, clientId, "org_1")).consented).toBe(
            false,
        );
        const second = await connect(auth, who, clientId, "org_2");
        expect(second.consented).toBe(true);
        expect((await verify(auth, second.tokens.access_token)).orgs).toEqual([
            "org_2",
        ]);
    });

    it("puts every ticked business in the token; another set is another consent", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const both = businessSetKey(["org_2", "org_1", "org_2"]);
        expect(both).toBe("org_1,org_2");
        const first = await connect(auth, who, clientId, both);
        expect(first.consented).toBe(true);
        expect((await verify(auth, first.tokens.access_token)).orgs).toEqual([
            "org_1",
            "org_2",
        ]);
        expect(db.oauthConsent[0]).toMatchObject({
            referenceId: "org_1,org_2",
        });
        // The same set again: no new consent. One of them alone: a new one.
        expect((await connect(auth, who, clientId, both)).consented).toBe(
            false,
        );
        expect((await connect(auth, who, clientId, "org_1")).consented).toBe(
            true,
        );
        expect(businessSetOf("org_1,org_2")).toEqual(["org_1", "org_2"]);
        expect(businessSetOf(null)).toEqual([]);
    });

    it("asks which business on every new sign-in, even with a pick on file", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        pick(who.sessionId, "org_1");
        const { challenge } = pkce();
        const url = await next(
            await auth.handler(
                get(
                    authorizeUrl(clientId, {
                        code_challenge: challenge,
                        code_challenge_method: "S256",
                    }),
                    who.cookie,
                ),
            ),
        );
        expect(url.startsWith(`${ACCOUNTS}/oauth/pick-business?`)).toBe(true);
    });

    it("refuses an authorization without PKCE", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const res = await auth.handler(get(authorizeUrl(clientId), who.cookie));
        const url = await next(res);
        expect(url.startsWith(`${ACCOUNTS}/oauth/pick-business`)).toBe(false);
        expect(new URL(url).searchParams.get("error")).toBeTruthy();
    });

    it("refuses a redirect that isn't exactly registered, before any redirect", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const clientId = await register(auth);
        const { challenge } = pkce();
        const res = await auth.handler(
            get(
                authorizeUrl(clientId, {
                    redirect_uri: "https://evil.example/callback",
                    code_challenge: challenge,
                    code_challenge_method: "S256",
                }),
                who.cookie,
            ),
        );
        const location = res.headers.get("location") ?? "";
        expect(location.startsWith("https://evil.example")).toBe(false);
    });

    it("rotates refresh tokens, and a reused one stops working", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
        try {
            const { auth, codes } = build();
            const who = await signIn(auth, codes, "owner@example.com");
            const clientId = await register(auth);
            const { tokens } = await connect(auth, who, clientId, "org_1");
            const first = await refresh(
                auth,
                clientId,
                tokens.refresh_token ?? "",
            );
            expect(first.status).toBe(200);
            const rotated = (await first.json()) as { refresh_token: string };
            expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
            // Past the 30-second retry window, the old one is replay.
            vi.setSystemTime(Date.now() + 60_000);
            const replay = await refresh(
                auth,
                clientId,
                tokens.refresh_token ?? "",
            );
            expect(replay.status).toBe(400);
            expect(await replay.json()).toMatchObject({
                error: "invalid_grant",
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("ends a refresh token unused for 90 days", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
        try {
            const { auth, codes } = build();
            const who = await signIn(auth, codes, "owner@example.com");
            const clientId = await register(auth);
            const { tokens } = await connect(auth, who, clientId, "org_1");
            vi.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000);
            const res = await refresh(
                auth,
                clientId,
                tokens.refresh_token ?? "",
            );
            expect(res.status).toBe(400);
            expect(await res.json()).toMatchObject({ error: "invalid_grant" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("hands no session out as a JWT", async () => {
        const { auth, codes } = build();
        const who = await signIn(auth, codes, "owner@example.com");
        const res = await auth.handler(get(`${BASE}/token`, who.cookie));
        expect(res.status).toBe(404);
        const session = await auth.handler(
            get(`${BASE}/get-session`, who.cookie),
        );
        expect(session.headers.get("set-auth-jwt")).toBeNull();
    });

    it("says who signs in for the MCP resource, on the resource's path", async () => {
        const { auth } = build();
        const res = await auth.handler(
            new Request(`${API}/.well-known/oauth-protected-resource/mcp`),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            resource: RESOURCE,
            authorization_servers: [BASE],
        });
        const as = await auth.handler(
            new Request(
                `${API}/.well-known/oauth-authorization-server/api/auth`,
            ),
        );
        expect(as.status).toBe(200);
        expect(await as.json()).toMatchObject({
            issuer: BASE,
            code_challenge_methods_supported: ["S256"],
            client_id_metadata_document_supported: true,
        });
    });
});
