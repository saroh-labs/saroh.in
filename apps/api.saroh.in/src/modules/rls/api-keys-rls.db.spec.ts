import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on the public API and MCP tables (plan 2026-11-10-001,
 * U3, migration `20270201140000_api_keys_webhooks_mcp`), over a NOBYPASSRLS
 * role: one business reads none of another's keys, storefront tokens,
 * webhooks, deliveries, MCP activity or restore points. Runs only in RLS mode
 * (`TEST_RLS=on`).
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const later = () => new Date(Date.now() + 3_600_000);

async function businessWithRows(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("api-keys-rls") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("api-keys")}@example.com`, name: "Meera" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name, slug: uniq("api-keys-site") },
    });
    const organizationId = org.id;
    const key = await prisma.apiKey.create({
        data: {
            organizationId,
            createdByUserId: user.id,
            kind: "SECRET",
            edition: "INDIA",
            name: "Server",
            prefix: "sk_test_",
            tokenDigest: uniq("digest"),
            scope: ["products:read"],
            allowedOrigins: [],
        },
    });
    const token = await prisma.storefrontToken.create({
        data: {
            organizationId,
            apiKeyId: key.id,
            tokenDigest: uniq("sf-digest"),
            allowedOrigins: ["https://example.com"],
            expiresAt: later(),
        },
    });
    const endpoint = await prisma.webhookEndpoint.create({
        data: {
            organizationId,
            createdByUserId: user.id,
            url: "https://example.com/hook",
            events: ["order.created"],
            secretCiphertext: "c",
            secretIv: "i",
            secretAuthTag: "t",
        },
    });
    const delivery = await prisma.webhookDelivery.create({
        data: {
            organizationId,
            endpointId: endpoint.id,
            event: "order.created",
            payload: { id: "ORD-001" },
        },
    });
    const activity = await prisma.mcpActivity.create({
        data: {
            organizationId,
            userId: user.id,
            clientName: "Claude",
            tool: "get_site",
            summary: "Read the site",
        },
    });
    const restorePoint = await prisma.siteRestorePoint.create({
        data: {
            organizationId,
            siteId: site.id,
            connectionId: key.id,
            sessionStartedAt: new Date(),
            snapshot: { pages: [] },
        },
    });
    return {
        orgId: org.id,
        userId: user.id,
        keyId: key.id,
        tokenId: token.id,
        endpointId: endpoint.id,
        deliveryId: delivery.id,
        activityId: activity.id,
        restorePointId: restorePoint.id,
    };
}

type Rows = Awaited<ReturnType<typeof businessWithRows>>;

/** Each new table, with the id of `r`'s row in it. */
const tables: [string, (r: Rows) => string][] = [
    ["apiKey", (r) => r.keyId],
    ["storefrontToken", (r) => r.tokenId],
    ["webhookEndpoint", (r) => r.endpointId],
    ["webhookDelivery", (r) => r.deliveryId],
    ["mcpActivity", (r) => r.activityId],
    ["siteRestorePoint", (r) => r.restorePointId],
];

type Delegate = {
    findMany: (args: object) => Promise<{ id: string }[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
};
const delegate = (name: string) =>
    (prisma as unknown as Record<string, Delegate>)[name];

describeRls("row-level security on the public API and MCP tables", () => {
    let a: Rows;
    let b: Rows;

    beforeAll(async () => {
        a = await businessWithRows("Rye & Co.");
        b = await businessWithRows("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it.each(tables)(
        "%s: a business reads only its own row, none of another's",
        async (name, id) => {
            const seen = await runInOrgContext(a.orgId, () =>
                delegate(name).findMany({
                    where: { id: { in: [id(a), id(b)] } },
                    select: { id: true },
                }),
            );
            expect(seen).toEqual([{ id: id(a) }]);
            const deleted = await runInOrgContext(a.orgId, () =>
                delegate(name).deleteMany({ where: { id: id(b) } }),
            );
            expect(deleted.count).toBe(0);
        },
    );

    it("can't write a key into another business", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.apiKey.create({
                    data: {
                        organizationId: b.orgId,
                        createdByUserId: a.userId,
                        kind: "PUBLISHABLE",
                        edition: "INDIA",
                        name: "Sneaky",
                        prefix: "pk_test_",
                        tokenDigest: uniq("digest"),
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });

    it("refuses a second key with the same token digest", async () => {
        const existing = await prisma.apiKey.findUniqueOrThrow({
            where: { id: a.keyId },
        });
        await expect(
            prisma.apiKey.create({
                data: {
                    organizationId: a.orgId,
                    createdByUserId: a.userId,
                    kind: "SECRET",
                    edition: "INDIA",
                    name: "Twin",
                    prefix: "sk_test_",
                    tokenDigest: existing.tokenDigest,
                },
            }),
        ).rejects.toThrow(/Unique constraint/);
    });
});
