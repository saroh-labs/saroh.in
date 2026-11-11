/**
 * API keys' rules with a mocked Prisma (plan 2026-11-10-001, U5). The rows,
 * the cap's count and a roll's grace against Postgres are in
 * api-keys.db.spec.ts.
 */
const db = {
    apiKey: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
    },
    organization: { findUniqueOrThrow: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
};
jest.mock("@saroh/database", () => ({ prisma: db }));

import { randomBytes } from "node:crypto";

import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { AuditService } from "../audit/audit.service";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";
import {
    ApiKeysService,
    base62,
    clampScope,
    displayPrefix,
    isUsable,
    STOREFRONT_SCOPE,
    TOKEN_PATTERN,
    tokenDigest,
} from "./api-keys.service";

const mutableEnv = env as { APIKEY_ENC_KEY?: string };
const keyBefore = mutableEnv.APIKEY_ENC_KEY;
beforeAll(() => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
    mutableEnv.APIKEY_ENC_KEY = keyBefore;
});

const ORG = "org_1";
const powersOf = (role: "OWNER" | "ADMIN") =>
    ORG_ACTIONS.filter((a) => can(role, a));
const ctxOf = (
    role: "OWNER" | "ADMIN",
    actions?: Iterable<string>,
): OrganizationContext =>
    ({
        organizationId: ORG,
        userId: `user_${role}`,
        role,
        roleKey: role,
        edition: "INDIA",
        actions: new Set(actions ?? powersOf(role)),
    }) as OrganizationContext;
const owner = ctxOf("OWNER");

// Fixture caps: obviously fake numbers, never a plan's.
function row(moduleId: string, limit: number | null): ModuleAccess {
    return {
        moduleId,
        state: "on",
        limit,
        per: "total",
        name: "API keys",
        plan: "Fixture plan",
        planId: "fixture",
        upgradeTo: "",
        upgradePlanId: "",
        upgradePricePaise: 0,
        upgradeUncapped: false,
    } as unknown as ModuleAccess;
}
function paidAccess(keysCap: number | boolean = 3) {
    return {
        source: "catalogue",
        entitlements: {
            "api-secret": 7777,
            "api-storefront": 7777,
            "api-keys": keysCap,
        },
        modules: [
            row("api-keys", typeof keysCap === "number" ? keysCap : null),
        ],
    };
}
const freeAccess = {
    source: "catalogue",
    entitlements: { "api-secret": false, "api-storefront": false },
    modules: [{ ...row("api-secret", null), state: "off" }],
};

const audit = { record: jest.fn().mockResolvedValue(undefined) };
const flags = { isEnabled: jest.fn() };
const access = { resolve: jest.fn() };
const service = new ApiKeysService(
    audit as unknown as AuditService,
    flags as unknown as FeatureFlagService,
    access as unknown as CatalogueAccessService,
);

const NOW = new Date("2026-11-10T10:00:00Z");
const HOUR = 60 * 60 * 1000;

function stored(over: Record<string, unknown> = {}) {
    return {
        id: "key_1",
        organizationId: ORG,
        createdByUserId: "user_OWNER",
        kind: "SECRET",
        edition: "INDIA",
        name: "Server",
        prefix: "sk_live_Ab3d",
        tokenDigest: "d",
        scope: ["order:read", "order:write"],
        allowedOrigins: [],
        aiEnabled: true,
        expiresAt: null,
        revokedAt: null,
        rolledFromId: null,
        graceUntil: null,
        lastUsedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    flags.isEnabled.mockResolvedValue(true);
    access.resolve.mockResolvedValue(paidAccess());
    db.apiKey.count.mockResolvedValue(0);
    db.apiKey.create.mockImplementation(({ data }) =>
        Promise.resolve(stored({ id: "key_new", ...data })),
    );
    db.apiKey.update.mockImplementation(({ data }) =>
        Promise.resolve(stored(data)),
    );
    db.apiKey.updateMany.mockResolvedValue({ count: 1 });
});

describe("tokens", () => {
    it("are 32 random bytes in base62 behind pk_live_ or sk_live_", () => {
        expect(base62(Buffer.alloc(32, 0xff))).toHaveLength(43);
        expect(base62(Buffer.alloc(32, 0))).toBe("0".repeat(43));
        expect(TOKEN_PATTERN.test(`sk_test_${"a".repeat(43)}`)).toBe(true);
        expect(displayPrefix(`pk_live_${"Qz".repeat(22)}`)).toBe(
            "pk_live_QzQz",
        );
    });
});

describe("making a key", () => {
    it("gives an owner the token once; the row keeps only its digest and prefix", async () => {
        const made = await service.create(
            owner,
            { kind: "SECRET", name: "Server", scope: ["order:read"] },
            NOW,
        );
        expect(made.token).toMatch(TOKEN_PATTERN);
        expect(made.token.startsWith("sk_live_")).toBe(true);
        const data = db.apiKey.create.mock.calls[0][0].data;
        expect(data.tokenDigest).toBe(tokenDigest(made.token));
        expect(data.prefix).toBe(made.token.slice(0, 12));
        expect(JSON.stringify(data)).not.toContain(made.token);
        expect(JSON.stringify(made.key)).not.toContain(made.token);
        expect(data).toMatchObject({
            organizationId: ORG,
            createdByUserId: "user_OWNER",
            edition: "INDIA",
            aiEnabled: false,
        });
    });

    it("refuses an admin with 403", async () => {
        await expect(
            service.create(ctxOf("ADMIN"), { kind: "SECRET", name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 403 });
        expect(db.apiKey.create).not.toHaveBeenCalled();
    });

    it("refuses a plan without the API with MODULE_LOCKED", async () => {
        access.resolve.mockResolvedValue(freeAccess);
        await expect(
            service.create(owner, { kind: "SECRET", name: "x" }, NOW),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "MODULE_LOCKED" } },
        });
    });

    it("refuses a business the catalogue doesn't reach: keys are paid only", async () => {
        access.resolve.mockResolvedValue({
            source: "legacy",
            entitlements: {},
        });
        await expect(
            service.create(owner, { kind: "PUBLISHABLE", name: "x" }, NOW),
        ).rejects.toMatchObject({
            response: { details: { code: "MODULE_LOCKED" } },
        });
    });

    it("answers 404 while the kind's kill switch is off", async () => {
        flags.isEnabled.mockResolvedValue(false);
        await expect(
            service.create(owner, { kind: "PUBLISHABLE", name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 404 });
        expect(flags.isEnabled).toHaveBeenCalledWith("API_STOREFRONT", ORG);
    });

    it("refuses one past the cap with PLAN_LIMIT_REACHED", async () => {
        db.apiKey.count.mockResolvedValue(3);
        await expect(
            service.create(
                owner,
                { kind: "SECRET", name: "x", scope: ["order:read"] },
                NOW,
            ),
        ).rejects.toMatchObject({
            status: 403,
            response: {
                details: {
                    code: "PLAN_LIMIT_REACHED",
                    limitKey: "api.keys.max",
                    limit: 3,
                    used: 3,
                },
            },
        });
        expect(db.apiKey.create).not.toHaveBeenCalled();
    });

    it("counts nothing when the plan sets no cap", async () => {
        access.resolve.mockResolvedValue(paidAccess(true));
        await service.create(
            owner,
            { kind: "SECRET", name: "x", scope: ["order:read"] },
            NOW,
        );
        expect(db.apiKey.count).not.toHaveBeenCalled();
    });

    it("clamps org:delete and apikey:manage out of a secret key's scope", async () => {
        await service.create(
            owner,
            {
                kind: "SECRET",
                name: "x",
                scope: ["org:delete", "apikey:manage", "order:read", "nope"],
            },
            NOW,
        );
        expect(db.apiKey.create.mock.calls[0][0].data.scope).toEqual([
            "order:read",
        ]);
    });

    it("refuses a secret key left with nothing it may do", async () => {
        await expect(
            service.create(
                owner,
                { kind: "SECRET", name: "x", scope: ["org:delete"] },
                NOW,
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("gives a storefront key its fixed scope, no AI switch, whatever was asked", async () => {
        const made = await service.create(
            owner,
            {
                kind: "PUBLISHABLE",
                name: "Site",
                scope: ["order:write"],
                aiEnabled: true,
                allowedOrigins: ["https://shop.in"],
            },
            NOW,
        );
        expect(made.token.startsWith("pk_live_")).toBe(true);
        const data = db.apiKey.create.mock.calls[0][0].data;
        expect(data.scope).toEqual([...STOREFRONT_SCOPE]);
        expect(data.aiEnabled).toBe(false);
        expect(data.allowedOrigins).toEqual(["https://shop.in"]);
    });

    it("refuses an expiry in the past", async () => {
        await expect(
            service.create(
                owner,
                {
                    kind: "SECRET",
                    name: "x",
                    scope: ["order:read"],
                    expiresAt: new Date(NOW.getTime() - HOUR).toISOString(),
                },
                NOW,
            ),
        ).rejects.toMatchObject({ status: 400 });
    });
});

describe("rolling a key", () => {
    it("re-clamps the scope to the rolling owner, who becomes its creator, and gives the old 24 h", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored());
        // A second owner whose role no longer holds order:write.
        const second = {
            ...ctxOf(
                "OWNER",
                powersOf("OWNER").filter((a) => a !== "order:write"),
            ),
            userId: "user_second",
        };
        const rolled = await service.roll(second, "key_1", NOW);
        expect(rolled.token).toMatch(TOKEN_PATTERN);
        expect(db.apiKey.updateMany).toHaveBeenCalledWith({
            where: { id: "key_1", graceUntil: null, revokedAt: null },
            data: { graceUntil: new Date(NOW.getTime() + 24 * HOUR) },
        });
        expect(db.apiKey.create.mock.calls[0][0].data).toMatchObject({
            createdByUserId: "user_second",
            scope: ["order:read"],
            aiEnabled: true,
            rolledFromId: "key_1",
        });
    });

    it("refuses a key already in grace, or revoked, with 409", async () => {
        db.apiKey.findFirst.mockResolvedValue(
            stored({ graceUntil: new Date(NOW.getTime() + HOUR) }),
        );
        await expect(service.roll(owner, "key_1", NOW)).rejects.toMatchObject({
            status: 409,
        });
        db.apiKey.findFirst.mockResolvedValue(stored({ revokedAt: NOW }));
        await expect(service.roll(owner, "key_1", NOW)).rejects.toMatchObject({
            status: 409,
        });
        expect(db.apiKey.create).not.toHaveBeenCalled();
    });

    it("answers 404 for another business's key", async () => {
        db.apiKey.findFirst.mockResolvedValue(null);
        await expect(service.roll(owner, "key_x", NOW)).rejects.toMatchObject({
            status: 404,
        });
        expect(db.apiKey.findFirst).toHaveBeenCalledWith({
            where: { id: "key_x", organizationId: ORG },
        });
    });
});

describe("when a key opens anything", () => {
    const base = { revokedAt: null, expiresAt: null, graceUntil: null };
    it("works until its grace ends, its expiry passes or it is revoked", () => {
        const later = new Date(NOW.getTime() + HOUR);
        expect(isUsable(base, NOW)).toBe(true);
        expect(isUsable({ ...base, graceUntil: later }, NOW)).toBe(true);
        expect(isUsable({ ...base, graceUntil: later }, later)).toBe(false);
        expect(isUsable({ ...base, expiresAt: later }, later)).toBe(false);
        expect(
            isUsable({ ...base, graceUntil: later, revokedAt: NOW }, NOW),
        ).toBe(false);
    });

    it("never looks up a token not shaped like a key", async () => {
        await expect(
            service.findUsableByToken("Bearer nonsense"),
        ).resolves.toBeNull();
        expect(db.apiKey.findUnique).not.toHaveBeenCalled();
    });
});

describe("the audit trail", () => {
    it("records make, roll and revoke, never the token", async () => {
        const made = await service.create(
            owner,
            { kind: "SECRET", name: "x", scope: ["order:read"] },
            NOW,
        );
        db.apiKey.findFirst.mockResolvedValue(stored());
        const rolled = await service.roll(owner, "key_1", NOW);
        await service.revoke(owner, "key_1", NOW);
        expect(audit.record.mock.calls.map(([e]) => e.action)).toEqual([
            "apikey.created",
            "apikey.rolled",
            "apikey.revoked",
        ]);
        const written = JSON.stringify(audit.record.mock.calls);
        expect(written).not.toContain(made.token);
        expect(written).not.toContain(rolled.token);
        expect(written).not.toContain("tokenDigest");
    });

    it("revoking a revoked key writes nothing", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored({ revokedAt: NOW }));
        await service.revoke(owner, "key_1", NOW);
        expect(db.apiKey.update).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
    });
});

describe("editing a key", () => {
    it("changes only the name, and audits the name before", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored());
        const view = await service.update(
            owner,
            "key_1",
            { name: "Stock sync" },
            NOW,
        );
        expect(db.apiKey.update).toHaveBeenCalledWith({
            where: { id: "key_1" },
            data: { name: "Stock sync" },
        });
        expect(view.name).toBe("Stock sync");
        expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "apikey.renamed",
                targetId: "key_1",
                metadata: expect.objectContaining({ previousName: "Server" }),
            }),
        );
    });

    it("refuses an admin with 403 and another business's key with 404", async () => {
        await expect(
            service.update(ctxOf("ADMIN"), "key_1", { name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 403 });
        db.apiKey.findFirst.mockResolvedValue(null);
        await expect(
            service.update(owner, "key_1", { name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 404 });
        expect(db.apiKey.update).not.toHaveBeenCalled();
    });

    it("changes what a secret key can do, clamped to the editor, and audits before and after", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored());
        const admin = ctxOf("OWNER", ["apikey:manage", "order:read"]);
        await service.update(
            admin,
            "key_1",
            {
                scope: ["order:read", "customer:write", "org:delete"],
                aiEnabled: false,
            },
            NOW,
        );
        expect(db.apiKey.update).toHaveBeenCalledWith({
            where: { id: "key_1" },
            data: { scope: ["order:read"], aiEnabled: false },
        });
        expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "apikey.updated",
                metadata: expect.objectContaining({
                    scopeBefore: "order:read order:write",
                }),
            }),
        );
    });

    it("refuses a secret key left with nothing it may do", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored());
        await expect(
            service.update(owner, "key_1", { scope: ["nope"] }, NOW),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("keeps a website key read-only: only its websites change", async () => {
        db.apiKey.findFirst.mockResolvedValue(
            stored({
                kind: "PUBLISHABLE",
                scope: [...STOREFRONT_SCOPE],
                aiEnabled: false,
                allowedOrigins: ["https://a.example.com"],
            }),
        );
        await service.update(
            owner,
            "key_1",
            {
                scope: ["order:write"],
                aiEnabled: true,
                allowedOrigins: ["https://b.example.com"],
            },
            NOW,
        );
        expect(db.apiKey.update).toHaveBeenCalledWith({
            where: { id: "key_1" },
            data: { allowedOrigins: ["https://b.example.com"] },
        });
    });

    it("refuses a revoked or replaced key with 409", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored({ revokedAt: NOW }));
        await expect(
            service.update(owner, "key_1", { name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 409 });
        db.apiKey.findFirst.mockResolvedValue(
            stored({ graceUntil: new Date(NOW.getTime() + HOUR) }),
        );
        await expect(
            service.update(owner, "key_1", { name: "x" }, NOW),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("writes nothing when the name is the same", async () => {
        db.apiKey.findFirst.mockResolvedValue(stored());
        await service.update(owner, "key_1", { name: "Server" }, NOW);
        expect(db.apiKey.update).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
    });
});

describe("clampScope", () => {
    it("keeps only what the creator holds now", () => {
        const narrow = ctxOf("OWNER", ["order:read"]);
        expect(clampScope(narrow, ["order:read", "order:write"])).toEqual([
            "order:read",
        ]);
    });
});
