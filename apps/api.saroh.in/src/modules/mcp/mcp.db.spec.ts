/**
 * AI apps' sign-in against a real Postgres (plan 2026-11-10-001, U9): the
 * grant `McpAuthGuard` loads on every call, the business's AI connections,
 * their sweep, and the API's half of the pick and consent pages.
 *
 * better-auth is ESM, which ts-jest can't load, so the token check is stood
 * in for: a "token" here is its claims as JSON, refused unless its issuer is
 * the instance's. The real library's flow (register, PKCE, pick, consent,
 * refresh, expiry, issuer and audience) is `packages/auth`'s
 * `mcp-oauth.test.ts`. Runs in the integration project (TEST_DATABASE_URL).
 */
const mockHandler = jest.fn();
jest.mock("../../common/auth/auth", () => ({
    authFor: (host: string | undefined) => ({
        options: {
            baseURL: (host ?? "").endsWith(".tech")
                ? "https://api.saroh.tech"
                : "https://api.saroh.in",
        },
        handler: mockHandler,
    }),
}));
jest.mock("@saroh/auth", () => {
    const addresses = (baseURL: string) => {
        const rest = new URL(baseURL).host.slice("api.".length);
        return {
            issuer: `${baseURL}/api/auth`,
            resource: `https://mcp.${rest}/mcp`,
            accounts: `https://accounts.${rest}`,
        };
    };
    const pickId = (sessionId: string) => `oauth-pick:${sessionId}`;
    const setKey = (ids: readonly string[]) =>
        [...new Set(ids)].sort().join(",");
    return {
        businessSetKey: setKey,
        businessSetOf: (key: string | null | undefined) =>
            (key ?? "").split(",").filter(Boolean),
        MCP_IDLE_SECONDS: 90 * 24 * 60 * 60,
        OAUTH_PICK_SECONDS: 600,
        mcpAddressesOf: addresses,
        oauthPickIdentifier: pickId,
        readOAuthPick: async (sessionId: string) => {
            const { prisma: db } =
                jest.requireActual<typeof import("@saroh/database")>(
                    "@saroh/database",
                );
            const row = await db.verification.findFirst({
                where: {
                    identifier: pickId(sessionId),
                    expiresAt: { gt: new Date() },
                },
                orderBy: { createdAt: "desc" },
            });
            return row?.value ?? null;
        },
        verifyMcpAccessToken: (
            auth: { options: { baseURL: string } },
            token: string,
        ) => {
            const claims = JSON.parse(token) as Record<string, unknown>;
            if (claims.iss !== addresses(auth.options.baseURL).issuer) {
                return Promise.reject(new Error("wrong issuer"));
            }
            return Promise.resolve(claims);
        },
    };
});

import { randomUUID } from "node:crypto";

import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import type { Edition } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { ApiKeyGuard } from "../api-keys/api-key.guard";
import { AuditService } from "../audit/audit.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { can } from "../organizations/organization-policy";
import {
    AiConnectionsSweepJob,
    UNUSED_CLIENT_MS,
} from "./ai-connections-sweep.job";
import { AiConnectionsService } from "./ai-connections.service";
import type { McpRequest } from "./mcp-auth.guard";
import { McpAuthGuard } from "./mcp-auth.guard";
import { OAuthFlowService } from "./oauth-flow.service";

const mutableEnv = env as { BETTER_AUTH_URL?: string };
const before = mutableEnv.BETTER_AUTH_URL;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const DAY = 24 * 60 * 60 * 1000;

const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
const keys = { contextFor: jest.fn().mockResolvedValue(null) };
const organizations = new OrganizationContextService();
const audit = new AuditService();
const connections = new AiConnectionsService(audit);
const guard = new McpAuthGuard(
    organizations,
    keys as unknown as ApiKeyGuard,
    flags as unknown as FeatureFlagService,
);

async function person(organizationId: string, role: string) {
    const user = await prisma.user.create({
        data: { email: `${uniq(role.toLowerCase())}@example.com`, name: role },
    });
    await prisma.membership.create({
        data: { organizationId, userId: user.id, role },
    });
    return user.id;
}

async function business(edition: Edition = "INDIA", isDemo = false) {
    const org = await prisma.organization.create({
        data: { name: uniq("Rye Bakery"), slug: uniq("rye"), edition, isDemo },
    });
    return { id: org.id, owner: await person(org.id, "OWNER") };
}

async function client(name = "Test app", clientId = uniq("client")) {
    await prisma.oauthClient.create({
        data: {
            id: randomUUID(),
            clientId,
            name,
            redirectUris: [],
            createdAt: new Date(),
        },
    });
    return clientId;
}

const SCOPES = ["saroh:read", "saroh:write", "offline_access"];

/**
 * A connection as the sign-in leaves it: a grant reaching the ticked
 * businesses (`organizationIds`, which Better Auth leaves empty and the
 * Allow fills), a live refresh token, and a token naming the set.
 */
async function connect(
    userId: string,
    orgs: string | string[],
    clientId: string,
    options: {
        scopes?: string[];
        lastUsedAt?: Date;
        createdAt?: Date;
        organizationIds?: string[];
    } = {},
) {
    const set = [...new Set([orgs].flat())].sort();
    const referenceId = set.join(",");
    const scopes = options.scopes ?? SCOPES;
    const grant = await prisma.oauthConsent.create({
        data: {
            id: randomUUID(),
            clientId,
            userId,
            referenceId,
            organizationIds: options.organizationIds ?? set,
            scopes,
            createdAt: options.createdAt ?? new Date(),
            lastUsedAt: options.lastUsedAt,
        },
    });
    if (scopes.includes("offline_access")) {
        await prisma.oauthRefreshToken.create({
            data: {
                id: randomUUID(),
                token: uniq("rt"),
                clientId,
                userId,
                referenceId,
                scopes,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * DAY),
            },
        });
    }
    const token = JSON.stringify({
        iss: "https://api.saroh.in/api/auth",
        sub: userId,
        clientId,
        orgs: set,
        scopes,
    });
    return { grant, token };
}

function call(token: string | null, host = "mcp.saroh.in") {
    const headers: Record<string, string> = {};
    const req = {
        headers: {
            host,
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
    } as unknown as McpRequest;
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    const context = {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    return {
        req,
        headers,
        run: () => guard.canActivate(context),
        /** After `run`: the context a tool call in `org` gets, or null. */
        in: (org: string) => guard.contextIn(req.mcpConnection!, org, host),
    };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
        await promise;
        return 200;
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
}

const ownerCtx = (
    organizationId: string,
    userId: string,
): OrganizationContext => ({
    organizationId,
    userId,
    role: "OWNER",
    roleKey: "OWNER",
    actions: new Set(ORG_ACTIONS.filter((a) => can("OWNER", a))),
});
const memberCtx = (
    organizationId: string,
    userId: string,
): OrganizationContext => ({
    organizationId,
    userId,
    role: "MEMBER",
    roleKey: "MEMBER",
    actions: new Set(ORG_ACTIONS.filter((a) => can("MEMBER", a))),
});

beforeAll(() => {
    mutableEnv.BETTER_AUTH_URL = "https://api.saroh.in";
});
afterAll(() => {
    mutableEnv.BETTER_AUTH_URL = before;
});
beforeEach(() => {
    flags.isEnabled.mockResolvedValue(true);
    keys.contextFor.mockResolvedValue(null);
    mockHandler.mockReset();
});

describe("McpAuthGuard (U9)", () => {
    it("builds the business's context: granted scopes ∩ the person's role, never the owner's or sensitive powers", async () => {
        const org = await business();
        const app = await client();
        const { grant, token } = await connect(org.owner, org.id, app);
        const c = call(token);
        await expect(c.run()).resolves.toBe(true);
        const ctx = (await c.in(org.id))!;
        expect(ctx).toMatchObject({
            organizationId: org.id,
            userId: org.owner,
            edition: "INDIA",
        });
        expect(ctx.actions!.has("order:read")).toBe(true);
        expect(ctx.actions!.has("order:write")).toBe(true);
        for (const never of [
            "apikey:manage",
            "webhook:manage",
            "customer:sensitive",
            "billing:manage",
            "org:delete",
            "site:publish",
        ] as const) {
            expect(ctx.actions!.has(never)).toBe(false);
        }
        expect(c.req.mcpConnection).toMatchObject({
            kind: "oauth",
            id: grant.id,
            clientId: app,
            businesses: [org.id],
        });
        // lastUsedAt is written without holding the call up: read until it lands.
        let touched = await prisma.oauthConsent.findUniqueOrThrow({
            where: { id: grant.id },
        });
        for (let i = 0; i < 50 && !touched.lastUsedAt; i++) {
            touched = await prisma.oauthConsent.findUniqueOrThrow({
                where: { id: grant.id },
            });
        }
        expect(touched.lastUsedAt).not.toBeNull();
    });

    it("gives a read-only token no writes, and a Member's role caps it", async () => {
        const org = await business();
        const member = await person(org.id, "MEMBER");
        const app = await client();
        const read = call(
            (await connect(org.owner, org.id, app, { scopes: ["saroh:read"] }))
                .token,
        );
        await read.run();
        const actions = (await read.in(org.id))!.actions!;
        expect(actions.has("order:read")).toBe(true);
        expect([...actions].some((a) => !/:read(-own)?$/.test(a))).toBe(false);

        const both = call((await connect(member, org.id, app)).token);
        await both.run();
        expect((await both.in(org.id))!.actions!.has("org:update")).toBe(false);
    });

    it("answers no token with 401 and where to sign in", async () => {
        const c = call(null);
        expect(await statusOf(c.run())).toBe(401);
        expect(c.headers["WWW-Authenticate"]).toBe(
            'Bearer resource_metadata="https://mcp.saroh.in/.well-known/oauth-protected-resource/mcp"',
        );
    });

    it("is 404 off the MCP address, and while API_MCP is off", async () => {
        const org = await business();
        const { token } = await connect(org.owner, org.id, await client());
        expect(await statusOf(call(token, "api.saroh.in").run())).toBe(404);
        flags.isEnabled.mockResolvedValue(false);
        expect(await statusOf(call(token).run())).toBe(404);
    });

    it("refuses a token from .in on .tech", async () => {
        const org = await business();
        const { token } = await connect(org.owner, org.id, await client());
        const c = call(token, "mcp.saroh.tech");
        expect(await statusOf(c.run())).toBe(401);
        expect(c.headers["WWW-Authenticate"]).toContain(
            'error="invalid_token"',
        );
    });

    it("refuses a person removed from the business on the next call", async () => {
        const org = await business();
        const member = await person(org.id, "MEMBER");
        const { token } = await connect(member, org.id, await client());
        const c = call(token);
        expect(await statusOf(c.run())).toBe(200);
        expect(await c.in(org.id)).not.toBeNull();
        await prisma.membership.deleteMany({
            where: { userId: member, organizationId: org.id },
        });
        expect(await c.in(org.id)).toBeNull();
    });

    it("reaches every ticked business with the person's role in each, and no other", async () => {
        const a = await business();
        const b = await business();
        const untouched = await business();
        const member = await person(b.id, "MEMBER");
        await prisma.membership.create({
            data: { organizationId: a.id, userId: member, role: "ADMIN" },
        });
        await prisma.membership.create({
            data: {
                organizationId: untouched.id,
                userId: member,
                role: "ADMIN",
            },
        });
        const { token } = await connect(member, [b.id, a.id], await client());
        const c = call(token);
        expect(await statusOf(c.run())).toBe(200);
        expect(c.req.mcpConnection?.businesses).toEqual([a.id, b.id].sort());
        expect((await c.in(a.id))?.role).toBe("ADMIN");
        expect((await c.in(b.id))?.role).toBe("MEMBER");
        // Not ticked: never, whatever the person's role there.
        expect(await c.in(untouched.id)).toBeNull();

        // Removed from B only: B refused, A still works.
        await prisma.membership.deleteMany({
            where: { userId: member, organizationId: b.id },
        });
        expect(await c.in(b.id)).toBeNull();
        expect(await c.in(a.id)).not.toBeNull();

        // AI apps off for A alone.
        flags.isEnabled.mockImplementation((_k: string, org?: string) =>
            Promise.resolve(org !== a.id),
        );
        expect(await c.in(a.id)).toBeNull();
    });

    it("refuses a grant idle for 90 days", async () => {
        const org = await business();
        const { token } = await connect(org.owner, org.id, await client(), {
            lastUsedAt: new Date(Date.now() - 91 * DAY),
        });
        expect(await statusOf(call(token).run())).toBe(401);
    });

    it("refuses once the app's refresh tokens are revoked (a reused refresh token)", async () => {
        const org = await business();
        const app = await client();
        const { token } = await connect(org.owner, org.id, app);
        await prisma.oauthRefreshToken.updateMany({
            where: { clientId: app },
            data: { revoked: new Date() },
        });
        expect(await statusOf(call(token).run())).toBe(401);
    });

    it("takes a secret key only with the AI switch on", async () => {
        const org = await business();
        const ctx = ownerCtx(org.id, org.owner);
        const key = (kind: string, aiEnabled: boolean) => ({
            key: { id: uniq("key"), kind, aiEnabled, name: "Server" },
            context: ctx,
        });
        const token = `sk_live_${"a".repeat(43)}`;
        keys.contextFor.mockResolvedValue(key("SECRET", false));
        expect(await statusOf(call(token).run())).toBe(401);
        keys.contextFor.mockResolvedValue(key("PUBLISHABLE", true));
        expect(await statusOf(call(token.replace("sk_", "pk_")).run())).toBe(
            401,
        );
        keys.contextFor.mockResolvedValue(key("SECRET", true));
        const c = call(token);
        expect(await statusOf(c.run())).toBe(200);
        expect(c.req.mcpConnection).toMatchObject({
            kind: "key",
            businesses: [org.id],
        });
        expect((await c.in(org.id))!.actions!.has("apikey:manage")).toBe(false);
        expect(await c.in((await business()).id)).toBeNull();
    });
});

describe("AI connections (U9)", () => {
    it("shows an Owner every connection and a Member their own", async () => {
        const org = await business();
        const member = await person(org.id, "MEMBER");
        const app = await client("Claude");
        await connect(org.owner, org.id, app);
        await connect(member, org.id, app);
        expect(
            await connections.list(ownerCtx(org.id, org.owner)),
        ).toHaveLength(2);
        const own = await connections.list(memberCtx(org.id, member));
        expect(own.map((c) => c.person.id)).toEqual([member]);
    });

    it("lets an Owner disconnect a member's app: its live token gets 401 at once, refresh tokens revoked, recorded", async () => {
        const org = await business();
        const member = await person(org.id, "MEMBER");
        const app = await client();
        const { grant, token } = await connect(member, org.id, app);
        expect(await statusOf(call(token).run())).toBe(200);

        // Not theirs to end, for a Member.
        const other = await person(org.id, "MEMBER");
        expect(
            await statusOf(
                connections.disconnect(memberCtx(org.id, other), grant.id),
            ),
        ).toBe(403);

        await connections.disconnect(ownerCtx(org.id, org.owner), grant.id);
        expect(await statusOf(call(token).run())).toBe(401);
        const live = await prisma.oauthRefreshToken.count({
            where: { clientId: app, revoked: null },
        });
        expect(live).toBe(0);
        const events = await prisma.auditEvent.findMany({
            where: {
                organizationId: org.id,
                action: "ai_connection.disconnected",
            },
        });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            actorUserId: org.owner,
            targetId: grant.id,
        });
    });

    it("shows a connection under each business it reaches; an Owner of A ends it for A only", async () => {
        const a = await business();
        const b = await business();
        const member = await person(a.id, "MEMBER");
        await prisma.membership.create({
            data: { organizationId: b.id, userId: member, role: "MEMBER" },
        });
        const { grant, token } = await connect(
            member,
            [a.id, b.id],
            await client(),
        );
        expect(
            (await connections.list(ownerCtx(a.id, a.owner))).map((c) => c.id),
        ).toEqual([grant.id]);
        expect(
            (await connections.list(memberCtx(b.id, member))).map((c) => c.id),
        ).toEqual([grant.id]);

        await connections.disconnect(ownerCtx(a.id, a.owner), grant.id);
        expect(await connections.list(ownerCtx(a.id, a.owner))).toEqual([]);
        const c = call(token);
        expect(await statusOf(c.run())).toBe(200);
        expect(c.req.mcpConnection?.businesses).toEqual([b.id]);
        expect(await c.in(a.id)).toBeNull();
        expect(await c.in(b.id)).not.toBeNull();
        expect(
            await prisma.oauthRefreshToken.count({
                where: { referenceId: grant.referenceId, revoked: null },
            }),
        ).toBe(1);
        const ended = await prisma.auditEvent.findMany({
            where: { targetId: grant.id, action: "ai_connection.disconnected" },
        });
        expect(ended.map((e) => e.organizationId)).toEqual([a.id]);

        // The person ends it for B, the last one: the connection is gone.
        await connections.disconnect(memberCtx(b.id, member), grant.id);
        expect(
            await prisma.oauthConsent.findUnique({ where: { id: grant.id } }),
        ).toBeNull();
        expect(await statusOf(call(token).run())).toBe(401);
    });

    it("never reaches another business's connection", async () => {
        const a = await business();
        const b = await business();
        const { grant } = await connect(b.owner, b.id, await client());
        expect(await connections.list(ownerCtx(a.id, a.owner))).toEqual([]);
        expect(
            await statusOf(
                connections.disconnect(ownerCtx(a.id, a.owner), grant.id),
            ),
        ).toBe(404);
    });
});

describe("AiConnectionsSweepJob (U9)", () => {
    it("ends idle connections and forgets apps nobody connected", async () => {
        const org = await business();
        const used = await client();
        const idle = await connect(org.owner, org.id, used, {
            lastUsedAt: new Date(Date.now() - 91 * DAY),
        });
        const kept = await connect(org.owner, org.id, used);
        const unused = await client();
        await prisma.oauthClient.updateMany({
            where: { clientId: { in: [unused, used] } },
            data: { createdAt: new Date(Date.now() - UNUSED_CLIENT_MS - DAY) },
        });

        await new AiConnectionsSweepJob(connections).sweep(new Date());

        expect(
            await prisma.oauthConsent.findUnique({
                where: { id: idle.grant.id },
            }),
        ).toBeNull();
        expect(
            await prisma.oauthConsent.findUnique({
                where: { id: kept.grant.id },
            }),
        ).not.toBeNull();
        expect(
            await prisma.oauthClient.findUnique({
                where: { clientId: unused },
            }),
        ).toBeNull();
        expect(
            await prisma.oauthClient.findUnique({ where: { clientId: used } }),
        ).not.toBeNull();
        const ended = await prisma.auditEvent.findMany({
            where: {
                targetId: idle.grant.id,
                action: "ai_connection.disconnected",
            },
        });
        expect(ended[0]?.metadata).toMatchObject({ reason: "idle" });
    });
});

describe("OAuthFlowService (U9)", () => {
    const flow = new OAuthFlowService(
        organizations,
        connections,
        flags as unknown as FeatureFlagService,
    );
    const caller = (userId: string, host = "api.saroh.in") => ({
        userId,
        sessionId: uniq("session"),
        host,
        cookie: "session=x",
    });

    it("offers only this edition's businesses, never a demo", async () => {
        const india = await business("INDIA");
        const userId = india.owner;
        const demo = await business("INDIA", true);
        await prisma.membership.create({
            data: { organizationId: demo.id, userId, role: "OWNER" },
        });
        const global = await business("GLOBAL");
        await prisma.membership.create({
            data: { organizationId: global.id, userId, role: "OWNER" },
        });

        const offered = await flow.businesses(caller(userId));
        expect(offered.map((b) => b.id)).toEqual([india.id]);
        const tech = await flow.businesses(caller(userId, "api.saroh.tech"));
        expect(tech.map((b) => b.id)).toEqual([global.id]);
        expect(
            await statusOf(flow.pick(caller(userId), [demo.id], "q=1")),
        ).toBe(403);
        // One not offered spoils the set.
        expect(
            await statusOf(
                flow.pick(caller(userId), [india.id, global.id], "q=1"),
            ),
        ).toBe(403);
        expect(await statusOf(flow.pick(caller(userId), [], "q=1"))).toBe(400);
        expect(mockHandler).not.toHaveBeenCalled();
    });

    it("stores the ticked set for the session, then continues the sign-in", async () => {
        const org = await business();
        const second = await business();
        await prisma.membership.create({
            data: {
                organizationId: second.id,
                userId: org.owner,
                role: "MEMBER",
            },
        });
        const who = caller(org.owner);
        mockHandler.mockResolvedValue(
            Response.json({
                redirect: true,
                url: "https://accounts.saroh.in/oauth/consent?x=1",
            }),
        );
        const next = await flow.pick(
            who,
            [second.id, org.id],
            "client_id=c&sig=s",
        );
        expect(next.url).toBe("https://accounts.saroh.in/oauth/consent?x=1");
        const sent = mockHandler.mock.calls[0][0] as Request;
        expect(sent.url).toBe("https://api.saroh.in/api/auth/oauth2/continue");
        expect(await sent.json()).toEqual({
            postLogin: true,
            oauth_query: "client_id=c&sig=s",
        });
        const pick = await prisma.verification.findFirst({
            where: { identifier: `oauth-pick:${who.sessionId}` },
        });
        expect(pick?.value).toBe([org.id, second.id].sort().join(","));
    });

    it("ends this set's grant when it lost a business, so consent is asked again", async () => {
        const a = await business();
        const b = await business();
        await prisma.membership.create({
            data: { organizationId: b.id, userId: a.owner, role: "OWNER" },
        });
        const app = await client();
        const { grant } = await connect(a.owner, [a.id, b.id], app, {
            organizationIds: [b.id],
        });
        const whole = await connect(a.owner, a.id, app);
        mockHandler.mockImplementation(() =>
            Promise.resolve(
                Response.json({
                    url: "https://accounts.saroh.in/oauth/consent",
                }),
            ),
        );
        await flow.pick(caller(a.owner), [a.id, b.id], `client_id=${app}`);
        expect(
            await prisma.oauthConsent.findUnique({ where: { id: grant.id } }),
        ).toBeNull();
        // A grant still whole is left for Better Auth to reuse.
        await flow.pick(caller(a.owner), [a.id], `client_id=${app}`);
        expect(
            await prisma.oauthConsent.findUnique({
                where: { id: whole.grant.id },
            }),
        ).not.toBeNull();
    });

    it("refuses an unknown app wearing a known name, and shows a known one as known", async () => {
        const org = await business();
        const who = caller(org.owner);
        await prisma.verification.create({
            data: {
                id: randomUUID(),
                identifier: `oauth-pick:${who.sessionId}`,
                value: org.id,
                expiresAt: new Date(Date.now() + 60_000),
            },
        });
        const fake = await client("Claude Official");
        const query = (id: string) =>
            new URLSearchParams({
                client_id: id,
                redirect_uri: "https://evil.example/cb",
                scope: "saroh:read",
            }).toString();
        const details = await flow.consentDetails(who, query(fake));
        expect(details).toMatchObject({
            refused: true,
            app: { known: false },
            redirectHost: "evil.example",
        });
        expect(await statusOf(flow.consent(who, true, query(fake)))).toBe(403);

        const claude = await client(
            "Claude",
            "https://claude.ai/oauth/mcp-oauth-client-metadata",
        );
        const known = await flow.consentDetails(who, query(claude));
        expect(known).toMatchObject({
            refused: false,
            app: { known: true },
            businesses: [{ id: org.id }],
        });
    });

    it("puts the ticked set on the grant and records it on each business when the person allows it", async () => {
        const org = await business();
        const other = await business();
        const who = caller(org.owner);
        const set = [org.id, other.id].sort().join(",");
        await prisma.verification.create({
            data: {
                id: randomUUID(),
                identifier: `oauth-pick:${who.sessionId}`,
                value: set,
                expiresAt: new Date(Date.now() + 60_000),
            },
        });
        const app = await client("Cursor");
        let made = "";
        mockHandler.mockImplementation(async () => {
            // What Better Auth does on Allow: the grant (no set), the redirect.
            made = (
                await connect(org.owner, [org.id, other.id], app, {
                    organizationIds: [],
                })
            ).grant.id;
            return Response.json({
                redirect: true,
                url: "http://127.0.0.1:9/cb?code=c",
            });
        });
        const next = await flow.consent(
            who,
            true,
            new URLSearchParams({
                client_id: app,
                redirect_uri: "http://127.0.0.1:9/cb",
            }).toString(),
        );
        expect(next.url).toContain("code=c");
        const grant = await prisma.oauthConsent.findUniqueOrThrow({
            where: { id: made },
        });
        expect(grant.organizationIds.sort()).toEqual(set.split(","));
        const events = await prisma.auditEvent.findMany({
            where: {
                organizationId: { in: [org.id, other.id] },
                action: "ai_connection.connected",
            },
        });
        expect(events).toHaveLength(2);
        expect(events[0].metadata).toMatchObject({
            app: "Cursor",
            known: false,
        });
    });

    it("is 404 while API_MCP is off", async () => {
        const org = await business();
        flags.isEnabled.mockResolvedValue(false);
        expect(await statusOf(flow.businesses(caller(org.owner)))).toBe(404);
    });
});
