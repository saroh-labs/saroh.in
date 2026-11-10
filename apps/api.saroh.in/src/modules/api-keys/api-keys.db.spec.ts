/**
 * API keys against a real Postgres (plan 2026-11-10-001, U5): what a row
 * keeps, the cap's count with keys in grace, a roll's 24 hours and a
 * revoke ending a key at once. The plan's answer and the kill switches are
 * fixtures (obviously fake numbers); their reading is in the unit spec.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { AuditService } from "../audit/audit.service";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";
import { ApiKeysService, ROLL_GRACE_MS, tokenDigest } from "./api-keys.service";

const mutableEnv = env as { APIKEY_ENC_KEY?: string };
const keyBefore = mutableEnv.APIKEY_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 3;
const access = {
    resolve: jest.fn().mockResolvedValue({
        source: "catalogue",
        entitlements: {
            "api-secret": 7777,
            "api-storefront": 7777,
            "api-keys": CAP,
        },
        modules: [
            {
                moduleId: "api-keys",
                state: "on",
                limit: CAP,
                per: "total",
                name: "API keys",
                plan: "Fixture plan",
                planId: "fixture",
                upgradeTo: "",
                upgradePlanId: "",
                upgradePricePaise: 0,
                upgradeUncapped: false,
            },
        ],
    }),
};
const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
const service = new ApiKeysService(
    new AuditService(),
    flags as unknown as FeatureFlagService,
    access as unknown as CatalogueAccessService,
);

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), edition: "GLOBAL" },
    });
    const person = async (label: string): Promise<OrganizationContext> => {
        const user = await prisma.user.create({
            data: { email: `${uniq(label)}@example.com`, name: label },
        });
        return {
            organizationId: org.id,
            userId: user.id,
            role: "OWNER",
            roleKey: "OWNER",
            actions: new Set(ORG_ACTIONS.filter((a) => can("OWNER", a))),
        };
    };
    return { org, owner: await person("owner"), person };
}

const secret = (name = "Server") => ({
    kind: "SECRET" as const,
    name,
    scope: ["order:read", "order:write"],
});

const NOW = new Date();
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("API keys (U5)", () => {
    beforeAll(() => {
        // A throwaway key for this run only, never a value in the repo.
        mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
    });
    afterAll(() => {
        mutableEnv.APIKEY_ENC_KEY = keyBefore;
    });

    it("keeps only the digest and prefix, in the business's edition, and the token opens it", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, secret(), NOW);

        const row = await prisma.apiKey.findUniqueOrThrow({
            where: { id: made.key.id },
        });
        expect(row.tokenDigest).toBe(tokenDigest(made.token));
        expect(row.prefix).toBe(made.token.slice(0, 12));
        expect(row.edition).toBe("GLOBAL");
        expect(row.organizationId).toBe(org.id);
        expect(JSON.stringify(row)).not.toContain(made.token);

        const found = await service.findUsableByToken(made.token, NOW);
        expect(found?.id).toBe(made.key.id);
        const list = await service.list(owner);
        expect(list.data.map((k) => k.id)).toEqual([made.key.id]);
        expect(JSON.stringify(list)).not.toContain(made.token);
    });

    it("counts keys in grace toward the cap, never revoked ones", async () => {
        const { owner } = await business();
        const first = await service.create(owner, secret("a"), NOW);
        await service.create(owner, secret("b"), NOW);
        await service.roll(owner, first.key.id, NOW); // a in grace + its new key
        await expect(
            service.create(owner, secret("c"), NOW),
        ).rejects.toMatchObject({
            response: { details: { code: "PLAN_LIMIT_REACHED", used: CAP } },
        });

        await service.revoke(owner, first.key.id, NOW);
        await expect(
            service.create(owner, secret("c"), NOW),
        ).resolves.toBeDefined();
    });

    it("keeps a rolled key working for 24 hours, then not; the new one works at once", async () => {
        const { owner, person } = await business();
        const made = await service.create(owner, secret(), NOW);
        const second = await person("second");
        second.actions = new Set(
            [...(second.actions ?? [])].filter((a) => a !== "order:write"),
        );

        const rolled = await service.roll(second, made.key.id, NOW);
        expect(rolled.key.createdByUserId).toBe(second.userId);
        expect(rolled.key.scope).toEqual(["order:read"]);
        expect(rolled.key.rolledFromId).toBe(made.key.id);

        expect(
            await service.findUsableByToken(made.token, at(1000)),
        ).not.toBeNull();
        expect(
            await service.findUsableByToken(made.token, at(ROLL_GRACE_MS - 1)),
        ).not.toBeNull();
        expect(
            await service.findUsableByToken(made.token, at(ROLL_GRACE_MS)),
        ).toBeNull();
        expect(
            (await service.findUsableByToken(rolled.token, at(1000)))?.id,
        ).toBe(rolled.key.id);

        await expect(
            service.roll(owner, made.key.id, at(1000)),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("ends a key in grace at once when it is revoked", async () => {
        const { owner } = await business();
        const made = await service.create(owner, secret(), NOW);
        await service.roll(owner, made.key.id, NOW);
        await service.revoke(owner, made.key.id, at(1000));
        expect(
            await service.findUsableByToken(made.token, at(2000)),
        ).toBeNull();
    });

    it("ends a revoked key on the next call", async () => {
        const { owner } = await business();
        const made = await service.create(owner, secret(), NOW);
        await service.revoke(owner, made.key.id, NOW);
        expect(await service.findUsableByToken(made.token, at(1))).toBeNull();
    });

    it("never reaches another business's key", async () => {
        const a = await business();
        const b = await business();
        const made = await service.create(a.owner, secret(), NOW);
        await expect(
            service.revoke(b.owner, made.key.id, NOW),
        ).rejects.toMatchObject({ status: 404 });
        expect((await service.list(b.owner)).data).toEqual([]);
    });

    it("writes an audit event for each make, roll and revoke", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, secret(), NOW);
        const rolled = await service.roll(owner, made.key.id, NOW);
        await service.revoke(owner, rolled.key.id, NOW);

        const events = await prisma.auditEvent.findMany({
            where: { organizationId: org.id },
            orderBy: { createdAt: "asc" },
        });
        expect(events.map((e) => [e.action, e.targetId])).toEqual([
            ["apikey.created", made.key.id],
            ["apikey.rolled", rolled.key.id],
            ["apikey.revoked", rolled.key.id],
        ]);
        const written = JSON.stringify(events);
        expect(written).not.toContain(made.token);
        expect(written).not.toContain(rolled.token);
    });
});
