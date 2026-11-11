/**
 * Settings › API and AI apps › Usage against a real Postgres (U14): the
 * counts are this business's working keys and its addresses, the minute's
 * calls are its own windows, and a Member reads the AI row only. Caps,
 * plan rows and switches are fixtures (obviously fake numbers). Runs in
 * the integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";
import type { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { ApiUsageService } from "./api-usage.service";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const NOW = new Date("2027-01-04T10:00:00.000Z");
const FAKE_RPM = 7777;
const entitlements: Record<string, number | boolean> = {
    "api-secret": FAKE_RPM,
    "api-storefront": FAKE_RPM,
    "api-keys": 3,
    webhooks: true,
};
const access = {
    resolve: jest.fn(async () => ({ source: "legacy", entitlements })),
};
const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
const caps = { rpm: jest.fn().mockResolvedValue(FAKE_RPM) };
const limits = new LimitsService(null);
const service = new ApiUsageService(
    caps as unknown as CapsService,
    limits,
    flags as unknown as FeatureFlagService,
    access as unknown as CatalogueAccessService,
);

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye") },
    });
    const person = async (
        role: "OWNER" | "MEMBER",
    ): Promise<OrganizationContext> => {
        const user = await prisma.user.create({
            data: { email: `${uniq(role)}@example.com`, name: role },
        });
        return {
            organizationId: org.id,
            userId: user.id,
            role,
            roleKey: role,
            actions: new Set(ORG_ACTIONS.filter((a) => can(role, a))),
        };
    };
    return {
        org,
        owner: await person("OWNER"),
        member: await person("MEMBER"),
    };
}

function key(organizationId: string, userId: string, extra = {}) {
    return prisma.apiKey.create({
        data: {
            organizationId,
            createdByUserId: userId,
            kind: "SECRET",
            edition: "INDIA",
            name: "Stock sync",
            prefix: "sk_live_abcd",
            tokenDigest: randomBytes(16).toString("hex"),
            scope: ["store:read"],
            allowedOrigins: [],
            ...extra,
        },
    });
}

describe("ApiUsageService (Postgres)", () => {
    it("gives an Owner the working keys, the addresses and each surface's minute", async () => {
        const { org, owner } = await business();
        await key(org.id, owner.userId);
        await key(org.id, owner.userId, {
            graceUntil: new Date(NOW.getTime() + 60_000),
        });
        await key(org.id, owner.userId, { revokedAt: NOW });
        await prisma.webhookEndpoint.create({
            data: {
                organizationId: org.id,
                createdByUserId: owner.userId,
                url: "https://hooks.example.com/saroh",
                events: ["order.paid"],
                secretCiphertext: "x",
                secretIv: "x",
                secretAuthTag: "x",
            },
        });
        for (let i = 0; i < 2; i++)
            await limits.take(
                "secret",
                `org:${org.id}`,
                FAKE_RPM,
                NOW.getTime(),
            );

        const view = await service.read(owner, NOW);

        expect(view.keys).toEqual({
            kinds: ["SECRET", "PUBLISHABLE"],
            open: ["SECRET", "PUBLISHABLE"],
            count: 2,
            cap: 3,
        });
        expect(view.webhooks).toEqual({ open: true, count: 1, cap: null });
        expect(view.minute).toEqual([
            { scope: "mcp", used: 0, cap: FAKE_RPM },
            { scope: "secret", used: 2, cap: FAKE_RPM },
            { scope: "storefront", used: 0, cap: FAKE_RPM },
        ]);
    });

    it("gives a Member the AI row only", async () => {
        const { member } = await business();
        const view = await service.read(member, NOW);
        expect(view.minute.map((m) => m.scope)).toEqual(["mcp"]);
        expect(view.keys).toBeNull();
        expect(view.webhooks).toBeNull();
    });

    it("locks keys and webhooks on a plan without them", async () => {
        const { owner } = await business();
        access.resolve.mockResolvedValueOnce({
            source: "legacy",
            entitlements: {},
        });
        const view = await service.read(owner, NOW);
        expect(view.keys).toMatchObject({ open: [], cap: 0 });
        expect(view.webhooks).toMatchObject({ open: false, cap: 0 });
    });
});
