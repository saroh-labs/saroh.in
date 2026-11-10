/**
 * ApiKeyGuard over HTTP against a real Postgres (plan 2026-11-10-001, U6):
 * a key becomes its business's context, scope ∩ its creator's live role,
 * with the edition, origin, kind, kill-switch and limit checks, and the
 * request runs in the business's row-level security context.
 *
 * The app is built as main.ts builds it where it matters here: the merchant
 * address middleware, the CORS delegate, OriginGuard, OrgRlsInterceptor and
 * the exception filter. Test-only routes stand in for U7/U8's. The plan's
 * caps and the kill switches are fixtures (obviously fake numbers).
 * Runs in the integration project (TEST_DATABASE_URL), and with TEST_RLS=on.
 */
// better-auth is ESM, which ts-jest can't load: the workspace's session
// guard isn't under test here, and OriginGuard's trust rule is stood in for.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";

import type { INestApplication } from "@nestjs/common";
import {
    Controller,
    Get,
    NotFoundException,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ApiKeyKind, Edition } from "@saroh/database";
import { currentOrgContext, prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { corsDelegate } from "../../common/cors";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OriginGuard } from "../../common/guards/origin.guard";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { merchantApiOnly } from "../../common/merchant-api";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { AuditService } from "../audit/audit.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { authorize } from "../organizations/organization-policy";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { ApiKeyGuard, VISITOR_SHARE } from "./api-key.guard";
import { ApiKeysModule } from "./api-keys.module";
import {
    displayPrefix,
    mintToken,
    STOREFRONT_SCOPE,
    tokenDigest,
} from "./api-keys.service";
import { keyContextCache } from "./key-context.cache";

const mutableEnv = env as { APIKEY_ENC_KEY?: string; TRUST_PROXY?: string };
const before = { ...mutableEnv };

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 8;
const SITE = "https://shop.example.com";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** Secret routes, as U8's will be: the business only from the key. */
@Controller("v1/test-only")
@UseGuards(ApiKeyGuard)
class SecretProbe {
    @Get("keys/:id")
    async key(@OrgContext() ctx: OrganizationContext, @Param("id") id: string) {
        authorize(ctx, "order:read");
        const key = await prisma.apiKey.findFirst({
            where: { id, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!key) throw new NotFoundException();
        return key;
    }

    @Post("orders")
    write(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "order:write");
        return { ok: true };
    }

    /** Reads every key with no organization filter at all. */
    @Get("rls")
    rls() {
        return prisma.$transaction(async (tx) => ({
            context: currentOrgContext() ?? null,
            orgs: (
                await tx.apiKey.findMany({ select: { organizationId: true } })
            ).map((k) => k.organizationId),
        }));
    }
}

/** A storefront route, as U7's will be: the publishable key in the path. */
@Controller("v1/storefront/:key/test-only")
@UseGuards(ApiKeyGuard)
class StorefrontProbe {
    @Get("products")
    read(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "store:read");
        return { organizationId: ctx.organizationId };
    }

    @Post("products")
    post(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "store:read");
        return { ok: true };
    }
}

const switchedOff = new Set<string>();
const flags = {
    isEnabled: jest.fn((key: string, organizationId?: string) =>
        Promise.resolve(!switchedOff.has(`${key}:${organizationId}`)),
    ),
};

let app: INestApplication;
let port: number;

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.TRUST_PROXY = "cloudflare";
    const moduleRef = await Test.createTestingModule({
        imports: [ApiKeysModule],
        controllers: [SecretProbe, StorefrontProbe],
    })
        .overrideProvider(CapsService)
        .useValue({ rpm: () => Promise.resolve(CAP) })
        .overrideProvider(LimitsService)
        .useValue(new LimitsService(null))
        .overrideProvider(FeatureFlagService)
        .useValue(flags)
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(merchantApiOnly);
    const guard = app.get(ApiKeyGuard);
    app.enableCors(
        corsDelegate(["https://app.saroh.in"], (t) => guard.allowedOrigins(t)),
    );
    app.useGlobalGuards(new OriginGuard());
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as { port: number }).port;
});

afterAll(async () => {
    await app?.close();
    Object.assign(mutableEnv, before);
});

beforeEach(() => keyContextCache.clear());

/** node:http, so the Host header can name an edition's address. */
function call(
    method: string,
    path: string,
    headers: Record<string, string> = {},
): Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: { error?: { code?: string } } & Record<string, unknown>;
}> {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            { host: "127.0.0.1", port, method, path, headers },
            (res) => {
                let text = "";
                res.on("data", (c: Buffer) => (text += c.toString()));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: text ? JSON.parse(text) : {},
                    }),
                );
            },
        );
        req.on("error", reject);
        req.end();
    });
}

async function person(organizationId: string, role: string) {
    const user = await prisma.user.create({
        data: { email: `${uniq(role)}@example.com`, name: role },
    });
    await prisma.membership.create({
        data: { organizationId, userId: user.id, role },
    });
    return user.id;
}

async function business(edition: Edition = "INDIA") {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), edition },
    });
    const owner = await person(org.id, "OWNER");
    return { id: org.id, owner, edition };
}

async function keyFor(
    org: { id: string; owner: string; edition: Edition },
    kind: ApiKeyKind,
    options: { scope?: string[]; creator?: string } = {},
) {
    const token = mintToken(kind);
    const row = await prisma.apiKey.create({
        data: {
            organizationId: org.id,
            createdByUserId: options.creator ?? org.owner,
            kind,
            edition: org.edition,
            name: "Fixture key",
            prefix: displayPrefix(token),
            tokenDigest: tokenDigest(token),
            scope:
                kind === "SECRET"
                    ? (options.scope ?? ["order:read", "order:write"])
                    : [...STOREFRONT_SCOPE],
            allowedOrigins: kind === "SECRET" ? [] : [SITE],
        },
    });
    return { token, id: row.id };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("ApiKeyGuard: secret keys", () => {
    it("opens an in-scope route with the key's business", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        const res = await call(
            "GET",
            `/v1/test-only/keys/${key.id}`,
            bearer(key.token),
        );
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: key.id });
        expect(res.headers["ratelimit-limit"]).toBe(String(CAP));
        // Server to server: no CORS answer, even for Saroh's own origin.
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("refuses an action outside the key's scope with 403", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET", { scope: ["order:read"] });
        const res = await call(
            "POST",
            "/v1/test-only/orders",
            bearer(key.token),
        );
        expect(res.status).toBe(403);
    });

    it("never reaches another business's resource: 404, nothing leaked", async () => {
        const a = await business();
        const b = await business();
        const keyA = await keyFor(a, "SECRET");
        const keyB = await keyFor(b, "SECRET");
        const res = await call(
            "GET",
            `/v1/test-only/keys/${keyB.id}`,
            bearer(keyA.token),
        );
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain(b.id);
    });

    it("runs the handler in the key's business's RLS context", async () => {
        const a = await business();
        const b = await business();
        const key = await keyFor(a, "SECRET");
        await keyFor(b, "SECRET");
        const res = await call("GET", "/v1/test-only/rls", bearer(key.token));
        expect(res.status).toBe(200);
        expect(res.body.context).toBe(a.id);
        if (isRlsTestMode()) {
            // Enforced: an unfiltered read sees only this business's rows.
            expect(new Set(res.body.orgs as string[])).toEqual(new Set([a.id]));
        }
    });

    it("answers 401 with no key, a malformed one, a revoked one, an expired one, or a session cookie alone", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        const path = `/v1/test-only/keys/${key.id}`;
        expect((await call("GET", path)).status).toBe(401);
        expect((await call("GET", path, bearer("sk_live_nope"))).status).toBe(
            401,
        );
        const cookieOnly = await call("GET", path, {
            cookie: `__Secure-better-auth.session_token=${key.token}`,
        });
        expect(cookieOnly.status).toBe(401);
        expect(cookieOnly.body.error?.code).toBe("unauthorized");

        await prisma.apiKey.update({
            where: { id: key.id },
            data: { revokedAt: new Date() },
        });
        keyContextCache.clear();
        expect((await call("GET", path, bearer(key.token))).status).toBe(401);

        const expiring = await keyFor(org, "SECRET");
        await prisma.apiKey.update({
            where: { id: expiring.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        expect((await call("GET", path, bearer(expiring.token))).status).toBe(
            401,
        );
    });

    it("refuses a publishable key on a secret route with 403", async () => {
        const org = await business();
        const pk = await keyFor(org, "PUBLISHABLE");
        const res = await call("GET", "/v1/test-only/rls", bearer(pk.token));
        expect(res.status).toBe(403);
    });

    it("follows the creator: a demotion gives 403 on a write at once, a removal 401 key_owner_inactive", async () => {
        const org = await business();
        const creator = await person(org.id, "OWNER");
        const key = await keyFor(org, "SECRET", { creator });
        expect(
            (await call("POST", "/v1/test-only/orders", bearer(key.token)))
                .status,
        ).toBe(201);

        const members = new OrganizationMembersService(new AuditService());
        const actor = await new OrganizationContextService().resolve(
            org.owner,
            org.id,
        );
        await members.updateRole(actor, creator, { role: "MEMBER" });
        expect(
            (await call("POST", "/v1/test-only/orders", bearer(key.token)))
                .status,
        ).toBe(403);

        await members.remove(actor, creator);
        const gone = await call(
            "GET",
            `/v1/test-only/keys/${key.id}`,
            bearer(key.token),
        );
        expect(gone.status).toBe(401);
        expect(gone.body.error?.code).toBe("key_owner_inactive");
    });

    it("answers 404 for an India key on api.saroh.tech, and on merchant sites' address", async () => {
        const org = await business("INDIA");
        const key = await keyFor(org, "SECRET");
        const path = `/v1/test-only/keys/${key.id}`;
        expect(
            (
                await call("GET", path, {
                    ...bearer(key.token),
                    host: "api.saroh.tech",
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await call("GET", path, {
                    ...bearer(key.token),
                    host: "api.saroh.in",
                })
            ).status,
        ).toBe(200);
        expect(
            (
                await call("GET", path, {
                    ...bearer(key.token),
                    host: "api.saroh.app",
                })
            ).status,
        ).toBe(404);
    });

    it("answers 404 while the surface's kill switch is off for the business", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        switchedOff.add(`API_SECRET:${org.id}`);
        try {
            expect(
                (await call("GET", "/v1/test-only/rls", bearer(key.token)))
                    .status,
            ).toBe(404);
        } finally {
            switchedOff.delete(`API_SECRET:${org.id}`);
        }
    });

    it("refuses an untrusted browser Origin on /v1", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        const res = await call("GET", "/v1/test-only/rls", {
            ...bearer(key.token),
            origin: "https://evil.example",
        });
        expect(res.status).toBe(403);
    });

    it("answers 429 at the cap", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        for (let i = 0; i < CAP; i++) {
            expect(
                (await call("GET", "/v1/test-only/rls", bearer(key.token)))
                    .status,
            ).toBe(200);
        }
        const over = await call("GET", "/v1/test-only/rls", bearer(key.token));
        expect(over.status).toBe(429);
        expect(over.body.error?.code).toBe("rate_limited");
        expect(over.headers["retry-after"]).toBeDefined();
    });

    it("notes lastUsedAt without waiting on it, at most once a minute", async () => {
        const org = await business();
        const key = await keyFor(org, "SECRET");
        await call("GET", "/v1/test-only/rls", bearer(key.token));
        let row = await prisma.apiKey.findUniqueOrThrow({
            where: { id: key.id },
        });
        // The write isn't awaited by the request: read until it lands.
        for (let i = 0; i < 200 && !row.lastUsedAt; i++) {
            row = await prisma.apiKey.findUniqueOrThrow({
                where: { id: key.id },
            });
        }
        const first = row.lastUsedAt;
        expect(first).not.toBeNull();
        await call("GET", "/v1/test-only/rls", bearer(key.token));
        // The second call is inside the minute: this replica writes nothing.
        for (let i = 0; i < 20; i++) {
            row = await prisma.apiKey.findUniqueOrThrow({
                where: { id: key.id },
            });
            expect(row.lastUsedAt).toEqual(first);
        }
    });
});

describe("ApiKeyGuard: publishable keys and storefront CORS", () => {
    const path = (token: string) =>
        `/v1/storefront/${token}/test-only/products`;

    it("answers a preflight from a listed origin and refuses an unlisted one", async () => {
        const org = await business();
        const pk = await keyFor(org, "PUBLISHABLE");
        const preflight = (origin: string) =>
            call("OPTIONS", path(pk.token), {
                origin,
                "access-control-request-method": "GET",
            });
        const listed = await preflight(SITE);
        expect(listed.headers["access-control-allow-origin"]).toBe(SITE);
        expect(
            listed.headers["access-control-allow-credentials"],
        ).toBeUndefined();
        const unlisted = await preflight("https://evil.example");
        expect(unlisted.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("reads from a listed origin, and refuses an unlisted origin's POST with 403", async () => {
        const org = await business();
        const pk = await keyFor(org, "PUBLISHABLE");
        const ok = await call("GET", path(pk.token), { origin: SITE });
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ organizationId: org.id });
        expect(ok.headers["access-control-allow-origin"]).toBe(SITE);
        // OriginGuard lets the storefront through; the key's list decides.
        expect(
            (await call("POST", path(pk.token), { origin: SITE })).status,
        ).toBe(201);
        expect(
            (
                await call("POST", path(pk.token), {
                    origin: "https://evil.example",
                })
            ).status,
        ).toBe(403);
    });

    it("refuses a secret key in the storefront's path", async () => {
        const org = await business();
        const sk = await keyFor(org, "SECRET");
        expect((await call("GET", path(sk.token))).status).toBe(401);
    });

    it("counts a visitor by CF-Connecting-IP; a spoofed X-Forwarded-For doesn't reset it", async () => {
        const org = await business();
        const pk = await keyFor(org, "PUBLISHABLE");
        const share = Math.floor(CAP / VISITOR_SHARE);
        for (let i = 0; i < share; i++) {
            expect(
                (
                    await call("GET", path(pk.token), {
                        "cf-connecting-ip": "203.0.113.7",
                        "x-forwarded-for": `198.51.100.${i}`,
                    })
                ).status,
            ).toBe(200);
        }
        const over = await call("GET", path(pk.token), {
            "cf-connecting-ip": "203.0.113.7",
            "x-forwarded-for": "198.51.100.99",
        });
        expect(over.status).toBe(429);
        // Another visitor has its own share.
        expect(
            (
                await call("GET", path(pk.token), {
                    "cf-connecting-ip": "203.0.113.8",
                })
            ).status,
        ).toBe(200);
    });
});
